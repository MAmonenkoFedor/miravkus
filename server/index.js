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
app.disable("x-powered-by");

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
const rateLimits = new Map();

const smsOtpTtlMs = Number.parseInt(process.env.SMS_OTP_TTL_MS ?? "300000", 10);
const smsMaxAttempts = Number.parseInt(process.env.SMS_OTP_MAX_ATTEMPTS ?? "5", 10);
const smsRateLimitWindowMs = Number.parseInt(process.env.SMS_OTP_RATE_WINDOW_MS ?? "600000", 10);
const smsRateLimitMax = Number.parseInt(process.env.SMS_OTP_RATE_MAX ?? "3", 10);
const smsOtpSecret = process.env.SMS_OTP_SECRET ?? "dev-secret";
const isProd = process.env.NODE_ENV === "production";
const webhookSecret = process.env.WEBHOOK_SECRET;

const pruneTimestamps = (timestamps, windowMs) => {
  const now = Date.now();
  return timestamps.filter((ts) => now - ts <= windowMs);
};

const takeRateLimit = (key, windowMs, max) => {
  const now = Date.now();
  const log = pruneTimestamps(rateLimits.get(key) ?? [], windowMs);
  if (log.length >= max) {
    rateLimits.set(key, log);
    return false;
  }
  rateLimits.set(key, [...log, now]);
  return true;
};

const rateLimit = ({ prefix, windowMs, max, keyFn }) => (req, res, next) => {
  const key = `${prefix}:${keyFn(req)}`;
  if (!takeRateLimit(key, windowMs, max)) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }
  next();
};

const requireWebhook = (req, res, next) => {
  if (!webhookSecret) {
    res.status(503).json({ error: "webhook_unavailable" });
    return;
  }
  const provided = req.get("x-webhook-secret");
  if (!provided || !safeEqual(provided, webhookSecret)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
};

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
  orderId: z.string().uuid(),
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

const orderCreateSchema = z.object({
  order_number: z.string().min(1),
  status: z.string().min(1).optional(),
  delivery_price: z.number().min(0).max(1000000).optional(),
  delivery_method: z.string().min(1).optional().nullable(),
  payment_method: z.string().min(1).optional().nullable(),
  address: z.string().min(1).optional().nullable(),
  profile_name: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(200),
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

const reviewCreateSchema = z.object({
  product_id: z.string().uuid(),
  order_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(1).max(2000),
  author_name: z.string().max(100).nullable().optional(),
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

const adminOrderStatuses = ["Новый", "В обработке", "Отправлен", "Доставлен"];

const adminProductPayloadSchema = z.object({
  name: z.string().min(1).max(300),
  slug: z.string().trim().min(1).max(200).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  price: z.coerce.number().positive().max(10000000),
  old_price: z.coerce.number().nonnegative().max(10000000).optional().nullable(),
  description: z.string().max(20000).optional().nullable(),
  images: z.array(z.string().max(2048)).max(30).optional().nullable(),
  meta_title: z.string().max(300).optional().nullable(),
  meta_description: z.string().max(1000).optional().nullable(),
  meta_keywords: z.string().max(1000).optional().nullable(),
  seo_text: z.string().max(30000).optional().nullable(),
  product_type: z.enum(["regular", "gift", "premium"]).optional(),
  in_stock: z.boolean().optional(),
  stock_count: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  rating: z.coerce.number().min(0).max(5).optional(),
  reviews_count: z.coerce.number().int().min(0).max(1000000).optional(),
  is_premium: z.boolean().optional(),
  is_new: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
  category_ids: z.array(z.string().uuid()).max(30).optional(),
});

const adminCategoryPayloadSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().trim().min(1).max(200),
  image: z.string().max(2048).optional().nullable(),
  emoji: z.string().max(16).optional().nullable(),
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
});

const adminOrderStatusUpdateSchema = z.object({
  status: z.enum(adminOrderStatuses),
});

const adminReviewStatuses = ["pending", "published", "rejected"];

const adminReviewCreateSchema = z.object({
  user_id: z.string().uuid(),
  product_id: z.string().uuid(),
  order_id: z.string().uuid().optional().nullable(),
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().min(1).max(2000),
  author_name: z.string().max(100).optional().nullable(),
  status: z.enum(adminReviewStatuses).optional(),
});

const adminReviewStatusUpdateSchema = z.object({
  status: z.enum(adminReviewStatuses),
});

const adminPageUpdateSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().max(200000).optional(),
});

const adminBannerPayloadSchema = z.object({
  title: z.string().min(1).max(300),
  subtitle: z.string().max(500).optional().nullable(),
  discount: z.string().max(100).optional().nullable(),
  link_url: z.string().max(2048).optional().nullable(),
  link_text: z.string().max(200).optional().nullable(),
  variant: z.enum(["gold", "red", "default"]).optional(),
  image: z.string().max(2048).optional().nullable(),
  position: z.enum(["hero", "promo", "home"]).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
  starts_at: z.string().max(100).optional().nullable(),
  ends_at: z.string().max(100).optional().nullable(),
});

const adminHeroPayloadSchema = z.object({
  product_id: z.string().uuid(),
  badge: z.string().max(100).optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
  starts_at: z.string().max(100).optional().nullable(),
  ends_at: z.string().max(100).optional().nullable(),
});

const homeSectionKeys = [
  "hero",
  "trust",
  "categories",
  "gift_sets",
  "promo_banners",
  "premium",
  "truffles",
  "discounts",
  "popular",
  "articles",
];

const homeLayoutSectionSchema = z.object({
  key: z.enum(homeSectionKeys),
  enabled: z.boolean(),
  title: z.string().max(120).optional(),
  viewAllLink: z.string().max(500).optional(),
  badge: z.string().max(80).optional(),
  productIds: z.array(z.string().uuid()).max(30).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const homeHeroSchema = z.object({
  topBadge: z.string().max(120).optional(),
  headline: z.string().max(200).optional(),
  highlight: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  primaryCtaText: z.string().max(80).optional(),
  primaryCtaLink: z.string().max(500).optional(),
  secondaryCtaText: z.string().max(80).optional(),
  secondaryCtaLink: z.string().max(500).optional(),
  feature1: z.string().max(120).optional(),
  feature2: z.string().max(120).optional(),
});

const trustIconKeys = ["truck", "shield", "rotate", "headphones"];

const homeTrustItemSchema = z.object({
  icon: z.enum(trustIconKeys).optional(),
  title: z.string().max(120),
  description: z.string().max(200),
});

const homeLayoutSchema = z
  .object({
    sections: z.array(homeLayoutSectionSchema).min(1).max(20),
    featuredCategoryIds: z.array(z.string().uuid()).max(20).optional(),
    seo: z
      .object({
        title: z.string().max(120).optional(),
        description: z.string().max(500).optional(),
        keywords: z.string().max(500).optional(),
      })
      .optional(),
    hero: homeHeroSchema.optional(),
    trust: z.array(homeTrustItemSchema).min(1).max(8).optional(),
  })
  .superRefine((value, ctx) => {
    const keys = new Set();
    for (const section of value.sections) {
      if (keys.has(section.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections"],
          message: "duplicate_section_key",
        });
        return;
      }
      keys.add(section.key);
    }
  });

const homeLayoutPresetKeys = ["default", "holiday", "sale"];

const homeLayoutPresetSchema = z.object({
  preset: z.enum(homeLayoutPresetKeys),
});

const homeLayoutPresets = [
  {
    key: "default",
    label: "Обычный день",
    description: "Стандартная витрина магазина",
  },
  {
    key: "holiday",
    label: "Праздник",
    description: "Акцент на подарки и премиум",
  },
  {
    key: "sale",
    label: "Распродажа",
    description: "Акцент на скидки и промо",
  },
];

const dedupeIds = (input) => {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((item) => typeof item === "string"))];
};

