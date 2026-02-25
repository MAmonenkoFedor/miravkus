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
import { useProducts, useBanners } from "@/hooks/useProducts";
import { useMemo } from "react";

const Index = () => {
  const { data: products = [], isLoading } = useProducts();
  const { data: promoBanners = [] } = useBanners("promo");

  const giftSets = useMemo(() => products.filter(p => p.product_type === "gift" || p.category === "gift-sets"), [products]);
  const premiumProducts = useMemo(() => products.filter(p => p.isPremium || p.product_type === "premium"), [products]);
  const truffles = useMemo(() => products.filter(p => p.category === "truffles"), [products]);
  const discountedProducts = useMemo(() => products.filter(p => p.discount && p.discount > 0), [products]);

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Главная"
        description="Премиальные подарочные наборы сладостей, трюфели и шоколад. Доставка по России. Лучшие подарки для любого повода."
      />
      <SiteJsonLd />
      <Header />
      
      <main className="flex-1">
        <HeroBanner />
        <TrustBadges />
        <CategoryGrid />
        
        <ProductCarousel
          title="Подарочные наборы"
          products={giftSets}
          viewAllLink="/catalog?category=gift-sets"
        />
        
        {/* Promo Banners from DB */}
        {promoBanners.length > 0 && (
          <section className="py-4 sm:py-8">
            <div className="container-custom grid sm:grid-cols-2 gap-4">
              {promoBanners.slice(0, 2).map(b => (
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
        )}
        {promoBanners.length === 0 && (
          <section className="py-4 sm:py-8">
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
        )}
        
        <ProductCarousel
          title="Премиум коллекция"
          products={premiumProducts}
          viewAllLink="/catalog?category=premium-sets"
          badge="Эксклюзив"
        />
        
        <ProductCarousel
          title="Трюфели"
          products={truffles}
          viewAllLink="/catalog?category=truffles"
        />
        
        {discountedProducts.length > 0 && (
          <section className="py-8 sm:py-12 bg-destructive/5">
            <div className="container-custom">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="font-heading font-bold text-xl sm:text-2xl">
                  🔥 Товары со скидкой
                </h2>
                <span className="badge-sale">SALE</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {discountedProducts.slice(0, 5).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          </section>
        )}

        <ProductCarousel
          title="Популярные товары"
          products={products.slice(0, 8)}
          viewAllLink="/catalog"
        />

        <ArticlesSection />
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
