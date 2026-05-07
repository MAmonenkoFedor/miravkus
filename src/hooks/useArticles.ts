import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/integrations/api/client";

export interface Article {
  id: string;
  title: string;
  slug: string;
  category: string;
  cover_image: string | null;
  excerpt: string | null;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  status: string;
  related_product_ids: string[];
  created_at: string;
  updated_at: string;
}

export function useArticles(onlyPublished = true) {
  return useQuery({
    queryKey: ["articles", onlyPublished],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (onlyPublished) params.set("status", "published");
      const data = await apiRequest<Article[]>(`/api/articles?${params.toString()}`);
      return data || [];
    },
  });
}

export function useArticleBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["article", slug],
    enabled: !!slug,
    queryFn: async () => {
      return apiRequest<Article>(`/api/articles/by-slug/${slug}`);
    },
  });
}
