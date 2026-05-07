import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Product } from "@/types/product";
import { ProductCard } from "./ProductCard";
import { Button } from "@/components/ui/button";

interface ProductCarouselProps {
  title: string;
  products: Product[];
  viewAllLink?: string;
  badge?: string;
}

export function ProductCarousel({ title, products, viewAllLink, badge }: ProductCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (products.length === 0) return null;

  return (
    <section className="py-8 sm:py-12">
      <div className="container-custom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="font-heading font-bold text-xl sm:text-2xl">{title}</h2>
            {badge && (
              <span className="badge-premium hidden sm:inline-block">{badge}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {viewAllLink && (
              <a
                href={viewAllLink}
                className="text-sm font-medium text-primary hover:text-gold transition-colors hidden sm:block"
              >
                Смотреть все →
              </a>
            )}
            <Button
              variant="outline"
              size="icon"
              className="w-9 h-9 rounded-full"
              onClick={() => scroll("left")}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="w-9 h-9 rounded-full"
              onClick={() => scroll("right")}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Carousel */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          {products.map((product) => (
            <div key={product.id} className="flex-shrink-0 w-[200px] sm:w-[240px]">
              <ProductCard product={product} />
            </div>
          ))}
        </div>

        {/* Mobile View All */}
        {viewAllLink && (
          <div className="sm:hidden text-center mt-4">
            <a
              href={viewAllLink}
              className="text-sm font-medium text-primary hover:text-gold transition-colors"
            >
              Смотреть все товары →
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
