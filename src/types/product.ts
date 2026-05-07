export interface Product {
  id: string;
  name: string;
  price: number;
  oldPrice?: number | null;
  old_price?: number | null;
  discount?: number;
  image: string;
  images?: string[] | null;
  rating: number;
  reviewsCount: number;
  reviews_count?: number;
  category: string;
  category_id?: string | null;
  description?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  seo_text?: string | null;
  inStock: boolean;
  in_stock?: boolean;
  isPremium?: boolean;
  is_premium?: boolean;
  isNew?: boolean;
  is_new?: boolean;
  slug?: string | null;
  stock_count?: number | null;
  product_type?: string;
  sort_order?: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
  emoji?: string | null;
  productCount?: number;
  sort_order?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}