const parseOptionalTimestamp = (value) => {
  if (value === null || value === undefined) {
    return { valid: true, value: null };
  }
  if (typeof value !== "string") {
    return { valid: false, value: null };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: true, value: null };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { valid: false, value: null };
  }
  return { valid: true, value: parsed.toISOString() };
};

const buildDefaultHomeLayout = () => ({
  sections: [
    { key: "hero", enabled: true },
    { key: "trust", enabled: true },
    { key: "categories", enabled: true },
    { key: "gift_sets", enabled: true, title: "Подарочные наборы", viewAllLink: "/catalog?category=gift-sets", limit: 12 },
    { key: "promo_banners", enabled: true },
    { key: "premium", enabled: true, title: "Премиум коллекция", viewAllLink: "/catalog?category=premium-sets", badge: "Эксклюзив", limit: 12 },
    { key: "truffles", enabled: true, title: "Трюфели", viewAllLink: "/catalog?category=truffles", limit: 12 },
    { key: "discounts", enabled: true, title: "Товары со скидкой", limit: 5 },
    { key: "popular", enabled: true, title: "Популярные товары", viewAllLink: "/catalog", limit: 8 },
    { key: "articles", enabled: true },
  ],
  featuredCategoryIds: [],
  seo: {
    title: "Главная",
    description:
      "Премиальные подарочные наборы сладостей, трюфели и шоколад. Доставка по России. Лучшие подарки для любого повода.",
    keywords: "",
  },
  hero: {
    topBadge: "🎁 Новая коллекция",
    headline: "Премиальные подарочные наборы",
    highlight: "подарочные наборы",
    description:
      "Изысканные азиатские сладости в элегантной упаковке. Идеальный подарок для ваших близких.",
    primaryCtaText: "Выбрать подарок",
    primaryCtaLink: "/catalog?category=gift-sets",
    secondaryCtaText: "Смотреть каталог",
    secondaryCtaLink: "/catalog",
    feature1: "Бесплатная доставка",
    feature2: "Гарантия качества",
  },
  trust: [
    { icon: "truck", title: "Быстрая доставка", description: "По всей России от 1 дня" },
    { icon: "shield", title: "Гарантия качества", description: "Оригинальная продукция" },
    { icon: "rotate", title: "Контроль качества", description: "14 дней на возврат" },
    { icon: "headphones", title: "Поддержка 24/7", description: "Всегда на связи" },
  ],
});

const normalizeHomeLayout = (rawValue) => {
  const defaults = buildDefaultHomeLayout();
  const parsed = homeLayoutSchema.safeParse(rawValue);
  if (!parsed.success) {
    return defaults;
  }
  const overrides = new Map(parsed.data.sections.map((section) => [section.key, section]));
  return {
    sections: defaults.sections.map((defaultSection) => {
      const override = overrides.get(defaultSection.key);
      if (!override) {
        return defaultSection;
      }
      return {
        ...defaultSection,
        enabled: override.enabled,
        ...(typeof override.title === "string" ? { title: override.title } : {}),
        ...(typeof override.viewAllLink === "string" ? { viewAllLink: override.viewAllLink } : {}),
        ...(typeof override.badge === "string" ? { badge: override.badge } : {}),
        ...(Array.isArray(override.productIds) ? { productIds: dedupeIds(override.productIds) } : {}),
        ...(typeof override.limit === "number" ? { limit: override.limit } : {}),
      };
    }),
    featuredCategoryIds: dedupeIds(parsed.data.featuredCategoryIds ?? defaults.featuredCategoryIds),
    seo: {
      ...defaults.seo,
      ...(parsed.data.seo ?? {}),
    },
    hero: {
      ...defaults.hero,
      ...(parsed.data.hero ?? {}),
    },
    trust: Array.isArray(parsed.data.trust) && parsed.data.trust.length > 0 ? parsed.data.trust : defaults.trust,
  };
};

