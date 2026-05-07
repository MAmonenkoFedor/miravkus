import { Helmet } from "react-helmet-async";

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  noindex?: boolean;
  keywords?: string;
}

const SITE_NAME = "МираВкус — Азиатские сладости";
const DEFAULT_DESCRIPTION = "Премиальные азиатские сладости, подарочные наборы, трюфели. Доставка по России. Лучшие подарки для любого повода.";
const DEFAULT_IMAGE = "/placeholder.svg";

export const SEO = ({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  noindex = false,
  keywords,
}: SEOProps) => {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const baseUrl = import.meta.env.VITE_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const normalizeUrl = (value?: string) => {
    if (!value) return value || "";
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    const separator = value.startsWith("/") ? "" : "/";
    return `${baseUrl}${separator}${value}`;
  };
  const currentUrl = normalizeUrl(url || (typeof window !== "undefined" ? window.location.href : baseUrl));
  const imageUrl = normalizeUrl(image);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      <link rel="canonical" href={currentUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:alt" content={fullTitle} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="ru_RU" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      <meta name="twitter:image:alt" content={fullTitle} />
    </Helmet>
  );
};
