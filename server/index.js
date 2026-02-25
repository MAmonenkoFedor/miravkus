import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { Pool } from "pg";
import {
  randomInt,
  randomUUID,
  createHash,
  timingSafeEqual,
  randomBytes,
  scryptSync,
} from "crypto";
import { z } from "zod";
import { pathToFileURL } from "url";

const app = express();

const basePort = Number.parseInt(process.env.BACKEND_PORT ?? process.env.PORT ?? "8081", 10);
const allowedOrigins = (process.env.BACKEND_ALLOWED_ORIGIN ??
  "http://localhost:4173,http://localhost:5173,http://localhost:8080")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const uploadRoot = path.resolve(process.cwd(), "uploads");
const productImagesDir = path.join(uploadRoot, "product-images");
const articleCoversDir = path.join(uploadRoot, "article-covers");

[uploadRoot, productImagesDir, articleCoversDir].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

app.use("/uploads", express.static(uploadRoot));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    })
  : new Pool({
      host: process.env.PGHOST ?? "localhost",
      port: Number.parseInt(process.env.PGPORT ?? "5432", 10),
      user: process.env.PGUSER ?? "postgres",
      password: process.env.PGPASSWORD ?? "postgres",
      database: process.env.PGDATABASE ?? "postgres",
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    });

const authTokenSecret = process.env.AUTH_TOKEN_SECRET ?? "dev-secret";
const sessionTtlMs = Number.parseInt(process.env.AUTH_SESSION_TTL_MS ?? "2592000000", 10);

const payments = new Map();
const deliveries = new Map();
const smsRequests = new Map();
const smsRateLimits = new Map();
const smsPhoneIndex = new Map();

const smsOtpTtlMs = Number.parseInt(process.env.SMS_OTP_TTL_MS ?? "300000", 10);
const smsMaxAttempts = Number.parseInt(process.env.SMS_OTP_MAX_ATTEMPTS ?? "5", 10);
const smsRateLimitWindowMs = Number.parseInt(process.env.SMS_OTP_RATE_WINDOW_MS ?? "600000", 10);
const smsRateLimitMax = Number.parseInt(process.env.SMS_OTP_RATE_MAX ?? "3", 10);
const smsOtpSecret = process.env.SMS_OTP_SECRET ?? "dev-secret";

const normalizePhone = (value) => {
  const raw = value.trim();
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) {
    return null;
  }
  return `${hasPlus ? "+" : ""}${digits}`;
};

const maskPhone = (phone) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) {
    return phone;
  }
  const tail = digits.slice(-2);
  const head = digits.slice(0, 2);
  return `${head}${"*".repeat(Math.max(0, digits.length - 4))}${tail}`;
};

const hashOtp = (otp) =>
  createHash("sha256").update(`${otp}:${smsOtpSecret}`).digest("hex");

const safeEqual = (a, b) => {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
};

const hashToken = (token) =>
  createHash("sha256").update(`${token}:${authTokenSecret}`).digest("hex");

const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  if (!stored) {
    return false;
  }
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }
  const computed = scryptSync(password, salt, 64).toString("hex");
  return safeEqual(computed, hash);
};

const parseBearerToken = (req) => {
  const header = req.headers.authorization;
  if (!header) {
    return null;
  }
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) {
    return null;
  }
  return token.trim();
};

const asyncHandler =
  (handler) =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

const toNumber = (value) => {
  if (value === null || value === undefined) {
    return value;
  }
  return Number(value);
};

const pruneRateLimits = (timestamps) => {
  const now = Date.now();
  return timestamps.filter((ts) => now - ts <= smsRateLimitWindowMs);
};

const paymentCreateSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(1).default("RUB"),
});

const paymentWebhookSchema = z.object({
  paymentId: z.string().min(1),
  status: z.enum(["pending", "succeeded", "failed", "canceled"]),
  providerPayload: z.record(z.unknown()).optional(),
});

const deliveryQuoteSchema = z.object({
  orderId: z.string().min(1),
  address: z.object({
    city: z.string().min(1),
    street: z.string().min(1),
    building: z.string().min(1),
    apartment: z.string().optional(),
    postalCode: z.string().optional(),
  }),
  items: z.array(
    z.object({
      sku: z.string().min(1),
      quantity: z.number().int().positive(),
      weightGrams: z.number().int().positive().optional(),
    }),
  ),
});

const deliveryCreateSchema = z.object({
  orderId: z.string().min(1),
  quoteId: z.string().min(1),
  address: z.object({
    city: z.string().min(1),
    street: z.string().min(1),
    building: z.string().min(1),
    apartment: z.string().optional(),
    postalCode: z.string().optional(),
  }),
});

const deliveryWebhookSchema = z.object({
  deliveryId: z.string().min(1),
  status: z.enum(["new", "processing", "shipped", "delivered", "failed"]),
  providerPayload: z.record(z.unknown()).optional(),
});

const smsRequestSchema = z.object({
  phone: z.string().min(6),
  purpose: z.string().min(1).optional(),
});

const smsVerifySchema = z.object({
  requestId: z.string().min(1),
  phone: z.string().min(6),
  code: z.string().min(4),
});

const smsWebhookSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["queued", "sent", "delivered", "failed"]).optional(),
  providerPayload: z.record(z.unknown()).optional(),
});

const authLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const authOtpRequestSchema = z.object({
  phone: z.string().min(6),
});

const authOtpVerifySchema = z.object({
  requestId: z.string().min(1),
  phone: z.string().min(6),
  code: z.string().min(4),
});

const query = (text, params) => pool.query(text, params);

const ensureSchema = async () => {
  await query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT,
      name TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash TEXT NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS otp_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      image TEXT,
      emoji TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      price NUMERIC NOT NULL,
      old_price NUMERIC,
      images TEXT[],
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      product_type TEXT,
      in_stock BOOLEAN DEFAULT true,
      stock_count INTEGER,
      rating NUMERIC DEFAULT 0,
      reviews_count INTEGER DEFAULT 0,
      is_premium BOOLEAN DEFAULT false,
      is_new BOOLEAN DEFAULT false,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title TEXT`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description TEXT`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_keywords TEXT`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_text TEXT`);
  await query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Новый',
      total_price NUMERIC NOT NULL,
      delivery_price NUMERIC NOT NULL DEFAULT 0,
      delivery_method TEXT,
      payment_method TEXT,
      address TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_image TEXT,
      price NUMERIC NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
      rating INTEGER NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      author_name TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS banners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      subtitle TEXT,
      discount TEXT,
      image TEXT,
      link_url TEXT,
      link_text TEXT,
      variant TEXT DEFAULT 'default',
      position TEXT,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hero_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      badge TEXT,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS articles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      category TEXT DEFAULT '',
      excerpt TEXT,
      content TEXT,
      cover_image TEXT,
      meta_title TEXT,
      meta_description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      related_product_ids TEXT[],
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      content TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
};

const ensureUserRole = async (userId, role) => {
  await query(
    `
      INSERT INTO user_roles (user_id, role)
      SELECT $1, $2
      WHERE NOT EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2
      )
    `,
    [userId, role],
  );
};

const ensureProfile = async (userId, phone, name) => {
  await query(
    `
      INSERT INTO profiles (id, phone, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, name = COALESCE(EXCLUDED.name, profiles.name)
    `,
    [userId, phone ?? null, name ?? null],
  );
};

const ensureAdminUser = async () => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    return;
  }
  const existing = await query(`SELECT id FROM users WHERE email = $1`, [adminEmail]);
  let userId = existing.rows[0]?.id;
  if (!userId) {
    const passwordHash = hashPassword(adminPassword);
    const inserted = await query(
      `
        INSERT INTO users (email, password_hash)
        VALUES ($1, $2)
        RETURNING id
      `,
      [adminEmail, passwordHash],
    );
    userId = inserted.rows[0]?.id;
  }
  await ensureProfile(userId, null, "Администратор");
  await ensureUserRole(userId, "admin");
};

const createSession = async (userId) => {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  await query(
    `
      INSERT INTO auth_sessions (token_hash, user_id, expires_at)
      VALUES ($1, $2, $3)
    `,
    [tokenHash, userId, expiresAt],
  );
  return token;
};

const loadUserFromToken = async (token) => {
  if (!token) {
    return null;
  }
  const tokenHash = hashToken(token);
  const { rows } = await query(
    `
      SELECT u.id, u.email, u.phone
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()
      LIMIT 1
    `,
    [tokenHash],
  );
  return rows[0] ?? null;
};

const loadRoles = async (userId) => {
  const { rows } = await query(`SELECT role FROM user_roles WHERE user_id = $1`, [userId]);
  return rows.map((row) => row.role);
};

const mapProduct = (row) => ({
  ...row,
  price: toNumber(row.price),
  old_price: toNumber(row.old_price),
  rating: toNumber(row.rating),
  reviews_count: toNumber(row.reviews_count),
  stock_count: toNumber(row.stock_count),
  sort_order: toNumber(row.sort_order),
});

const mapOrder = (row) => ({
  ...row,
  total_price: toNumber(row.total_price),
  delivery_price: toNumber(row.delivery_price),
});

const mapOrderItem = (row) => ({
  ...row,
  price: toNumber(row.price),
  quantity: toNumber(row.quantity),
});

const mapCategory = (row) => ({
  ...row,
  sort_order: toNumber(row.sort_order),
  product_count: row.product_count !== undefined ? toNumber(row.product_count) : undefined,
});

const mapBanner = (row) => ({
  ...row,
  sort_order: toNumber(row.sort_order),
});

const mapHero = (row) => ({
  ...row,
  sort_order: toNumber(row.sort_order),
});

const mapReview = (row) => ({
  ...row,
  rating: toNumber(row.rating),
});

const normalizeCategoryIds = (input) => {
  if (!Array.isArray(input)) {
    return [];
  }
  const ids = input
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(ids)];
};

const mapStats = (row) => ({
  totalProducts: toNumber(row.total_products),
  totalOrders: toNumber(row.total_orders),
  totalCategories: toNumber(row.total_categories),
  totalRevenue: toNumber(row.total_revenue),
});

const recalculateProductRating = async (productId) => {
  const { rows } = await query(
    `
      SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0) AS avg
      FROM reviews
      WHERE product_id = $1 AND status = 'published'
    `,
    [productId],
  );
  const count = rows[0]?.count ?? 0;
  const avg = rows[0]?.avg ?? 0;
  await query(
    `
      UPDATE products
      SET reviews_count = $2, rating = $3, updated_at = now()
      WHERE id = $1
    `,
    [productId, count, avg],
  );
};

