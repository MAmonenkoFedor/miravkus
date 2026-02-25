import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal, Grid3X3, LayoutGrid } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Helmet } from "react-helmet-async";
import { useProducts, useCategories } from "@/hooks/useProducts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortOption = "popular" | "price-asc" | "price-desc" | "rating" | "newest";

const Catalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get("category");
  const tagParam = searchParams.get("tag");
  const searchQuery = searchParams.get("search") || "";
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryParam);
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [gridCols, setGridCols] = useState<2 | 3 | 4>(3);
  const [priceMinInput, setPriceMinInput] = useState("");
  const [priceMaxInput, setPriceMaxInput] = useState("");

  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();

  const priceBounds = useMemo(() => {
    if (!products.length) {
      return { min: 0, max: 0 };
    }
    const prices = products.map((product) => product.price);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  }, [products]);

  useEffect(() => {
    if (categoryParam !== selectedCategory) {
      setSelectedCategory(categoryParam);
    }
  }, [categoryParam, selectedCategory]);

  const filteredProducts = useMemo(() => {
    let result = [...products];
    const minValue = Number.parseFloat(priceMinInput);
    const maxValue = Number.parseFloat(priceMaxInput);
    const hasMin = Number.isFinite(minValue);
    const hasMax = Number.isFinite(maxValue);
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.description?.toLowerCase().includes(q)
      );
    }
    
    if (selectedCategory) {
      const hasCategory = categories.some((c) => c.slug === selectedCategory);
      if (hasCategory) {
        result = result.filter((p) => p.category === selectedCategory);
      } else if (selectedCategory === "gift-sets") {
        result = result.filter((p) => p.product_type === "gift" || p.category === "gift-sets");
      } else if (selectedCategory === "premium-sets") {
        result = result.filter((p) => p.isPremium || p.product_type === "premium" || p.category === "premium-sets");
      }
    }

    if (tagParam === "sale") {
      result = result.filter((p) => p.discount && p.discount > 0);
    } else if (tagParam === "new") {
      result = result.filter((p) => p.isNew);
    } else if (tagParam === "hits") {
      result = result.filter((p) => (p.reviewsCount || 0) > 0);
    }

    if (hasMin) {
      result = result.filter((product) => product.price >= minValue);
    }
    if (hasMax) {
      result = result.filter((product) => product.price <= maxValue);
    }
    
    switch (sortBy) {
      case "price-asc":
        result.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        result.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        result.sort((a, b) => b.rating - a.rating);
        break;
      case "newest":
        result.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
        break;
      default:
        result.sort((a, b) => b.reviewsCount - a.reviewsCount);
    }
    
    return result;
  }, [products, selectedCategory, sortBy, searchQuery, priceMinInput, priceMaxInput, categories, tagParam]);

  const handleCategoryChange = (categorySlug: string | null) => {
    setSelectedCategory(categorySlug);
    if (categorySlug) {
      setSearchParams({ category: categorySlug });
    } else {
      setSearchParams({});
    }
  };

  const currentCategory = categories.find(c => c.slug === selectedCategory);
  const tagLabel = tagParam === "sale"
    ? "Акции"
    : tagParam === "new"
      ? "Новинки"
      : tagParam === "hits"
        ? "Хиты продаж"
        : null;

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title={currentCategory ? currentCategory.name : tagLabel || "Каталог"}
        description={currentCategory ? `${currentCategory.name} — купить с доставкой по России` : tagLabel ? `${tagLabel} — купить с доставкой по России` : "Каталог подарочных наборов сладостей. Доставка по России."}
      />
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: filteredProducts.slice(0, 30).map((p, idx) => ({
              "@type": "ListItem",
              position: idx + 1,
              url: (typeof window !== "undefined" ? window.location.origin : "") + `/product/${p.slug || p.id}`,
              name: p.name,
            })),
          })}
        </script>
      </Helmet>
      <Header />
      <main className="flex-1 bg-secondary/30">
        <div className="container-custom py-6 sm:py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-muted-foreground mb-4">
            <a href="/" className="hover:text-primary transition-colors">Главная</a>
            <span className="mx-2">/</span>
            <span className="text-foreground">
              {currentCategory ? currentCategory.name : tagLabel || "Каталог"}
            </span>
          </nav>
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="font-heading font-bold text-2xl sm:text-3xl">
                {searchQuery 
                  ? `Результаты поиска: "${searchQuery}"` 
                  : currentCategory ? currentCategory.name : tagLabel || "Все товары"}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {filteredProducts.length} товаров
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-1 bg-card rounded-lg p-1">
                <Button variant={gridCols === 3 ? "secondary" : "ghost"} size="icon" className="w-8 h-8" onClick={() => setGridCols(3)}>
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button variant={gridCols === 4 ? "secondary" : "ghost"} size="icon" className="w-8 h-8" onClick={() => setGridCols(4)}>
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
              
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[180px] bg-card">
                  <SelectValue placeholder="Сортировка" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">По популярности</SelectItem>
                  <SelectItem value="price-asc">Сначала дешёвые</SelectItem>
                  <SelectItem value="price-desc">Сначала дорогие</SelectItem>
                  <SelectItem value="rating">По рейтингу</SelectItem>
                  <SelectItem value="newest">Новинки</SelectItem>
                </SelectContent>
              </Select>
              
              <Button variant="outline" className="lg:hidden" onClick={() => setIsFilterOpen(!isFilterOpen)}>
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Фильтры
              </Button>
            </div>
          </div>
          
          <div className="flex gap-6">
            {/* Sidebar Filters */}
            <aside className={`
              ${isFilterOpen ? 'fixed inset-0 z-50 bg-background p-4 overflow-auto' : 'hidden'}
              lg:block lg:static lg:w-64 lg:flex-shrink-0
            `}>
              {isFilterOpen && (
                <div className="flex items-center justify-between mb-4 lg:hidden">
                  <h2 className="font-heading font-bold text-lg">Фильтры</h2>
                  <Button variant="ghost" onClick={() => setIsFilterOpen(false)}>✕</Button>
                </div>
              )}
              
              <div className="bg-card rounded-xl p-4 lg:sticky lg:top-24">
                <h3 className="font-heading font-semibold mb-4">Разделы</h3>
                <ul className="space-y-2">
                  <li>
                    <button
                      onClick={() => handleCategoryChange(null)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        !selectedCategory && !tagParam ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-secondary'
                      }`}
                    >
                      Все товары
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setSearchParams({ tag: "sale" })}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        tagParam === "sale" ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-secondary'
                      }`}
                    >
                      Акции
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setSearchParams({ tag: "new" })}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        tagParam === "new" ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-secondary'
                      }`}
                    >
                      Новинки
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setSearchParams({ tag: "hits" })}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        tagParam === "hits" ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-secondary'
                      }`}
                    >
                      Хиты продаж
                    </button>
                  </li>
                </ul>

                <h3 className="font-heading font-semibold mt-6 mb-4">Категории</h3>
                <ul className="space-y-2">
                  {categories.map((category) => (
                    <li key={category.id}>
                      <button
                        onClick={() => handleCategoryChange(category.slug)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                          selectedCategory === category.slug
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'hover:bg-secondary'
                        }`}
                      >
                        <span>{category.emoji ? `${category.emoji} ` : ""}{category.name}</span>
                        <span className={`text-xs ${
                          selectedCategory === category.slug ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        }`}>
                          {category.productCount}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                
                <div className="mt-6 pt-6 border-t border-border">
                  <h3 className="font-heading font-semibold mb-4">Цена</h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder={priceBounds.min ? `от ${priceBounds.min}` : "от"}
                      value={priceMinInput}
                      onChange={(event) => setPriceMinInput(event.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary text-sm"
                    />
                    <span className="text-muted-foreground">—</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder={priceBounds.max ? `до ${priceBounds.max}` : "до"}
                      value={priceMaxInput}
                      onChange={(event) => setPriceMaxInput(event.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary text-sm"
                    />
                  </div>
                </div>
                
                {isFilterOpen && (
                  <Button className="w-full mt-6 lg:hidden btn-gold" onClick={() => setIsFilterOpen(false)}>
                    Применить фильтры
                  </Button>
                )}
              </div>
            </aside>
            
            {/* Products Grid */}
            <div className="flex-1">
              {productsLoading ? (
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-card rounded-xl animate-pulse aspect-[3/4]" />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-card rounded-xl p-12 text-center">
                  <div className="text-4xl mb-4">😔</div>
                  <h3 className="font-heading font-semibold text-lg mb-2">Товары не найдены</h3>
                  <p className="text-muted-foreground text-sm">Попробуйте изменить параметры фильтрации</p>
                </div>
              ) : (
                <div className={`grid gap-4 grid-cols-2 ${gridCols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
                  {filteredProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Catalog;