const buildHomeLayoutPreset = (preset) => {
  const base = buildDefaultHomeLayout();
  const sectionByKey = new Map(base.sections.map((section) => [section.key, { ...section }]));
  if (preset === "holiday") {
    const holiday = {
      ...base,
      hero: {
        ...base.hero,
        topBadge: "🎉 Праздничная коллекция",
        headline: "Подарки для особенных моментов",
        highlight: "особенных моментов",
        description: "Премиальные наборы и сладости для праздников, корпоративов и тёплых встреч.",
      },
      seo: {
        ...base.seo,
        title: "Праздничная витрина",
        description: "Праздничные подарочные наборы и премиальные сладости с доставкой по России.",
      },
      sections: [
        sectionByKey.get("hero"),
        sectionByKey.get("trust"),
        sectionByKey.get("categories"),
        sectionByKey.get("gift_sets"),
        sectionByKey.get("premium"),
        sectionByKey.get("promo_banners"),
        sectionByKey.get("truffles"),
        sectionByKey.get("popular"),
        sectionByKey.get("discounts"),
        sectionByKey.get("articles"),
      ].filter(Boolean),
    };
    return normalizeHomeLayout(holiday);
  }
  if (preset === "sale") {
    const sale = {
      ...base,
      hero: {
        ...base.hero,
        topBadge: "🔥 Сезон скидок",
        headline: "Лучшие скидки недели",
        highlight: "скидки недели",
        description: "Горячие предложения и акционные подборки, пока товары в наличии.",
      },
      seo: {
        ...base.seo,
        title: "Витрина распродажи",
        description: "Скидки, акции и специальные предложения на сладости и подарочные наборы.",
      },
      sections: [
        sectionByKey.get("hero"),
        sectionByKey.get("discounts"),
        sectionByKey.get("promo_banners"),
        sectionByKey.get("popular"),
        sectionByKey.get("categories"),
        sectionByKey.get("gift_sets"),
        sectionByKey.get("truffles"),
        sectionByKey.get("premium"),
        sectionByKey.get("trust"),
        sectionByKey.get("articles"),
      ].filter(Boolean),
    };
    return normalizeHomeLayout(sale);
  }
  return normalizeHomeLayout(base);
};

const query = (text, params) => pool.query(text, params);