const requireAuth = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
};

const requireRole = (role) => (req, res, next) => {
  if (!req.roles?.includes(role)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
};

app.use(
  asyncHandler(async (req, _res, next) => {
    const token = parseBearerToken(req);
    if (!token) {
      next();
      return;
    }
    const user = await loadUserFromToken(token);
    if (!user) {
      next();
      return;
    }
    req.user = user;
    req.roles = await loadRoles(user.id);
    next();
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

const uploadStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const target = file.fieldname === "article_cover" ? articleCoversDir : productImagesDir;
    cb(null, target);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const upload = multer({ storage: uploadStorage });

const buildFileUrl = (req, filePath) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}${filePath.startsWith("/") ? filePath : `/${filePath}`}`;
};

app.post(
  "/api/uploads/product-image",
  requireAuth,
  requireRole("admin"),
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "file_missing" });
      return;
    }
    const relativePath = `/uploads/product-images/${req.file.filename}`;
    res.json({ url: buildFileUrl(req, relativePath) });
  },
);

app.post(
  "/api/uploads/article-cover",
  requireAuth,
  requireRole("admin"),
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "file_missing" });
      return;
    }
    const relativePath = `/uploads/article-covers/${req.file.filename}`;
    res.json({ url: buildFileUrl(req, relativePath) });
  },
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const parsed = authLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const { rows } = await query(`SELECT id, email, phone, password_hash FROM users WHERE email = $1`, [
      parsed.data.email,
    ]);
    const user = rows[0];
    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    const token = await createSession(user.id);
    const roles = await loadRoles(user.id);
    res.json({ token, user: { id: user.id, email: user.email, phone: user.phone }, roles });
  }),
);

app.post(
  "/api/auth/otp/request",
  asyncHandler(async (req, res) => {
    const parsed = authOtpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const normalizedPhone = normalizePhone(parsed.data.phone);
    if (!normalizedPhone) {
      res.status(400).json({ error: "invalid_phone" });
      return;
    }
    const otp = randomInt(0, 1000000).toString().padStart(6, "0");
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + smsOtpTtlMs);
    const { rows } = await query(
      `
        INSERT INTO otp_requests (phone, otp_hash, expires_at)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [normalizedPhone, otpHash, expiresAt],
    );
    res.json({ requestId: rows[0].id });
  }),
);

app.post(
  "/api/auth/otp/verify",
  asyncHandler(async (req, res) => {
    const parsed = authOtpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const normalizedPhone = normalizePhone(parsed.data.phone);
    if (!normalizedPhone) {
      res.status(400).json({ error: "invalid_phone" });
      return;
    }
    const { rows } = await query(
      `
        SELECT id, otp_hash, attempts, expires_at
        FROM otp_requests
        WHERE id = $1 AND phone = $2
      `,
      [parsed.data.requestId, normalizedPhone],
    );
    const request = rows[0];
    if (!request) {
      res.status(404).json({ error: "request_not_found" });
      return;
    }
    if (new Date(request.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: "otp_expired" });
      return;
    }
    if (request.attempts >= smsMaxAttempts) {
      res.status(429).json({ error: "otp_attempts_exceeded" });
      return;
    }
    const codeHash = hashOtp(parsed.data.code.trim());
    if (!safeEqual(codeHash, request.otp_hash)) {
      await query(`UPDATE otp_requests SET attempts = attempts + 1 WHERE id = $1`, [request.id]);
      res.status(400).json({ error: "otp_invalid" });
      return;
    }
    await query(`DELETE FROM otp_requests WHERE id = $1`, [request.id]);
    const existingUser = await query(`SELECT id, phone FROM users WHERE phone = $1`, [normalizedPhone]);
    let userId = existingUser.rows[0]?.id;
    if (!userId) {
      const inserted = await query(
        `
          INSERT INTO users (phone)
          VALUES ($1)
          RETURNING id
        `,
        [normalizedPhone],
      );
      userId = inserted.rows[0].id;
    }
    await ensureProfile(userId, normalizedPhone, null);
    await ensureUserRole(userId, "user");
    const token = await createSession(userId);
    const roles = await loadRoles(userId);
    res.json({ token, user: { id: userId, phone: normalizedPhone }, roles });
  }),
);

app.get(
  "/api/auth/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const roles = await loadRoles(req.user.id);
    res.json({ user: req.user, roles });
  }),
);

app.get(
  "/api/products",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `
        SELECT p.*, c.slug AS category_slug
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        ORDER BY p.sort_order ASC, p.created_at DESC
      `,
    );
    res.json(rows.map(mapProduct));
  }),
);

