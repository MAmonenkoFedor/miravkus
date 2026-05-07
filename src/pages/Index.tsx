import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { HeroBanner } from "@/components/HeroBanner";
import { ProductCarousel } from "@/components/ProductCarousel";
import { ProductCard } from "@/components/ProductCard";
import { CategoryGrid } from "@/components/CategoryGrid";
import { PromoBanner } from "@/components/PromoBanner";
import { TrustBadges } from "@/components/TrustBadges";
import { ArticlesSection } from "@/components/ArticlesSection";
import { SEO } from "@/components/SEO";
import { SiteJsonLd } from "@/components/SiteJsonLd";
import { useProducts, useBanners, useHomeLayout, useCategories } from "@/hooks/useProducts";
import { useMemo } from "react";
import type { Product } from "@/types/product";

const defaultHomeSections = [
  { key: "hero", enabled: true },
  { key: "trust", enabled: true },
  { key: "categories", enabled: true },
  { key: "gift_sets", enabled: true },
  { key: "promo_banners", enabled: true },
  { key: "premium", enabled: true },
  { key: "truffles", enabled: true },
  { key: "discounts", enabled: true },
  { key: "popular", enabled: true },
  { key: "articles", enabled: true },
];

const Index = () => {
  const { data: products = [], isLoading } = useProducts();
  const { data: promoBanners = [] } = useBanners("promo");
  const { data: homeLayout } = useHomeLayout();
  const { data: categories = [] } = useCategories();

  const giftSets = useMemo(() => products.filter(p => p.product_type === "gift" || p.category === "gift-sets"), [products]);
  const premiumProducts = useMemo(() => products.filter(p => p.isPremium || p.product_type === "premium"), [products]);
  const truffles = useMemo(() => products.filter(p => p.category === "truffles"), [products]);
  const discountedProducts = useMemo(() => products.filter(p => p.discount && p.discount > 0), [products]);
  const homeSections = homeLayout?.sections || defaultHomeSections;
  const featuredCategoryIds = useMemo(
    () => homeLayout?.featuredCategoryIds || [],
    [homeLayout?.featuredCategoryIds],
  );

  const featuredCategories = useMemo(() => {
    if (!featuredCategoryIds.length) return categories;
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    return featuredCategoryIds.map((id) => categoriesById.get(id)).filter(Boolean);
  }, [categories, featuredCategoryIds]);

  const homeSeo = homeLayout?.seo;
  const heroSettings = homeLayout?.hero;
  const trustItems = homeLayout?.trust;

  const pickProducts = (sectionKey: string, fallback: Product[]) => {
    const section = homeSections.find((item) => item.key === sectionKey);
    const ids = section?.productIds || [];
    const limit = section?.limit;
    if (!ids.length) {
      return typeof limit === "number" ? fallback.slice(0, limit) : fallback;
    }
    const productsById = new Map(products.map((product) => [product.id, product]));
    const manual = ids.map((id) => productsById.get(id)).filter(Boolean) as Product[];
    const resolved = manual.length ? manual : fallback;
    return typeof limit === "number" ? resolved.slice(0, limit) : resolved;
  };

  const giftSetsList = pickProducts("gift_sets", giftSets);
  const premiumList = pickProducts("premium", premiumProducts);
  const trufflesList = pickProducts("truffles", truffles);
  const discountsList = pickProducts("discounts", discountedProducts);
  const popularList = pickProducts("popular", products.slice(0, 8));

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title={homeSeo?.title || "Главная"}
        description={homeSeo?.description || "Премиальные подарочные наборы сладостей, трюфели и шоколад. Доставка по России. Лучшие подарки для любого повода."}
        keywords={homeSeo?.keywords || undefined}
      />
      <SiteJsonLd />
      <Header />
      
      <main className="flex-1">
        {homeSections.filter((section) => section.enabled).map((section) => {
          if (section.key === "hero") return <HeroBanner key={section.key} settings={heroSettings} />;
          if (section.key === "trust") return <TrustBadges key={section.key} items={trustItems} />;
          if (section.key === "categories") return <CategoryGrid key={section.key} categories={featuredCategories} />;
          if (section.key === "gift_sets") {
            return (
              <ProductCarousel
                key={section.key}
                title={section.title || "Подарочные наборы"}
                products={giftSetsList}
                viewAllLink={section.viewAllLink || "/catalog?category=gift-sets"}
              />
            );
          }
          if (section.key === "promo_banners") {
            if (promoBanners.length > 0) {
              return (
                <section key={section.key} className="py-4 sm:py-8">
                  <div className="container-custom grid sm:grid-cols-2 gap-4">
                    {promoBanners.slice(0, 2).map((b) => (
                      <PromoBanner
                        key={b.id}
                        title={b.title}
                        subtitle={b.subtitle || ""}
                        discount={b.discount || undefined}
                        linkUrl={b.link_url || "/catalog"}
                        linkText={b.link_text || "Подробнее"}
                        variant={b.variant === "red" ? "red" : "gold"}
                      />
                    ))}
                  </div>
                </section>
              );
            }
            return (
              <section key={section.key} className="py-4 sm:py-8">
                <div className="container-custom grid sm:grid-cols-2 gap-4">
                  <PromoBanner
                    title="Распродажа!"
                    subtitle="Скидки до 30% на трюфели"
                    discount="-30%"
                    linkUrl="/catalog?category=truffles"
                    linkText="К акции"
                    variant="red"
                  />
                  <PromoBanner
                    title="Премиум коллекция"
                    subtitle="Эксклюзивные наборы"
                    linkUrl="/catalog?category=premium-sets"
                    linkText="Смотреть"
                    variant="gold"
                  />
                </div>
              </section>
            );
          }
          if (section.key === "premium") {
            return (
              <ProductCarousel
                key={section.key}
                title={section.title || "Премиум коллекция"}
                products={premiumList}
                viewAllLink={section.viewAllLink || "/catalog?category=premium-sets"}
                badge={section.badge || "Эксклюзив"}
              />
            );
          }
          if (section.key === "truffles") {
            return (
              <ProductCarousel
                key={section.key}
                title={section.title || "Трюфели"}
                products={trufflesList}
                viewAllLink={section.viewAllLink || "/catalog?category=truffles"}
              />
            );
          }
          if (section.key === "discounts") {
            if (discountsList.length === 0) return null;
            return (
              <section key={section.key} className="py-8 sm:py-12 bg-destructive/5">
                <div className="container-custom">
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="font-heading font-bold text-xl sm:text-2xl">
                      🔥 {section.title || "Товары со скидкой"}
                    </h2>
                    <span className="badge-sale">SALE</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {discountsList.slice(0, 5).map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </div>
              </section>
            );
          }
          if (section.key === "popular") {
            return (
              <ProductCarousel
                key={section.key}
                title={section.title || "Популярные товары"}
                products={popularList}
                viewAllLink={section.viewAllLink || "/catalog"}
              />
            );
          }
          if (section.key === "articles") return <ArticlesSection key={section.key} />;
          return null;
        })}
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