const withTransaction = async (handler) => {
  const client = await pool.connect();
  const queryTx = (text, params) => client.query(text, params);
  try {
    await client.query("BEGIN");
    const result = await handler(queryTx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const ensureConstraint = async (sql) => {
  await query(`DO $$ BEGIN ${sql} EXCEPTION WHEN duplicate_object THEN END $$;`);
};

const countDuplicates = async (sql, params) => {
  const { rows } = await query(sql, params);
  return Number.parseInt(rows[0]?.count ?? "0", 10);
};

const createUniqueIndexIfSafe = async (countSql, createSql, params) => {
  const duplicates = await countDuplicates(countSql, params);
  if (duplicates === 0) {
    await query(createSql);
  }
};

const validateConstraintIfSafe = async (invalidCountSql, validateSql, params) => {
  const invalidCount = await countDuplicates(invalidCountSql, params);
  if (invalidCount === 0) {
    await query(validateSql);
  }
};

const dropColumnIfSafe = async (table, column, canDropSql, params) => {
  const { rows } = await query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
      LIMIT 1
    `,
    [table, column],
  );
  if (rows.length === 0) {
    return;
  }
  const blockers = await countDuplicates(canDropSql, params);
  if (blockers === 0) {
    await query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
};

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
  await query(`CREATE INDEX IF NOT EXISTS auth_sessions_token_hash_idx ON auth_sessions(token_hash)`);
  await query(`CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at)`);
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
  await query(`CREATE INDEX IF NOT EXISTS otp_requests_phone_idx ON otp_requests(phone)`);
  await query(`CREATE INDEX IF NOT EXISTS otp_requests_expires_at_idx ON otp_requests(expires_at)`);
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
  await query(`ALTER TABLE products ALTER COLUMN slug DROP NOT NULL`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title TEXT`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description TEXT`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_keywords TEXT`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_text TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS products_slug_idx ON products(slug)`);
  await query(`CREATE INDEX IF NOT EXISTS products_category_id_idx ON products(category_id)`);
  await query(`CREATE INDEX IF NOT EXISTS products_sort_created_idx ON products(sort_order, created_at DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS product_categories_product_id_idx ON product_categories(product_id)`);
  await query(`CREATE INDEX IF NOT EXISTS product_categories_category_id_idx ON product_categories(category_id)`);
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
  await query(`CREATE INDEX IF NOT EXISTS orders_user_id_created_at_idx ON orders(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT,
      product_id_uuid UUID,
      product_name TEXT NOT NULL,
      product_image TEXT,
      price NUMERIC NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1
    )
  `);
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id_uuid UUID`);
  await query(
    `
      UPDATE order_items
      SET product_id_uuid = NULLIF(product_id, '')::uuid
      WHERE product_id_uuid IS NULL
        AND product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    `,
  );
  await query(`CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id)`);
  await query(`CREATE INDEX IF NOT EXISTS order_items_product_id_uuid_idx ON order_items(product_id_uuid)`);
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
  await query(`CREATE INDEX IF NOT EXISTS reviews_product_status_idx ON reviews(product_id, status, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON reviews(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS reviews_order_id_idx ON reviews(order_id)`);
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
      starts_at TIMESTAMP WITH TIME ZONE,
      ends_at TIMESTAMP WITH TIME ZONE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE banners ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP WITH TIME ZONE`);
  await query(`ALTER TABLE banners ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP WITH TIME ZONE`);
  await query(`CREATE INDEX IF NOT EXISTS banners_active_position_idx ON banners(is_active, position)`);
  await query(`CREATE INDEX IF NOT EXISTS banners_sort_idx ON banners(sort_order, created_at DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS hero_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      badge TEXT,
      is_active BOOLEAN DEFAULT true,
      starts_at TIMESTAMP WITH TIME ZONE,
      ends_at TIMESTAMP WITH TIME ZONE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE hero_products ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP WITH TIME ZONE`);
  await query(`ALTER TABLE hero_products ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP WITH TIME ZONE`);
  await query(`CREATE INDEX IF NOT EXISTS hero_products_active_sort_idx ON hero_products(is_active, sort_order, created_at DESC)`);
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
  await query(`CREATE INDEX IF NOT EXISTS articles_status_created_idx ON articles(status, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS articles_slug_idx ON articles(slug)`);
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
  await query(`CREATE INDEX IF NOT EXISTS pages_slug_idx ON pages(slug)`);
  await query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
  await query(
    `INSERT INTO site_settings (key, value) VALUES ('home_layout', $1::jsonb) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(buildDefaultHomeLayout())],
  );

  await ensureConstraint(
    `ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range_check CHECK (rating >= 1 AND rating <= 5) NOT VALID;`,
  );
  await ensureConstraint(
    `ALTER TABLE reviews ADD CONSTRAINT reviews_status_check CHECK (status IN ('pending','published','rejected')) NOT VALID;`,
  );
  await ensureConstraint(
    `ALTER TABLE articles ADD CONSTRAINT articles_status_check CHECK (status IN ('draft','published')) NOT VALID;`,
  );
  await ensureConstraint(
    `ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_uuid_fkey FOREIGN KEY (product_id_uuid) REFERENCES products(id) ON DELETE SET NULL NOT VALID;`,
  );

  await createUniqueIndexIfSafe(
    `SELECT COUNT(*) AS count FROM (SELECT slug FROM categories GROUP BY slug HAVING COUNT(*) > 1) t`,
    `CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_unique_idx ON categories(slug)`,
  );
  await createUniqueIndexIfSafe(
    `SELECT COUNT(*) AS count FROM (SELECT slug FROM pages GROUP BY slug HAVING COUNT(*) > 1) t`,
    `CREATE UNIQUE INDEX IF NOT EXISTS pages_slug_unique_idx ON pages(slug)`,
  );
  await createUniqueIndexIfSafe(
    `SELECT COUNT(*) AS count FROM (SELECT slug FROM articles GROUP BY slug HAVING COUNT(*) > 1) t`,
    `CREATE UNIQUE INDEX IF NOT EXISTS articles_slug_unique_idx ON articles(slug)`,
  );
  await createUniqueIndexIfSafe(
    `SELECT COUNT(*) AS count FROM (SELECT slug FROM products WHERE slug IS NOT NULL GROUP BY slug HAVING COUNT(*) > 1) t`,
    `CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique_idx ON products(slug) WHERE slug IS NOT NULL`,
  );
  await createUniqueIndexIfSafe(
    `SELECT COUNT(*) AS count FROM (
      SELECT product_id, category_id
      FROM product_categories
      GROUP BY product_id, category_id
      HAVING COUNT(*) > 1
    ) t`,
    `CREATE UNIQUE INDEX IF NOT EXISTS product_categories_unique_idx ON product_categories(product_id, category_id)`,
  );
  await createUniqueIndexIfSafe(
    `SELECT COUNT(*) AS count FROM (
      SELECT user_id, product_id, order_id
      FROM reviews
      WHERE order_id IS NOT NULL
      GROUP BY user_id, product_id, order_id
      HAVING COUNT(*) > 1
    ) t`,
    `CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_user_product_order_idx ON reviews(user_id, product_id, order_id) WHERE order_id IS NOT NULL`,
  );

  await validateConstraintIfSafe(
    `SELECT COUNT(*) AS count FROM reviews WHERE rating < 1 OR rating > 5`,
    `ALTER TABLE reviews VALIDATE CONSTRAINT reviews_rating_range_check`,
  );
  await validateConstraintIfSafe(
    `SELECT COUNT(*) AS count FROM reviews WHERE status NOT IN ('pending','published','rejected')`,
    `ALTER TABLE reviews VALIDATE CONSTRAINT reviews_status_check`,
  );
  await validateConstraintIfSafe(
    `SELECT COUNT(*) AS count FROM articles WHERE status NOT IN ('draft','published')`,
    `ALTER TABLE articles VALIDATE CONSTRAINT articles_status_check`,
  );
  await validateConstraintIfSafe(
    `
      SELECT COUNT(*) AS count
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id_uuid
      WHERE oi.product_id_uuid IS NOT NULL AND p.id IS NULL
    `,
    `ALTER TABLE order_items VALIDATE CONSTRAINT order_items_product_id_uuid_fkey`,
  );
  await dropColumnIfSafe(
    "order_items",
    "product_id",
    `SELECT COUNT(*) AS count FROM order_items WHERE product_id_uuid IS NULL`,
  );
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
  product_id: row.product_id_uuid,
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
  products: toNumber(row.total_products),
  orders: toNumber(row.total_orders),
  categories: toNumber(row.total_categories),
  revenue: toNumber(row.total_revenue),
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

const allowedUploadExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    if (!allowedUploadExts.has(ext) || !mime.startsWith("image/")) {
      cb(new Error("invalid_file_type"));
      return;
    }
    cb(null, true);
  },
});

const buildFileUrl = (req, filePath) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}${filePath.startsWith("/") ? filePath : `/${filePath}`}`;
};

app.post(
  "/api/uploads/product-image",
  requireAuth,
  requireRole("admin"),
  rateLimit({ prefix: "uploads", windowMs: 60 * 60 * 1000, max: 200, keyFn: (req) => req.user.id }),
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
  rateLimit({ prefix: "uploads", windowMs: 60 * 60 * 1000, max: 200, keyFn: (req) => req.user.id }),
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
  rateLimit({ prefix: "auth-login", windowMs: 15 * 60 * 1000, max: 20, keyFn: (req) => req.ip }),
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
    if (
      !takeRateLimit(`auth-otp-ip:${req.ip}`, 10 * 60 * 1000, 10) ||
      !takeRateLimit(`auth-otp-phone:${normalizedPhone}`, 10 * 60 * 1000, 5)
    ) {
      res.status(429).json({ error: "rate_limited" });
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
  rateLimit({ prefix: "auth-otp-verify", windowMs: 10 * 60 * 1000, max: 30, keyFn: (req) => req.ip }),
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

app.post(
  "/api/auth/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const token = parseBearerToken(req);
    if (!token) {
      res.status(400).json({ error: "invalid_token" });
      return;
    }
    const tokenHash = hashToken(token);
    await query(`DELETE FROM auth_sessions WHERE token_hash = $1 AND user_id = $2`, [
      tokenHash,
      req.user.id,
    ]);
    res.status(204).end();
  }),
);

app.get(
  "/api/home-layout",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT value FROM site_settings WHERE key = 'home_layout' LIMIT 1`);
    const rawValue = rows[0]?.value ?? buildDefaultHomeLayout();
    res.json(normalizeHomeLayout(rawValue));
  }),
);