app.get(
  "/api/products/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `
        SELECT p.*, c.slug AS category_slug
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = $1
        LIMIT 1
      `,
      [req.params.id],
    );
    const product = rows[0];
    if (!product) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(mapProduct(product));
  }),
);

app.get(
  "/api/products/by-slug/:slug",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `
        SELECT p.*, c.slug AS category_slug
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.slug = $1
        LIMIT 1
      `,
      [req.params.slug],
    );
    const product = rows[0];
    if (!product) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(mapProduct(product));
  }),
);

app.get(
  "/sitemap.xml",
  asyncHandler(async (req, res) => {
    const base = `${req.protocol}://${req.headers.host}`;
    const urls = [];
    urls.push({ loc: `${base}/`, changefreq: "daily", priority: "1.0" });
    urls.push({ loc: `${base}/catalog`, changefreq: "daily", priority: "0.9" });
    const { rows: categories } = await query(`SELECT slug, created_at FROM categories`);
    for (const c of categories) {
      urls.push({
        loc: `${base}/catalog?category=${encodeURIComponent(c.slug)}`,
        changefreq: "weekly",
        priority: "0.7",
        lastmod: (c.created_at || new Date()).toISOString(),
      });
    }
    const { rows: products } = await query(`SELECT slug, id, updated_at, created_at FROM products`);
    for (const p of products) {
      const slug = p.slug || p.id;
      urls.push({
        loc: `${base}/product/${slug}`,
        changefreq: "weekly",
        priority: "0.8",
        lastmod: (p.updated_at || p.created_at || new Date()).toISOString(),
      });
    }
    const { rows: articles } = await query(`SELECT slug, updated_at, created_at FROM articles`);
    for (const a of articles) {
      urls.push({
        loc: `${base}/article/${a.slug}`,
        changefreq: "weekly",
        priority: "0.6",
        lastmod: (a.updated_at || a.created_at || new Date()).toISOString(),
      });
    }
    const { rows: pages } = await query(`SELECT slug, updated_at, created_at FROM pages`);
    for (const p of pages) {
      urls.push({
        loc: `${base}/page/${p.slug}`,
        changefreq: "monthly",
        priority: "0.5",
        lastmod: (p.updated_at || p.created_at || new Date()).toISOString(),
      });
    }
    const toXml = (u) =>
      `<url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`;
    const body = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
      urls.map(toXml).join("") +
      `</urlset>`;
    res.type("application/xml").send(body);
  }),
);

app.get(
  "/robots.txt",
  asyncHandler(async (req, res) => {
    const base = `${req.protocol}://${req.headers.host}`;
    const lines = [
      "User-agent: *",
      "Allow: /",
      `Sitemap: ${base}/sitemap.xml`,
    ];
    res.type("text/plain").send(lines.join("\n"));
  }),
);

app.get(
  "/api/categories",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `
        SELECT c.*, COUNT(p.id) AS product_count
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id
        ORDER BY c.sort_order ASC, c.created_at DESC
      `,
    );
    res.json(rows.map(mapCategory));
  }),
);

