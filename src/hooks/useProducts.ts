import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/integrations/api/client";
import { Product, Category } from "@/types/product";

type ProductApiRow = {
  id: string;
  name: string;
  slug: string | null;
  category_id: string | null;
  category_slug?: string | null;
  price: number;
  old_price: number | null;
  description: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  seo_text?: string | null;
  images: string[] | null;
  product_type: string;
  in_stock: boolean;
  stock_count: number | null;
  rating: number;
  reviews_count: number;
  is_premium: boolean;
  is_new: boolean;
  sort_order: number;
};

type CategoryApiRow = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  emoji: string | null;
  sort_order: number;
  product_count?: number;
};

type HeroProductApiRow = {
  id: string;
  product_id: string;
  badge: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  product?: ProductApiRow | null;
};

// Map DB row to Product type used across components
function mapProduct(row: ProductApiRow): Product {
  const oldPrice = row.old_price ? Number(row.old_price) : undefined;
  const price = Number(row.price);
  const discount = oldPrice && oldPrice > price
    ? Math.round(((oldPrice - price) / oldPrice) * 100)
    : undefined;

  return {
    id: row.id,
    name: row.name,
    price,
    oldPrice,
    old_price: row.old_price,
    discount,
    image: row.images?.[0] || "/placeholder.svg",
    images: row.images,
    rating: Number(row.rating),
    reviewsCount: row.reviews_count,
    reviews_count: row.reviews_count,
    category: row.category_slug || "",
    category_id: row.category_id,
    description: row.description,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    meta_keywords: row.meta_keywords,
    seo_text: row.seo_text,
    inStock: row.in_stock,
    in_stock: row.in_stock,
    isPremium: row.is_premium,
    is_premium: row.is_premium,
    isNew: row.is_new,
    is_new: row.is_new,
    slug: row.slug,
    stock_count: row.stock_count,
    product_type: row.product_type,
    sort_order: row.sort_order,
  };
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const data = await apiRequest<ProductApiRow[]>("/api/products");
      return (data || []).map((row) => mapProduct(row));
    },
  });
}

export type CatalogProductsQuery = {
  category?: string;
  search?: string;
  tag?: "sale" | "new" | "hits";
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: "popular" | "price-asc" | "price-desc" | "rating" | "newest";
  page?: number;
  pageSize?: number;
};

type CatalogProductsResponse = {
  items: ProductApiRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function useCatalogProducts(params: CatalogProductsQuery) {
  return useQuery({
    queryKey: ["catalog-products", params],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (params.category) query.set("category", params.category);
      if (params.search) query.set("search", params.search);
      if (params.tag) query.set("tag", params.tag);
      if (typeof params.minPrice === "number") query.set("minPrice", String(params.minPrice));
      if (typeof params.maxPrice === "number") query.set("maxPrice", String(params.maxPrice));
      if (params.inStock) query.set("inStock", "true");
      if (params.sort) query.set("sort", params.sort);
      query.set("page", String(params.page ?? 1));
      query.set("pageSize", String(params.pageSize ?? 24));

      const data = await apiRequest<CatalogProductsResponse>(`/api/products?${query.toString()}`);
      return {
        ...data,
        items: (data.items || []).map((row) => mapProduct(row)),
      };
    },
  });
}

export function useProductBySlugOrId(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: ["product", idOrSlug],
    enabled: !!idOrSlug,
    queryFn: async () => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(idOrSlug || "");
      const data = isUuid
        ? await apiRequest<ProductApiRow>(`/api/products/${idOrSlug}`)
        : await apiRequest<ProductApiRow>(`/api/products/by-slug/${idOrSlug}`);
      return mapProduct(data);
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const data = await apiRequest<CategoryApiRow[]>("/api/categories");
      return (data || []).map((c): Category => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        image: c.image,
        emoji: c.emoji,
        productCount: c.product_count || 0,
        sort_order: c.sort_order,
      }));
    },
  });
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  discount: string | null;
  link_url: string | null;
  link_text: string | null;
  variant: string;
  image: string | null;
  position: string;
  is_active: boolean;
  sort_order: number;
}

export function useBanners(position?: string) {
  return useQuery({
    queryKey: ["banners", position],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("is_active", "true");
      if (position) params.set("position", position);
      const data = await apiRequest<Banner[]>(`/api/banners?${params.toString()}`);
      return data || [];
    },
  });
}

export interface HeroProduct {
  id: string;
  product_id: string;
  badge: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  product?: Product;
}

export function useHeroProducts() {
  return useQuery({
    queryKey: ["hero-products"],
    queryFn: async () => {
      const data = await apiRequest<HeroProductApiRow[]>("/api/hero-products?is_active=true");
      return (data || []).map((row): HeroProduct => ({
        id: row.id,
        product_id: row.product_id,
        badge: row.badge,
        is_active: row.is_active,
        sort_order: row.sort_order,
        created_at: row.created_at,
        product: row.product ? mapProduct(row.product) : undefined,
      }));
    },
  });
}

export type HomeLayoutSectionKey =
  | "hero"
  | "trust"
  | "categories"
  | "gift_sets"
  | "promo_banners"
  | "premium"
  | "truffles"
  | "discounts"
  | "popular"
  | "articles";

export interface HomeLayoutSection {
  key: HomeLayoutSectionKey;
  enabled: boolean;
  title?: string;
  viewAllLink?: string;
  badge?: string;
  productIds?: string[];
  limit?: number;
}

export interface HomeSeoSettings {
  title?: string;
  description?: string;
  keywords?: string;
}

export interface HomeHeroSettings {
  topBadge?: string;
  headline?: string;
  highlight?: string;
  description?: string;
  primaryCtaText?: string;
  primaryCtaLink?: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  feature1?: string;
  feature2?: string;
}

export interface HomeTrustItem {
  icon?: "truck" | "shield" | "rotate" | "headphones";
  title: string;
  description: string;
}

export interface HomeLayout {
  sections: HomeLayoutSection[];
  featuredCategoryIds?: string[];
  seo?: HomeSeoSettings;
  hero?: HomeHeroSettings;
  trust?: HomeTrustItem[];
}

export function useHomeLayout() {
  return useQuery({
    queryKey: ["home-layout"],
    queryFn: async () => apiRequest<HomeLayout>("/api/home-layout"),
  });
}