app.get(
  "/api/products",
  asyncHandler(async (req, res) => {
    const hasCatalogParams = [
      "category",
      "search",
      "tag",
      "minPrice",
      "maxPrice",
      "sort",
      "page",
      "pageSize",
      "inStock",
    ].some((key) => req.query[key] !== undefined);

    if (!hasCatalogParams) {
      const { rows } = await query(
        `
          SELECT p.*, c.slug AS category_slug
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          ORDER BY p.sort_order ASC, p.created_at DESC
        `,
      );
      res.json(rows.map(mapProduct));
      return;
    }

    const values = [];
    const filters = [];

    if (req.query.category) {
      values.push(String(req.query.category));
      filters.push(`c.slug = $${values.length}`);
    }

    if (req.query.search) {
      values.push(`%${String(req.query.search).trim()}%`);
      filters.push(`(p.name ILIKE $${values.length} OR COALESCE(p.description, '') ILIKE $${values.length})`);
    }

    if (req.query.tag === "sale") {
      filters.push(`p.old_price IS NOT NULL AND p.old_price > p.price`);
    } else if (req.query.tag === "new") {
      filters.push(`p.is_new = true`);
    } else if (req.query.tag === "hits") {
      filters.push(`p.reviews_count > 0`);
    }

    if (req.query.inStock === "true") {
      filters.push(`p.in_stock = true`);
    }

    const minPrice = Number.parseFloat(String(req.query.minPrice ?? ""));
    if (Number.isFinite(minPrice)) {
      values.push(minPrice);
      filters.push(`p.price >= $${values.length}`);
    }

    const maxPrice = Number.parseFloat(String(req.query.maxPrice ?? ""));
    if (Number.isFinite(maxPrice)) {
      values.push(maxPrice);
      filters.push(`p.price <= $${values.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const sort = String(req.query.sort ?? "popular");
    let orderBy = "p.reviews_count DESC, p.rating DESC, p.created_at DESC";
    if (sort === "price-asc") {
      orderBy = "p.price ASC, p.created_at DESC";
    } else if (sort === "price-desc") {
      orderBy = "p.price DESC, p.created_at DESC";
    } else if (sort === "rating") {
      orderBy = "p.rating DESC, p.reviews_count DESC, p.created_at DESC";
    } else if (sort === "newest") {
      orderBy = "p.is_new DESC, p.created_at DESC";
    }

    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSizeRaw = Number.parseInt(String(req.query.pageSize ?? "24"), 10) || 24;
    const pageSize = Math.max(1, Math.min(60, pageSizeRaw));
    const offset = (page - 1) * pageSize;

    const countResult = await query(
      `
        SELECT COUNT(*)::int AS total
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        ${where}
      `,
      values,
    );
    const total = countResult.rows[0]?.total ?? 0;

    const listValues = [...values, pageSize, offset];
    const limitParam = `$${listValues.length - 1}`;
    const offsetParam = `$${listValues.length}`;
    const { rows } = await query(
      `
        SELECT p.*, c.slug AS category_slug
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        ${where}
        ORDER BY ${orderBy}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      listValues,
    );

    res.json({
      items: rows.map(mapProduct),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
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
      filters.push(`(starts_at IS NULL OR starts_at <= now())`);
      filters.push(`(ends_at IS NULL OR ends_at >= now())`);
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
    const filters = [];
    const values = [];
    if (req.query.is_active === "true") {
      values.push(true);
      filters.push(`hp.is_active = $${values.length}`);
      filters.push(`(hp.starts_at IS NULL OR hp.starts_at <= now())`);
      filters.push(`(hp.ends_at IS NULL OR hp.ends_at >= now())`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const { rows } = await query(
      `
        SELECT
          hp.id AS hero_id,
          hp.product_id AS hero_product_id,
          hp.badge AS hero_badge,
          hp.is_active AS hero_is_active,
          hp.starts_at AS hero_starts_at,
          hp.ends_at AS hero_ends_at,
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
          starts_at: row.hero_starts_at,
          ends_at: row.hero_ends_at,
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
    const status = req.query.status;
    if (status && status !== "published") {
      res.status(400).json({ error: "invalid_status" });
      return;
    }
    values.push("published");
    const where = `WHERE status = $1`;
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
    const { rows } = await query(
      `SELECT * FROM articles WHERE slug = $1 AND status = 'published' LIMIT 1`,
      [req.params.slug],
    );
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
  rateLimit({ prefix: "reviews-eligible", windowMs: 5 * 60 * 1000, max: 60, keyFn: (req) => req.user.id }),
  asyncHandler(async (req, res) => {
    const productId = req.query.productId;
    if (!productId) {
      res.json([]);
      return;
    }
    if (typeof productId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
      res.status(400).json({ error: "invalid_product" });
      return;
    }
    const { rows } = await query(
      `
        SELECT DISTINCT o.id, o.order_number
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = $1
          AND oi.product_id_uuid = $2::uuid
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
  rateLimit({ prefix: "reviews-create", windowMs: 60 * 60 * 1000, max: 30, keyFn: (req) => req.user.id }),
  asyncHandler(async (req, res) => {
    const parsed = reviewCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }

    const eligible = await query(
      `
        SELECT 1
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.id = $1
          AND o.user_id = $2
          AND oi.product_id_uuid = $3::uuid
        LIMIT 1
      `,
      [parsed.data.order_id, req.user.id, parsed.data.product_id],
    );
    if (eligible.rowCount === 0) {
      res.status(403).json({ error: "not_eligible" });
      return;
    }

    const exists = await query(
      `
        SELECT 1
        FROM reviews
        WHERE user_id = $1 AND product_id = $2 AND order_id = $3
        LIMIT 1
      `,
      [req.user.id, parsed.data.product_id, parsed.data.order_id],
    );
    if (exists.rowCount > 0) {
      res.status(409).json({ error: "already_exists" });
      return;
    }
    const { rows } = await query(
      `
        INSERT INTO reviews (user_id, product_id, order_id, rating, text, author_name, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *
      `,
      [
        req.user.id,
        parsed.data.product_id,
        parsed.data.order_id,
        parsed.data.rating,
        parsed.data.text,
        parsed.data.author_name ?? null,
      ],
    );
    res.json(mapReview(rows[0]));
  }),
);

app.post(
  "/api/orders",
  requireAuth,
  rateLimit({ prefix: "orders-create", windowMs: 60 * 60 * 1000, max: 20, keyFn: (req) => req.user.id }),
  asyncHandler(async (req, res) => {
    const parsed = orderCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }

    const uniqueProductIds = [...new Set(parsed.data.items.map((item) => item.product_id))];
    const { rows: productRows } = await query(
      `
        SELECT id, name, price, images
        FROM products
        WHERE id = ANY($1::uuid[])
      `,
      [uniqueProductIds],
    );
    const productsById = productRows.reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {});

    const missing = uniqueProductIds.filter((id) => !productsById[id]);
    if (missing.length) {
      res.status(400).json({ error: "products_not_found", ids: missing });
      return;
    }

    const deliveryPrice = parsed.data.delivery_price ?? 0;
    const itemsTotal = parsed.data.items.reduce((sum, item) => {
      const productRow = productsById[item.product_id];
      const price = toNumber(productRow.price) ?? 0;
      return sum + price * item.quantity;
    }, 0);

    const totalPrice = itemsTotal + deliveryPrice;
    const { rows } = await query(
      `
        INSERT INTO orders (user_id, order_number, status, total_price, delivery_price, delivery_method, payment_method, address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [
        req.user.id,
        parsed.data.order_number,
        parsed.data.status ?? "Новый",
        totalPrice,
        deliveryPrice,
        parsed.data.delivery_method ?? null,
        parsed.data.payment_method ?? null,
        parsed.data.address ?? null,
      ],
    );
    const order = rows[0];
    for (const item of parsed.data.items) {
      const productRow = productsById[item.product_id];
      const images = Array.isArray(productRow.images) ? productRow.images : [];
      const productImage = typeof images[0] === "string" ? images[0] : null;
      const price = toNumber(productRow.price) ?? 0;
      await query(
        `
          INSERT INTO order_items (order_id, product_id_uuid, product_name, product_image, price, quantity)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          order.id,
          productRow.id,
          productRow.name,
          productImage,
          price,
          item.quantity,
        ],
      );
    }
    if (parsed.data.profile_name) {
      await ensureProfile(req.user.id, req.user.phone ?? null, parsed.data.profile_name);
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
  "/api/admin/home-layout",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT value FROM site_settings WHERE key = 'home_layout' LIMIT 1`);
    const rawValue = rows[0]?.value ?? buildDefaultHomeLayout();
    res.json(normalizeHomeLayout(rawValue));
  }),
);

app.get(
  "/api/admin/home-layout/presets",
  requireAuth,
  requireRole("admin"),
  (_req, res) => {
    res.json(homeLayoutPresets);
  },
);

app.post(
  "/api/admin/home-layout/apply-preset",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = homeLayoutPresetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const presetLayout = buildHomeLayoutPreset(parsed.data.preset);
    await query(
      `
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('home_layout', $1::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `,
      [JSON.stringify(presetLayout)],
    );
    res.status(204).end();
  }),
);

app.put(
  "/api/admin/home-layout",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = homeLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const normalized = normalizeHomeLayout(parsed.data);
    await query(
      `
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('home_layout', $1::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `,
      [JSON.stringify(normalized)],
    );
    res.status(204).end();
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
    const parsed = adminProductPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
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
    } = parsed.data;
    if (!name || !price) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const normalizedSlug = typeof slug === "string" && slug.trim().length > 0 ? slug.trim() : null;
    const product = await withTransaction(async (queryTx) => {
      if (normalizedSlug) {
        const existing = await queryTx(`SELECT 1 FROM products WHERE slug = $1 LIMIT 1`, [normalizedSlug]);
        if (existing.rowCount > 0) {
          res.status(409).json({ error: "slug_taken" });
          return null;
        }
      }
      const { rows } = await queryTx(
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
          normalizedSlug || null,
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
      const created = rows[0];
      const normalizedCategoryIds = normalizeCategoryIds(category_ids);
      if (normalizedCategoryIds.length > 0) {
        for (const categoryId of normalizedCategoryIds) {
          await queryTx(
            `
              INSERT INTO product_categories (product_id, category_id)
              VALUES ($1, $2)
            `,
            [created.id, categoryId],
          );
        }
      }
      return created;
    });
    if (!product) {
      return;
    }
    res.json({ id: product.id });
  }),
);

app.put(
  "/api/admin/products/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = adminProductPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
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
    } = parsed.data;
    const normalizedSlug = typeof slug === "string" && slug.trim().length > 0 ? slug.trim() : null;
    const updated = await withTransaction(async (queryTx) => {
      if (normalizedSlug) {
        const existing = await queryTx(`SELECT 1 FROM products WHERE slug = $1 AND id <> $2 LIMIT 1`, [
          normalizedSlug,
          req.params.id,
        ]);
        if (existing.rowCount > 0) {
          res.status(409).json({ error: "slug_taken" });
          return null;
        }
      }
      const updateResult = await queryTx(
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
          normalizedSlug || null,
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
      if (updateResult.rowCount === 0) {
        return "not_found";
      }
      if (Array.isArray(category_ids)) {
        await queryTx(`DELETE FROM product_categories WHERE product_id = $1`, [req.params.id]);
        const normalizedCategoryIds = normalizeCategoryIds(category_ids);
        for (const categoryId of normalizedCategoryIds) {
          await queryTx(
            `
              INSERT INTO product_categories (product_id, category_id)
              VALUES ($1, $2)
            `,
            [req.params.id, categoryId],
          );
        }
      }
      return "updated";
    });
    if (updated === null) {
      return;
    }
    if (updated === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/products/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const deleted = await query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
    if (deleted.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
    const parsed = adminCategoryPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const { name, slug, image, emoji, sort_order } = parsed.data;
    const normalizedSlug = slug.trim();
    const existing = await query(`SELECT 1 FROM categories WHERE slug = $1 LIMIT 1`, [normalizedSlug]);
    if (existing.rowCount > 0) {
      res.status(409).json({ error: "slug_taken" });
      return;
    }
    await query(
      `
        INSERT INTO categories (name, slug, image, emoji, sort_order)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [name, normalizedSlug, image ?? null, emoji ?? null, sort_order ?? 0],
    );
    res.status(204).end();
  }),
);

app.put(
  "/api/admin/categories/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = adminCategoryPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const { name, slug, image, emoji, sort_order } = parsed.data;
    const normalizedSlug = slug.trim();
    const existing = await query(`SELECT 1 FROM categories WHERE slug = $1 AND id <> $2 LIMIT 1`, [
      normalizedSlug,
      req.params.id,
    ]);
    if (existing.rowCount > 0) {
      res.status(409).json({ error: "slug_taken" });
      return;
    }
    const updateResult = await query(
      `
        UPDATE categories
        SET name = $2,
            slug = $3,
            image = $4,
            emoji = $5,
            sort_order = $6
        WHERE id = $1
      `,
      [req.params.id, name, normalizedSlug, image ?? null, emoji ?? null, sort_order ?? 0],
    );
    if (updateResult.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/categories/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const deleted = await query(`DELETE FROM categories WHERE id = $1`, [req.params.id]);
    if (deleted.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
    const parsed = adminBannerPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
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
      starts_at,
      ends_at,
    } =
      parsed.data;
    const startsAtParsed = parseOptionalTimestamp(starts_at);
    const endsAtParsed = parseOptionalTimestamp(ends_at);
    if (!startsAtParsed.valid || !endsAtParsed.valid) {
      res.status(400).json({ error: "invalid_payload", details: { schedule: "invalid_datetime" } });
      return;
    }
    if (
      startsAtParsed.value &&
      endsAtParsed.value &&
      new Date(startsAtParsed.value).getTime() > new Date(endsAtParsed.value).getTime()
    ) {
      res.status(400).json({ error: "invalid_payload", details: { schedule: "invalid_window" } });
      return;
    }
    await query(
      `
        INSERT INTO banners (title, subtitle, discount, link_url, link_text, variant, image, position, is_active, starts_at, ends_at, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
        startsAtParsed.value,
        endsAtParsed.value,
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
    const parsed = adminBannerPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
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
      starts_at,
      ends_at,
    } =
      parsed.data;
    const startsAtParsed = parseOptionalTimestamp(starts_at);
    const endsAtParsed = parseOptionalTimestamp(ends_at);
    if (!startsAtParsed.valid || !endsAtParsed.valid) {
      res.status(400).json({ error: "invalid_payload", details: { schedule: "invalid_datetime" } });
      return;
    }
    if (
      startsAtParsed.value &&
      endsAtParsed.value &&
      new Date(startsAtParsed.value).getTime() > new Date(endsAtParsed.value).getTime()
    ) {
      res.status(400).json({ error: "invalid_payload", details: { schedule: "invalid_window" } });
      return;
    }
    const updateResult = await query(
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
            starts_at = $11,
            ends_at = $12,
            sort_order = $13,
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
        startsAtParsed.value,
        endsAtParsed.value,
        sort_order ?? 0,
      ],
    );
    if (updateResult.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/banners/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const deleted = await query(`DELETE FROM banners WHERE id = $1`, [req.params.id]);
    if (deleted.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
    const parsed = adminHeroPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const { product_id, badge, is_active, sort_order, starts_at, ends_at } = parsed.data;
    const startsAtParsed = parseOptionalTimestamp(starts_at);
    const endsAtParsed = parseOptionalTimestamp(ends_at);
    if (!startsAtParsed.valid || !endsAtParsed.valid) {
      res.status(400).json({ error: "invalid_payload", details: { schedule: "invalid_datetime" } });
      return;
    }
    if (
      startsAtParsed.value &&
      endsAtParsed.value &&
      new Date(startsAtParsed.value).getTime() > new Date(endsAtParsed.value).getTime()
    ) {
      res.status(400).json({ error: "invalid_payload", details: { schedule: "invalid_window" } });
      return;
    }
    await query(
      `
        INSERT INTO hero_products (product_id, badge, is_active, starts_at, ends_at, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [product_id, badge ?? null, is_active ?? true, startsAtParsed.value, endsAtParsed.value, sort_order ?? 0],
    );
    res.status(204).end();
  }),
);

app.put(
  "/api/admin/hero-products/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsed = adminHeroPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const { product_id, badge, is_active, sort_order, starts_at, ends_at } = parsed.data;
    const startsAtParsed = parseOptionalTimestamp(starts_at);
    const endsAtParsed = parseOptionalTimestamp(ends_at);
    if (!startsAtParsed.valid || !endsAtParsed.valid) {
      res.status(400).json({ error: "invalid_payload", details: { schedule: "invalid_datetime" } });
      return;
    }
    if (
      startsAtParsed.value &&
      endsAtParsed.value &&
      new Date(startsAtParsed.value).getTime() > new Date(endsAtParsed.value).getTime()
    ) {
      res.status(400).json({ error: "invalid_payload", details: { schedule: "invalid_window" } });
      return;
    }
    const updateResult = await query(
      `
        UPDATE hero_products
        SET product_id = $2,
            badge = $3,
            is_active = $4,
            starts_at = $5,
            ends_at = $6,
            sort_order = $7
        WHERE id = $1
      `,
      [
        req.params.id,
        product_id,
        badge ?? null,
        is_active ?? true,
        startsAtParsed.value,
        endsAtParsed.value,
        sort_order ?? 0,
      ],
    );
    if (updateResult.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/hero-products/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const deleted = await query(`DELETE FROM hero_products WHERE id = $1`, [req.params.id]);
    if (deleted.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
    const normalizedSlug = typeof slug === "string" ? slug.trim() : "";
    if (!title || !normalizedSlug) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const normalizedStatus = status ?? "draft";
    if (normalizedStatus !== "draft" && normalizedStatus !== "published") {
      res.status(400).json({ error: "invalid_status" });
      return;
    }
    const existing = await query(`SELECT 1 FROM articles WHERE slug = $1 LIMIT 1`, [normalizedSlug]);
    if (existing.rowCount > 0) {
      res.status(409).json({ error: "slug_taken" });
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
        normalizedSlug,
        category ?? "",
        excerpt ?? null,
        content ?? null,
        cover_image ?? null,
        meta_title ?? null,
        meta_description ?? null,
        normalizedStatus,
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
    const normalizedSlug = typeof slug === "string" ? slug.trim() : "";
    if (!title || !normalizedSlug) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const normalizedStatus = status ?? "draft";
    if (normalizedStatus !== "draft" && normalizedStatus !== "published") {
      res.status(400).json({ error: "invalid_status" });
      return;
    }
    const existing = await query(`SELECT 1 FROM articles WHERE slug = $1 AND id <> $2 LIMIT 1`, [
      normalizedSlug,
      req.params.id,
    ]);
    if (existing.rowCount > 0) {
      res.status(409).json({ error: "slug_taken" });
      return;
    }
    const updateResult = await query(
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
        normalizedSlug,
        category ?? "",
        excerpt ?? null,
        content ?? null,
        cover_image ?? null,
        meta_title ?? null,
        meta_description ?? null,
        normalizedStatus,
        related_product_ids ?? null,
      ],
    );
    if (updateResult.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).end();
  }),
);

app.delete(
  "/api/admin/articles/:id",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const deleted = await query(`DELETE FROM articles WHERE id = $1`, [req.params.id]);
    if (deleted.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
    const parsed = adminPageUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const updateResult = await query(
      `
        UPDATE pages
        SET title = $2,
            content = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [req.params.id, parsed.data.title, parsed.data.content ?? ""],
    );
    if (updateResult.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
    const parsed = adminOrderStatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const updateResult = await query(`UPDATE orders SET status = $2 WHERE id = $1`, [
      req.params.id,
      parsed.data.status,
    ]);
    if (updateResult.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
    const parsed = adminReviewCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const { user_id, product_id, order_id, rating, text, author_name, status } = parsed.data;
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
    const parsed = adminReviewStatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
      return;
    }
    const updated = await query(
      `
        UPDATE reviews
        SET status = $2
        WHERE id = $1
        RETURNING product_id
      `,
      [req.params.id, parsed.data.status],
    );
    if (updated.rowCount === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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

app.post("/api/payments/create", requireAuth, asyncHandler(async (req, res) => {
  const parsed = paymentCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const orderResult = await query(`SELECT id, user_id, total_price FROM orders WHERE id = $1 LIMIT 1`, [
    parsed.data.orderId,
  ]);
  const order = orderResult.rows[0];
  if (!order) {
    res.status(404).json({ error: "order_not_found" });
    return;
  }
  if (order.user_id !== req.user.id) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const paymentId = randomUUID();
  const payment = {
    id: paymentId,
    orderId: parsed.data.orderId,
    amount: toNumber(order.total_price) ?? 0,
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
}));

app.post("/api/payments/webhook", requireWebhook, (req, res) => {
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

app.post("/api/delivery/quote", requireAuth, asyncHandler(async (req, res) => {
  const parsed = deliveryQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const orderResult = await query(`SELECT id FROM orders WHERE id = $1 AND user_id = $2 LIMIT 1`, [
    parsed.data.orderId,
    req.user.id,
  ]);
  if (orderResult.rowCount === 0) {
    res.status(404).json({ error: "order_not_found" });
    return;
  }

  const itemsResult = await query(
    `
      SELECT COALESCE(SUM(oi.quantity), 0) AS total_items
      FROM order_items oi
      WHERE oi.order_id = $1
    `,
    [parsed.data.orderId],
  );
  const totalItems = toNumber(itemsResult.rows[0]?.total_items) ?? 0;
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
}));

app.post("/api/delivery/create", requireAuth, asyncHandler(async (req, res) => {
  const parsed = deliveryCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }

  const orderResult = await query(`SELECT id FROM orders WHERE id = $1 AND user_id = $2 LIMIT 1`, [
    parsed.data.orderId,
    req.user.id,
  ]);
  if (orderResult.rowCount === 0) {
    res.status(404).json({ error: "order_not_found" });
    return;
  }

  const deliveryId = randomUUID();
  const delivery = {
    id: deliveryId,
    orderId: parsed.data.orderId,
    quoteId: parsed.data.quoteId,
    status: "new",
    createdAt: new Date().toISOString(),
    userId: req.user.id,
  };

  deliveries.set(deliveryId, delivery);

  res.json({
    deliveryId,
    status: delivery.status,
    trackingUrl: null,
    provider: "placeholder",
  });
}));

app.post("/api/delivery/webhook", requireWebhook, (req, res) => {
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

app.post("/api/sms/request", requireWebhook, (req, res) => {
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

app.post("/api/sms/verify", requireWebhook, (req, res) => {
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

app.post("/api/sms/webhook", requireWebhook, (req, res) => {
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

app.use((err, _req, res, _next) => {
  const name = err && typeof err === "object" && "name" in err ? err.name : null;
  const message = err && typeof err === "object" && "message" in err ? err.message : "server_error";
  if (name === "MulterError" || message === "invalid_file_type") {
    res.status(400).json({ error: message });
    return;
  }
  res.status(500).json({ error: isProd ? "server_error" : message });
});

export const createServer = () => app;

export const startServer = async (overridePort) => {
  if (isProd) {
    if (!process.env.AUTH_TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET === "dev-secret") {
      throw new Error("AUTH_TOKEN_SECRET must be set");
    }
    if (!process.env.SMS_OTP_SECRET || process.env.SMS_OTP_SECRET === "dev-secret") {
      throw new Error("SMS_OTP_SECRET must be set");
    }
    if (!process.env.WEBHOOK_SECRET) {
      throw new Error("WEBHOOK_SECRET must be set");
    }
  }
  await ensureSchema();
  await query(`DELETE FROM auth_sessions WHERE expires_at <= now()`);
  await query(`DELETE FROM otp_requests WHERE expires_at <= now()`);
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