app.get(
  "/api/banners",
  asyncHandler(async (req, res) => {
    const filters = [];
    const values = [];
    if (req.query.is_active === "true") {
      values.push(true);
      filters.push(`is_active = $${values.length}`);
    }
    if (req.query.position) {
      values.push(req.query.position);
      filters.push(`position = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const { rows } = await query(
      `
        SELECT *
        FROM banners
        ${where}
        ORDER BY sort_order ASC, created_at DESC
      `,
      values,
    );
    res.json(rows.map(mapBanner));
  }),
);

app.get(
  "/api/hero-products",
  asyncHandler(async (req, res) => {
    const values = [];
    let where = "";
    if (req.query.is_active === "true") {
      values.push(true);
      where = `WHERE hp.is_active = $1`;
    }
    const { rows } = await query(
      `
        SELECT
          hp.id AS hero_id,
          hp.product_id AS hero_product_id,
          hp.badge AS hero_badge,
          hp.is_active AS hero_is_active,
          hp.sort_order AS hero_sort_order,
          hp.created_at AS hero_created_at,
          p.*,
          c.slug AS category_slug
        FROM hero_products hp
        JOIN products p ON p.id = hp.product_id
        LEFT JOIN categories c ON c.id = p.category_id
        ${where}
        ORDER BY hp.sort_order ASC, hp.created_at DESC
      `,
      values,
    );
    res.json(
      rows.map((row) => {
        const productRow = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          category_id: row.category_id,
          category_slug: row.category_slug,
          price: row.price,
          old_price: row.old_price,
          description: row.description,
          images: row.images,
          product_type: row.product_type,
          in_stock: row.in_stock,
          stock_count: row.stock_count,
          rating: row.rating,
          reviews_count: row.reviews_count,
          is_premium: row.is_premium,
          is_new: row.is_new,
          sort_order: row.sort_order,
        };
        return {
          id: row.hero_id,
          product_id: row.hero_product_id,
          badge: row.hero_badge,
          is_active: row.hero_is_active,
          sort_order: row.hero_sort_order,
          created_at: row.hero_created_at,
          product: mapProduct(productRow),
        };
      }),
    );
  }),
);

app.get(
  "/api/articles",
  asyncHandler(async (req, res) => {
    const values = [];
    let where = "";
    if (req.query.status) {
      values.push(req.query.status);
      where = `WHERE status = $1`;
    }
    const { rows } = await query(
      `
        SELECT *
        FROM articles
        ${where}
        ORDER BY created_at DESC
      `,
      values,
    );
    res.json(rows);
  }),
);

app.get(
  "/api/articles/by-slug/:slug",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM articles WHERE slug = $1 LIMIT 1`, [
      req.params.slug,
    ]);
    const article = rows[0];
    if (!article) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(article);
  }),
);

app.get(
  "/api/pages/:slug",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM pages WHERE slug = $1 LIMIT 1`, [req.params.slug]);
    const page = rows[0];
    if (!page) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(page);
  }),
);

app.get(
  "/api/reviews",
  asyncHandler(async (req, res) => {
    const productId = req.query.productId;
    if (!productId) {
      res.json([]);
      return;
    }
    const { rows } = await query(
      `
        SELECT *
        FROM reviews
        WHERE product_id = $1 AND status = 'published'
        ORDER BY created_at DESC
      `,
      [productId],
    );
    res.json(rows.map(mapReview));
  }),
);

app.get(
  "/api/reviews/eligible-orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = req.query.productId;
    if (!productId) {
      res.json([]);
      return;
    }
    const { rows } = await query(
      `
        SELECT DISTINCT o.id, o.order_number
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = $1 AND oi.product_id = $2
        ORDER BY o.created_at DESC
      `,
      [req.user.id, productId],
    );
    res.json(rows);
  }),
);

app.post(
  "/api/reviews",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { product_id, order_id, rating, text, author_name } = req.body || {};
    if (!product_id || !rating || !text) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const { rows } = await query(
      `
        INSERT INTO reviews (user_id, product_id, order_id, rating, text, author_name, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *
      `,
      [req.user.id, product_id, order_id ?? null, rating, text, author_name ?? null],
    );
    res.json(mapReview(rows[0]));
  }),
);

app.post(
  "/api/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      order_number,
      status,
      total_price,
      delivery_price,
      delivery_method,
      payment_method,
      address,
      items,
      profile_name,
    } = req.body || {};
    if (!order_number || !total_price || !Array.isArray(items)) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const { rows } = await query(
      `
        INSERT INTO orders (user_id, order_number, status, total_price, delivery_price, delivery_method, payment_method, address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [
        req.user.id,
        order_number,
        status ?? "Новый",
        total_price,
        delivery_price ?? 0,
        delivery_method ?? null,
        payment_method ?? null,
        address ?? null,
      ],
    );
    const order = rows[0];
    for (const item of items) {
      await query(
        `
          INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          order.id,
          item.product_id,
          item.product_name,
          item.product_image ?? null,
          item.price,
          item.quantity,
        ],
      );
    }
    if (profile_name) {
      await ensureProfile(req.user.id, req.user.phone ?? null, profile_name);
    }
    res.json(mapOrder(order));
  }),
);

app.get(
  "/api/my/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `
        SELECT *
        FROM orders
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [req.user.id],
    );
    res.json(rows.map(mapOrder));
  }),
);

app.get(
  "/api/my/orders/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `
        SELECT *
        FROM orders
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [req.params.id, req.user.id],
    );
    const order = rows[0];
    if (!order) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(mapOrder(order));
  }),
);

app.get(
  "/api/my/orders/:id/items",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `
        SELECT oi.*
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.id = $1 AND o.user_id = $2
      `,
      [req.params.id, req.user.id],
    );
    res.json(rows.map(mapOrderItem));
  }),
);

app.get(
  "/api/admin/stats",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `
        SELECT
          (SELECT COUNT(*) FROM products) AS total_products,
          (SELECT COUNT(*) FROM orders) AS total_orders,
          (SELECT COUNT(*) FROM categories) AS total_categories,
          (SELECT COALESCE(SUM(total_price), 0) FROM orders) AS total_revenue
      `,
    );
    res.json(mapStats(rows[0]));
  }),
);

app.get(
  "/api/admin/products",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `
        SELECT *
        FROM products
        ORDER BY sort_order ASC, created_at DESC
      `,
    );
    res.json(rows.map(mapProduct));
  }),
);

app.get(
  "/api/admin/products/options",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT id, name FROM products ORDER BY name ASC`);
    res.json(rows);
  }),
);

app.get(
  "/api/admin/product-categories",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT product_id, category_id FROM product_categories`);
    res.json(rows);
  }),
);

app.post(
  "/api/admin/products",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const {
      name,
      slug,
      category_id,
      price,
      old_price,
      description,
      images,
      meta_title,
      meta_description,
      meta_keywords,
      seo_text,
      product_type,
      in_stock,
      stock_count,
      rating,
      reviews_count,
      is_premium,
      is_new,
      sort_order,
      category_ids,
    } = req.body || {};
    if (!name || !price) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const { rows } = await query(
      `
        INSERT INTO products (
          name, slug, category_id, price, old_price, description, images,
          meta_title, meta_description, meta_keywords, seo_text,
          product_type, in_stock, stock_count, rating, reviews_count, is_premium, is_new, sort_order
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING *
      `,
      [
        name,
        slug ?? null,
        category_id ?? null,
        price,
        old_price ?? null,
        description ?? null,
        images ?? null,
        meta_title ?? null,
        meta_description ?? null,
        meta_keywords ?? null,
        seo_text ?? null,
        product_type ?? "regular",
        in_stock ?? true,
        stock_count ?? null,
        rating ?? 0,
        reviews_count ?? 0,
        is_premium ?? false,
        is_new ?? false,
        sort_order ?? 0,
      ],
    );
    const product = rows[0];
    const normalizedCategoryIds = normalizeCategoryIds(category_ids);
    if (normalizedCategoryIds.length > 0) {
      for (const categoryId of normalizedCategoryIds) {
        await query(
          `
            INSERT INTO product_categories (product_id, category_id)
            VALUES ($1, $2)
          `,
          [product.id, categoryId],
        );
      }
    }
    res.json({ id: product.id });
  }),
);

