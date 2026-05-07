import { Helmet } from "react-helmet-async";
import { Product } from "@/types/product";

interface ProductJsonLdProps {
  product: Product;
}

export const ProductJsonLd = ({ product }: ProductJsonLdProps) => {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const toAbsolute = (value: string) => {
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    const separator = value.startsWith("/") ? "" : "/";
    return `${baseUrl}${separator}${value}`;
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.meta_description || product.description || product.name,
    image: product.images?.length ? product.images.map(toAbsolute) : [toAbsolute(product.image)],
    sku: product.id,
    brand: {
      "@type": "Brand",
      name: "МираВкус",
    },
    category: product.category || undefined,
    offers: {
      "@type": "Offer",
      url: typeof window !== "undefined" ? window.location.href : "",
      priceCurrency: "RUB",
      price: product.price,
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      ...(product.oldPrice && {
        priceValidUntil: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      }),
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewsCount || 1,
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
};
