import { Helmet } from "react-helmet-async";
import type { Article } from "@/hooks/useArticles";

interface ArticleJsonLdProps {
  article: Article;
}

export const ArticleJsonLd = ({ article }: ArticleJsonLdProps) => {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const imageUrl = article.cover_image
    ? article.cover_image.startsWith("http://") || article.cover_image.startsWith("https://")
      ? article.cover_image
      : `${baseUrl}${article.cover_image.startsWith("/") ? "" : "/"}${article.cover_image}`
    : undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt || article.title,
    image: imageUrl,
    datePublished: article.created_at,
    dateModified: article.updated_at,
    author: {
      "@type": "Organization",
      name: "МираВкус",
    },
    publisher: {
      "@type": "Organization",
      name: "МираВкус",
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
};