app.put(
  "/api/admin/products/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const {
      name,
      slug,
      category_id,
      price,
      old_price,
      description,
      images,
      meta_title,
      meta_description,
      meta_keywords,
      seo_text,
      product_type,
      in_stock,
      stock_count,
      rating,
      reviews_count,
      is_premium,
      is_new,
      sort_order,
      category_ids,
    } = req.body || {};
    await query(
      `
        UPDATE products
        SET name = $2,
            slug = $3,
            category_id = $4,
            price = $5,
            old_price = $6,
            description = $7,
            images = $8,
            meta_title = $9,
            meta_description = $10,
            meta_keywords = $11,
            seo_text = $12,
            product_type = $13,
            in_stock = $14,
            stock_count = $15,
            rating = $16,
            reviews_count = $17,
            is_premium = $18,
            is_new = $19,
            sort_order = $20,
            updated_at = now()
        WHERE id = $1
      `,
      [
        req.params.id,
        name,
        slug ?? null,
        category_id ?? null,
        price,
        old_price ?? null,
        description ?? null,
        images ?? null,
        meta_title ?? null,
        meta_description ?? null,
        meta_keywords ?? null,
        seo_text ?? null,
        product_type ?? "regular",
        in_stock ?? true,
        stock_count ?? null,
        rating ?? 0,
        reviews_count ?? 0,
        is_premium ?? false,
        is_new ?? false,
        sort_order ?? 0,
      ],
    );
    if (Array.isArray(category_ids)) {
      await query(`DELETE FROM product_categories WHERE product_id = $1`, [req.params.id]);
      const normalizedCategoryIds = normalizeCategoryIds(category_ids);
      for (const categoryId of normalizedCategoryIds) {
        await query(
          `
            INSERT INTO product_categories (product_id, category_id)
            VALUES ($1, $2)
          `,
          [req.params.id, categoryId],
        );
      }
    }
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/products/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  }),
);

app.get(
  "/api/admin/categories",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `
        SELECT *
        FROM categories
        ORDER BY sort_order ASC, created_at DESC
      `,
    );
    res.json(rows.map(mapCategory));
  }),
);

app.post(
  "/api/admin/categories",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name, slug, image, emoji, sort_order } = req.body || {};
    if (!name || !slug) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    await query(
      `
        INSERT INTO categories (name, slug, image, emoji, sort_order)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [name, slug, image ?? null, emoji ?? null, sort_order ?? 0],
    );
    res.status(204).end();
  }),
);

app.put(
  "/api/admin/categories/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name, slug, image, emoji, sort_order } = req.body || {};
    await query(
      `
        UPDATE categories
        SET name = $2,
            slug = $3,
            image = $4,
            emoji = $5,
            sort_order = $6
        WHERE id = $1
      `,
      [req.params.id, name, slug, image ?? null, emoji ?? null, sort_order ?? 0],
    );
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/categories/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM categories WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  }),
);

app.get(
  "/api/admin/banners",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC`);
    res.json(rows.map(mapBanner));
  }),
);

app.post(
  "/api/admin/banners",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const {
      title,
      subtitle,
      discount,
      link_url,
      link_text,
      variant,
      image,
      position,
      is_active,
      sort_order,
    } = req.body || {};
    if (!title) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    await query(
      `
        INSERT INTO banners (title, subtitle, discount, link_url, link_text, variant, image, position, is_active, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        title,
        subtitle ?? null,
        discount ?? null,
        link_url ?? null,
        link_text ?? null,
        variant ?? "default",
        image ?? null,
        position ?? "home",
        is_active ?? true,
        sort_order ?? 0,
      ],
    );
    res.status(204).end();
  }),
);

app.put(
  "/api/admin/banners/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const {
      title,
      subtitle,
      discount,
      link_url,
      link_text,
      variant,
      image,
      position,
      is_active,
      sort_order,
    } = req.body || {};
    await query(
      `
        UPDATE banners
        SET title = $2,
            subtitle = $3,
            discount = $4,
            link_url = $5,
            link_text = $6,
            variant = $7,
            image = $8,
            position = $9,
            is_active = $10,
            sort_order = $11,
            updated_at = now()
        WHERE id = $1
      `,
      [
        req.params.id,
        title,
        subtitle ?? null,
        discount ?? null,
        link_url ?? null,
        link_text ?? null,
        variant ?? "default",
        image ?? null,
        position ?? "home",
        is_active ?? true,
        sort_order ?? 0,
      ],
    );
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/banners/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM banners WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  }),
);

app.get(
  "/api/admin/hero-products",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `
        SELECT hp.*, p.name AS product_name
        FROM hero_products hp
        LEFT JOIN products p ON p.id = hp.product_id
        ORDER BY hp.sort_order ASC, hp.created_at DESC
      `,
    );
    res.json(
      rows.map((row) => ({
        ...mapHero(row),
        products: row.product_name ? { name: row.product_name } : null,
      })),
    );
  }),
);

app.post(
  "/api/admin/hero-products",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { product_id, badge, is_active, sort_order } = req.body || {};
    if (!product_id) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    await query(
      `
        INSERT INTO hero_products (product_id, badge, is_active, sort_order)
        VALUES ($1, $2, $3, $4)
      `,
      [product_id, badge ?? null, is_active ?? true, sort_order ?? 0],
    );
    res.status(204).end();
  }),
);

app.put(
  "/api/admin/hero-products/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { product_id, badge, is_active, sort_order } = req.body || {};
    await query(
      `
        UPDATE hero_products
        SET product_id = $2,
            badge = $3,
            is_active = $4,
            sort_order = $5
        WHERE id = $1
      `,
      [req.params.id, product_id, badge ?? null, is_active ?? true, sort_order ?? 0],
    );
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/hero-products/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM hero_products WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  }),
);

app.get(
  "/api/admin/articles",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT * FROM articles ORDER BY created_at DESC`);
    res.json(rows);
  }),
);

