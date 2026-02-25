import { Helmet } from "react-helmet-async";

export const SiteJsonLd = () => {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "МираВкус",
      url: baseUrl,
      logo: `${baseUrl}/favicon.ico`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "МираВкус",
      url: baseUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${baseUrl}/catalog?search={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
};
