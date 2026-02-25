import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBanners, useHeroProducts, useProducts } from "@/hooks/useProducts";
import { useMemo } from "react";

export function HeroBanner() {
  const { data: products = [] } = useProducts();
  const { data: promoBanners = [] } = useBanners("promo");
  const { data: heroProducts = [] } = useHeroProducts();

  const lowStockProduct = useMemo(
    () => products.find(p => p.inStock && p.stock_count !== null && p.stock_count !== undefined && p.stock_count <= 5),
    [products]
  );
  const premiumProduct = useMemo(
    () => products.find(p => p.isPremium || p.product_type === "premium"),
    [products]
  );
  const promo = promoBanners[0] || null;
  const heroProductEntry = heroProducts.find((entry) => entry.product) || null;
  const heroProduct = promo ? null : (heroProductEntry?.product || lowStockProduct || premiumProduct || products[0] || null);
  const badge = promo ? "Акция" : heroProductEntry?.badge || (lowStockProduct ? "Хит" : "Премиум");
  const imageSrc = promo?.image || heroProduct?.image || "/placeholder.svg";
  const price = heroProduct?.price ? new Intl.NumberFormat("ru-RU").format(heroProduct.price) + " ₽" : null;
  const oldPrice = heroProduct?.oldPrice ? new Intl.NumberFormat("ru-RU").format(heroProduct.oldPrice) + " ₽" : null;
  const title = promo?.title || heroProduct?.name || "Товар недели";
  const subtitle = promo?.subtitle || heroProduct?.description || "Эксклюзивная коллекция";
  const ctaLink = promo?.link_url || (heroProduct ? `/product/${heroProduct.slug || heroProduct.id}` : "/catalog");
  const ctaText = promo?.link_text || "Смотреть товар";

  return (
    <section className="relative overflow-hidden bg-gradient-blue">
      <div className="container-custom py-12 sm:py-16 lg:py-24 relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Content */}
          <div className="text-white space-y-6 text-center lg:text-left">
            <div className="inline-block">
              <span className="badge-premium text-sm px-4 py-1.5">
                🎁 Новая коллекция
              </span>
            </div>
            
            <h1 className="font-heading font-bold text-3xl sm:text-4xl lg:text-5xl xl:text-6xl leading-tight">
              Премиальные <br />
              <span className="text-gradient-gold">подарочные наборы</span>
            </h1>
            
            <p className="text-white/80 text-base sm:text-lg max-w-lg mx-auto lg:mx-0">
              Изысканные азиатские сладости в элегантной упаковке. 
              Идеальный подарок для ваших близких.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link to="/catalog?category=gift-sets">
                <Button className="btn-gold text-base px-8 py-6 w-full sm:w-auto">
                  Выбрать подарок
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/catalog">
                <Button variant="outline" className="border-white/30 text-white bg-transparent hover:bg-white/10 text-base px-8 py-6 w-full sm:w-auto">
                  Смотреть каталог
                </Button>
              </Link>
            </div>
            
            <div className="flex items-center justify-center lg:justify-start gap-6 pt-4 text-white/60 text-sm">
              <span className="flex items-center gap-2">
                <span className="text-lg">✓</span> Бесплатная доставка
              </span>
              <span className="flex items-center gap-2">
                <span className="text-lg">✓</span> Гарантия качества
              </span>
            </div>
          </div>

          {/* Image placeholder */}
          <div className="hidden lg:flex justify-center">
            <div className="relative w-[400px] h-[400px]">
              <div className="absolute inset-0 bg-gradient-to-br from-gold/20 to-transparent rounded-full animate-pulse" />
              <div className="absolute inset-8 bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 overflow-hidden">
                <div className="relative w-full h-full">
                  <img src={imageSrc} alt={title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  <div className="absolute top-4 left-4">
                    <span className="badge-premium text-xs px-3 py-1">{badge}</span>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 text-white space-y-1">
                    <p className="text-sm uppercase text-white/80">{promo ? "Акция" : "Товар недели"}</p>
                    <p className="font-semibold">{title}</p>
                    <p className="text-xs text-white/80 line-clamp-2">{subtitle}</p>
                    {heroProduct && (
                      <div className="flex items-baseline gap-2">
                        {price && <span className="text-lg font-semibold">{price}</span>}
                        {oldPrice && <span className="text-xs text-white/60 line-through">{oldPrice}</span>}
                      </div>
                    )}
                    {ctaLink.startsWith("/") ? (
                      <Link to={ctaLink} className="inline-flex">
                        <span className="text-xs font-medium text-gold">Смотреть</span>
                      </Link>
                    ) : (
                      <a href={ctaLink} className="inline-flex">
                        <span className="text-xs font-medium text-gold">Смотреть</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-gold/5 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}