app.post(
  "/api/admin/articles",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const {
      title,
      slug,
      category,
      excerpt,
      content,
      cover_image,
      meta_title,
      meta_description,
      status,
      related_product_ids,
    } = req.body || {};
    if (!title || !slug) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    await query(
      `
        INSERT INTO articles (
          title, slug, category, excerpt, content, cover_image,
          meta_title, meta_description, status, related_product_ids
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        title,
        slug,
        category ?? "",
        excerpt ?? null,
        content ?? null,
        cover_image ?? null,
        meta_title ?? null,
        meta_description ?? null,
        status ?? "draft",
        related_product_ids ?? null,
      ],
    );
    res.status(204).end();
  }),
);

app.put(
  "/api/admin/articles/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const {
      title,
      slug,
      category,
      excerpt,
      content,
      cover_image,
      meta_title,
      meta_description,
      status,
      related_product_ids,
    } = req.body || {};
    await query(
      `
        UPDATE articles
        SET title = $2,
            slug = $3,
            category = $4,
            excerpt = $5,
            content = $6,
            cover_image = $7,
            meta_title = $8,
            meta_description = $9,
            status = $10,
            related_product_ids = $11,
            updated_at = now()
        WHERE id = $1
      `,
      [
        req.params.id,
        title,
        slug,
        category ?? "",
        excerpt ?? null,
        content ?? null,
        cover_image ?? null,
        meta_title ?? null,
        meta_description ?? null,
        status ?? "draft",
        related_product_ids ?? null,
      ],
    );
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/articles/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM articles WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  }),
);

app.get(
  "/api/admin/pages",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT * FROM pages ORDER BY created_at ASC`);
    res.json(rows);
  }),
);

app.put(
  "/api/admin/pages/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { title, content } = req.body || {};
    await query(
      `
        UPDATE pages
        SET title = $2,
            content = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [req.params.id, title, content ?? ""],
    );
    res.status(204).end();
  }),
);

app.get(
  "/api/admin/orders",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const ordersResult = await query(`SELECT * FROM orders ORDER BY created_at DESC`);
    const orders = ordersResult.rows.map(mapOrder);
    const userIds = orders.map((order) => order.user_id).filter(Boolean);
    if (userIds.length === 0) {
      res.json({ orders: [], profiles: {} });
      return;
    }
    const { rows: profilesRows } = await query(
      `SELECT id, name, phone FROM profiles WHERE id = ANY($1::uuid[])`,
      [userIds],
    );
    const profiles = profilesRows.reduce((acc, profile) => {
      acc[profile.id] = profile;
      return acc;
    }, {});
    res.json({ orders, profiles });
  }),
);

app.get(
  "/api/admin/orders/:id/items",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM order_items WHERE order_id = $1`, [req.params.id]);
    res.json(rows.map(mapOrderItem));
  }),
);

app.put(
  "/api/admin/orders/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    await query(`UPDATE orders SET status = $2 WHERE id = $1`, [req.params.id, status]);
    res.status(204).end();
  }),
);

app.get(
  "/api/admin/reviews",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `
        SELECT r.*, p.name AS product_name
        FROM reviews r
        LEFT JOIN products p ON p.id = r.product_id
        ORDER BY r.created_at DESC
      `,
    );
    res.json(rows.map(mapReview));
  }),
);

app.post(
  "/api/admin/reviews",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { user_id, product_id, order_id, rating, text, author_name, status } = req.body || {};
    if (!user_id || !product_id || !rating || !text) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const { rows } = await query(
      `
        INSERT INTO reviews (user_id, product_id, order_id, rating, text, author_name, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *
      `,
      [user_id, product_id, order_id ?? null, rating, text, author_name ?? null, status ?? "published"],
    );
    await recalculateProductRating(product_id);
    res.json(mapReview(rows[0]));
  }),
);

app.put(
  "/api/admin/reviews/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    const updated = await query(
      `
        UPDATE reviews
        SET status = $2
        WHERE id = $1
        RETURNING product_id
      `,
      [req.params.id, status],
    );
    const productId = updated.rows[0]?.product_id;
    if (productId) {
      await recalculateProductRating(productId);
    }
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/reviews/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const deleted = await query(`DELETE FROM reviews WHERE id = $1 RETURNING product_id`, [
      req.params.id,
    ]);
    const productId = deleted.rows[0]?.product_id;
    if (productId) {
      await recalculateProductRating(productId);
    }
    res.status(204).end();
  }),
);

