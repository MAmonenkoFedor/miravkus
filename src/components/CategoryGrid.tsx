import { Link } from "react-router-dom";
import { useCategories } from "@/hooks/useProducts";

export function CategoryGrid() {
  const { data: categories = [], isLoading } = useCategories();

  if (isLoading) {
    return (
      <section className="py-8 sm:py-12 bg-secondary">
        <div className="container-custom">
          <h2 className="font-heading font-bold text-xl sm:text-2xl mb-6 text-center">Категории товаров</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-card rounded-xl p-4 h-32 basis-[calc(50%-8px)] sm:basis-[calc(33.333%-10.666px)] lg:basis-[calc(16.666%-13.333px)]" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (categories.length === 0) return null;

  return (
    <section className="py-8 sm:py-12 bg-secondary">
      <div className="container-custom">
        <h2 className="font-heading font-bold text-xl sm:text-2xl mb-6 text-center">
          Категории товаров
        </h2>
        
        <div className="flex flex-wrap justify-center gap-4">
          {categories.map((category) => (
            <Link
              key={category.id}
              to={`/catalog?category=${category.slug}`}
              className="group basis-[calc(50%-8px)] sm:basis-[calc(33.333%-10.666px)] lg:basis-[calc(16.666%-13.333px)]"
            >
              <div className="bg-card rounded-xl p-4 text-center transition-all duration-300 hover:shadow-hover hover:-translate-y-1">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors overflow-hidden">
                  {category.image ? (
                    <img src={category.image} alt={category.name} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span className="text-2xl sm:text-3xl">{category.emoji || "📦"}</span>
                  )}
                </div>
                <h3 className="font-medium text-sm sm:text-base mb-1 group-hover:text-primary transition-colors">
                  {category.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {category.productCount} товаров
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