app.post("/api/payments/create", (req, res) => {
  const parsed = paymentCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const paymentId = randomUUID();
  const payment = {
    id: paymentId,
    orderId: parsed.data.orderId,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  payments.set(paymentId, payment);

  res.json({
    paymentId,
    status: payment.status,
    redirectUrl: null,
    provider: "placeholder",
  });
});

app.post("/api/payments/webhook", (req, res) => {
  const parsed = paymentWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const payment = payments.get(parsed.data.paymentId);
  if (!payment) {
    res.status(404).json({ error: "payment_not_found" });
    return;
  }

  payment.status = parsed.data.status;
  payment.updatedAt = new Date().toISOString();
  payment.providerPayload = parsed.data.providerPayload ?? null;

  res.json({ ok: true });
});

app.post("/api/delivery/quote", (req, res) => {
  const parsed = deliveryQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const totalItems = parsed.data.items.reduce((sum, item) => sum + item.quantity, 0);
  const basePrice = 250;
  const perItem = 20 * totalItems;
  const quoteId = randomUUID();
  const price = basePrice + perItem;

  res.json({
    quoteId,
    orderId: parsed.data.orderId,
    price,
    currency: "RUB",
    etaDays: 3,
    provider: "placeholder",
  });
});

app.post("/api/delivery/create", (req, res) => {
  const parsed = deliveryCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const deliveryId = randomUUID();
  const delivery = {
    id: deliveryId,
    orderId: parsed.data.orderId,
    quoteId: parsed.data.quoteId,
    status: "new",
    createdAt: new Date().toISOString(),
  };

  deliveries.set(deliveryId, delivery);

  res.json({
    deliveryId,
    status: delivery.status,
    trackingUrl: null,
    provider: "placeholder",
  });
});

app.post("/api/delivery/webhook", (req, res) => {
  const parsed = deliveryWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const delivery = deliveries.get(parsed.data.deliveryId);
  if (!delivery) {
    res.status(404).json({ error: "delivery_not_found" });
    return;
  }

  delivery.status = parsed.data.status;
  delivery.updatedAt = new Date().toISOString();
  delivery.providerPayload = parsed.data.providerPayload ?? null;

  res.json({ ok: true });
});

app.post("/api/sms/request", (req, res) => {
  const parsed = smsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!normalizedPhone) {
    res.status(400).json({ error: "invalid_phone" });
    return;
  }

  const now = Date.now();
  const rateLog = pruneRateLimits(smsRateLimits.get(normalizedPhone) ?? []);
  if (rateLog.length >= smsRateLimitMax) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const otp = randomInt(0, 1000000).toString().padStart(6, "0");
  const otpHash = hashOtp(otp);
  const requestId = randomUUID();
  const expiresAt = now + smsOtpTtlMs;

  smsRequests.set(requestId, {
    id: requestId,
    phone: normalizedPhone,
    otpHash,
    attempts: 0,
    purpose: parsed.data.purpose ?? null,
    createdAt: now,
    expiresAt,
  });

  smsPhoneIndex.set(normalizedPhone, requestId);
  smsRateLimits.set(normalizedPhone, [...rateLog, now]);

  res.json({
    requestId,
    phone: maskPhone(normalizedPhone),
    expiresInSeconds: Math.floor(smsOtpTtlMs / 1000),
    provider: "placeholder",
  });
});

app.post("/api/sms/verify", (req, res) => {
  const parsed = smsVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!normalizedPhone) {
    res.status(400).json({ error: "invalid_phone" });
    return;
  }

  const request = smsRequests.get(parsed.data.requestId);
  if (!request || request.phone !== normalizedPhone) {
    res.status(404).json({ error: "request_not_found" });
    return;
  }

  if (Date.now() > request.expiresAt) {
    res.status(400).json({ error: "otp_expired" });
    return;
  }

  if (request.attempts >= smsMaxAttempts) {
    res.status(429).json({ error: "otp_attempts_exceeded" });
    return;
  }

  const codeHash = hashOtp(parsed.data.code.trim());
  if (!safeEqual(codeHash, request.otpHash)) {
    request.attempts += 1;
    res.status(400).json({ error: "otp_invalid" });
    return;
  }

  smsRequests.delete(parsed.data.requestId);
  if (smsPhoneIndex.get(normalizedPhone) === parsed.data.requestId) {
    smsPhoneIndex.delete(normalizedPhone);
  }

  res.json({ verified: true });
});

app.post("/api/sms/webhook", (req, res) => {
  const parsed = smsWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const request = smsRequests.get(parsed.data.requestId);
  if (request) {
    request.status = parsed.data.status ?? request.status ?? "sent";
    request.providerPayload = parsed.data.providerPayload ?? null;
    request.updatedAt = Date.now();
  }

  res.json({ ok: true });
});

export const createServer = () => app;

export const startServer = async (overridePort) => {
  await ensureSchema();
  await ensureAdminUser();
  const port = overridePort ?? basePort;
  return app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
};

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
