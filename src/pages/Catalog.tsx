import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SlidersHorizontal, Grid3X3, LayoutGrid, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Helmet } from "react-helmet-async";
import { useCatalogProducts, useCategories } from "@/hooks/useProducts";
import { trackEvent } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortOption = "popular" | "price-asc" | "price-desc" | "rating" | "newest";
type TagOption = "sale" | "new" | "hits";

const PAGE_SIZE = 24;
const SORT_SEQUENCE: SortOption[] = ["popular", "price-asc", "price-desc", "rating", "newest"];
const SORT_LABELS: Record<SortOption, string> = {
  popular: "Популярные",
  "price-asc": "Дешевле",
  "price-desc": "Дороже",
  rating: "Рейтинг",
  newest: "Новинки",
};

const Catalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") || undefined;
  const tag = (searchParams.get("tag") || undefined) as TagOption | undefined;
  const searchQuery = searchParams.get("search") || undefined;
  const sortBy = (searchParams.get("sort") || "popular") as SortOption;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  const inStock = searchParams.get("inStock") === "true";

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [gridCols, setGridCols] = useState<2 | 3 | 4>(3);
  const [priceMinInput, setPriceMinInput] = useState(minPrice || "");
  const [priceMaxInput, setPriceMaxInput] = useState(maxPrice || "");

  const { data: catalogData, isLoading: productsLoading } = useCatalogProducts({
    category,
    search: searchQuery,
    tag,
    sort: sortBy,
    page,
    pageSize: PAGE_SIZE,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    inStock,
  });
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const products = useMemo(() => catalogData?.items ?? [], [catalogData?.items]);
  const total = catalogData?.total || 0;
  const totalPages = catalogData?.totalPages || 1;
  const lastListTrackKey = useRef("");

  const setParam = useCallback((next: Record<string, string | undefined>) => {
    const draft = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (!value) {
        draft.delete(key);
      } else {
        draft.set(key, value);
      }
    });
    if (!next.page) {
      draft.delete("page");
    }
    setSearchParams(draft);
  }, [searchParams, setSearchParams]);

  const trackFilterApply = useCallback(
    (action: string, next?: Record<string, string | undefined>) => {
      const categoryValue = next?.category ?? category;
      const tagValue = next?.tag ?? tag;
      const searchValue = next?.search ?? searchQuery;
      const minPriceValue = next?.minPrice ?? minPrice ?? undefined;
      const maxPriceValue = next?.maxPrice ?? maxPrice ?? undefined;
      const inStockValue = (next?.inStock ?? (inStock ? "true" : undefined)) === "true";
      trackEvent("filter_apply", {
        action,
        category: categoryValue ?? null,
        tag: tagValue ?? null,
        search: searchValue ?? null,
        min_price: minPriceValue ?? null,
        max_price: maxPriceValue ?? null,
        in_stock: inStockValue,
      });
    },
    [category, tag, searchQuery, minPrice, maxPrice, inStock],
  );

  const handleSortChange = useCallback(
    (nextSort: SortOption, source: "select" | "mobile_cycle") => {
      trackEvent("sort_change", {
        from: sortBy,
        to: nextSort,
        source,
        category: category ?? null,
        tag: tag ?? null,
        search: searchQuery ?? null,
      });
      setParam({ sort: nextSort, page: "1" });
    },
    [sortBy, category, tag, searchQuery, setParam],
  );

  const applyFilters = () => {
    const next = {
      minPrice: priceMinInput.trim() || undefined,
      maxPrice: priceMaxInput.trim() || undefined,
      page: "1",
    };
    trackFilterApply("price_apply", next);
    setParam(next);
    setIsFilterOpen(false);
  };

  const clearFilters = () => {
    const keep = new URLSearchParams();
    if (category) keep.set("category", category);
    if (tag) keep.set("tag", tag);
    if (searchQuery) keep.set("search", searchQuery);
    if (sortBy) keep.set("sort", sortBy);
    setPriceMinInput("");
    setPriceMaxInput("");
    trackFilterApply("clear_all", { minPrice: undefined, maxPrice: undefined, inStock: undefined });
    setSearchParams(keep);
  };

  const handleCategoryChange = (categorySlug?: string) => {
    trackFilterApply("category_change", { category: categorySlug, tag: undefined });
    if (categorySlug) {
      setParam({ category: categorySlug, tag: undefined, page: "1" });
    } else {
      setParam({ category: undefined, page: "1" });
    }
  };

  const handleSortCycle = () => {
    const currentIndex = SORT_SEQUENCE.indexOf(sortBy);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % SORT_SEQUENCE.length;
    handleSortChange(SORT_SEQUENCE[nextIndex], "mobile_cycle");
  };

  const listName = useMemo(() => {
    if (searchQuery) return "search_results";
    if (category) return `category_${category}`;
    if (tag) return `tag_${tag}`;
    return "catalog_all";
  }, [searchQuery, category, tag]);

  useEffect(() => {
    if (productsLoading || products.length === 0) return;
    const trackKey = `${listName}|${page}|${sortBy}|${products.map((item) => item.id).join(",")}`;
    if (lastListTrackKey.current === trackKey) return;
    lastListTrackKey.current = trackKey;
    trackEvent("view_item_list", {
      list_name: listName,
      page,
      sort: sortBy,
      visible_count: products.length,
      total_count: total,
      category: category ?? null,
      tag: tag ?? null,
      search: searchQuery ?? null,
    });
  }, [productsLoading, products, listName, page, sortBy, total, category, tag, searchQuery]);

  const handleSelectItem = useCallback(
    (productId: string, productName: string, index: number) => {
      trackEvent("select_item", {
        list_name: listName,
        product_id: productId,
        product_name: productName,
        position: index + 1,
        page,
        sort: sortBy,
      });
    },
    [listName, page, sortBy],
  );

  const currentCategory = categories.find((c) => c.slug === category);
  const tagLabel = tag === "sale"
    ? "Акции"
    : tag === "new"
      ? "Новинки"
      : tag === "hits"
        ? "Хиты продаж"
        : null;

  const activeFilters = useMemo(() => {
    const items: { key: string; label: string; clear: () => void }[] = [];
    if (category) {
      items.push({
        key: "category",
        label: `Категория: ${currentCategory?.name || category}`,
        clear: () => {
          trackFilterApply("remove_filter_chip", { category: undefined });
          setParam({ category: undefined, page: "1" });
        },
      });
    }
    if (tagLabel) {
      items.push({
        key: "tag",
        label: tagLabel,
        clear: () => {
          trackFilterApply("remove_filter_chip", { tag: undefined });
          setParam({ tag: undefined, page: "1" });
        },
      });
    }
    if (searchQuery) {
      items.push({
        key: "search",
        label: `Поиск: ${searchQuery}`,
        clear: () => {
          trackFilterApply("remove_filter_chip", { search: undefined });
          setParam({ search: undefined, page: "1" });
        },
      });
    }
    if (minPrice) {
      items.push({
        key: "minPrice",
        label: `От ${minPrice} ₽`,
        clear: () => {
          setPriceMinInput("");
          trackFilterApply("remove_filter_chip", { minPrice: undefined });
          setParam({ minPrice: undefined, page: "1" });
        },
      });
    }
    if (maxPrice) {
      items.push({
        key: "maxPrice",
        label: `До ${maxPrice} ₽`,
        clear: () => {
          setPriceMaxInput("");
          trackFilterApply("remove_filter_chip", { maxPrice: undefined });
          setParam({ maxPrice: undefined, page: "1" });
        },
      });
    }
    if (inStock) {
      items.push({
        key: "inStock",
        label: "Только в наличии",
        clear: () => {
          trackFilterApply("remove_filter_chip", { inStock: undefined });
          setParam({ inStock: undefined, page: "1" });
        },
      });
    }
    return items;
  }, [category, currentCategory?.name, tagLabel, searchQuery, minPrice, maxPrice, inStock, setParam, trackFilterApply]);

  const quickChips = useMemo(
    () => [
      {
        key: "sale",
        label: "Акции",
        active: tag === "sale",
        onClick: () => {
          const nextTag = tag === "sale" ? undefined : "sale";
          trackFilterApply("quick_chip", { tag: nextTag, category: undefined });
          setParam({ tag: nextTag, category: undefined, page: "1" });
        },
      },
      {
        key: "new",
        label: "Новинки",
        active: tag === "new",
        onClick: () => {
          const nextTag = tag === "new" ? undefined : "new";
          trackFilterApply("quick_chip", { tag: nextTag, category: undefined });
          setParam({ tag: nextTag, category: undefined, page: "1" });
        },
      },
      {
        key: "hits",
        label: "Хиты",
        active: tag === "hits",
        onClick: () => {
          const nextTag = tag === "hits" ? undefined : "hits";
          trackFilterApply("quick_chip", { tag: nextTag, category: undefined });
          setParam({ tag: nextTag, category: undefined, page: "1" });
        },
      },
      {
        key: "stock",
        label: "В наличии",
        active: inStock,
        onClick: () => {
          const nextStock = inStock ? undefined : "true";
          trackFilterApply("quick_chip", { inStock: nextStock });
          setParam({ inStock: nextStock, page: "1" });
        },
      },
    ],
    [inStock, setParam, tag, trackFilterApply],
  );
  const activeFilterCount = activeFilters.length;

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
            itemListElement: products.slice(0, 30).map((p, idx) => ({
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
        <div className="container-custom py-6 sm:py-8 pb-24 sm:pb-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-muted-foreground mb-4">
            <Link to="/" className="hover:text-primary transition-colors">Главная</Link>
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
                {total} товаров
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
              
              <Select value={sortBy} onValueChange={(v) => handleSortChange(v as SortOption, "select")}>
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
                Фильтры{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </Button>
            </div>
          </div>

          <div className="mb-4 -mx-4 px-4 overflow-x-auto scrollbar-hide md:hidden">
            <div className="flex items-center gap-2 min-w-max">
              {quickChips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={chip.onClick}
                  className={`rounded-full px-3 py-2 text-sm border transition-colors ${
                    chip.active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:bg-secondary"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-card border border-border rounded-xl p-3">
              {activeFilters.map((item) => (
                <button
                  key={item.key}
                  onClick={item.clear}
                  className="inline-flex items-center gap-1 rounded-full bg-card border border-border px-3 py-1.5 text-sm hover:bg-secondary transition-colors"
                >
                  <span>{item.label}</span>
                  <X className="w-3 h-3" />
                </button>
              ))}
              <button
                onClick={clearFilters}
                className="text-sm text-primary hover:underline px-2 ml-auto"
              >
                Сбросить всё
              </button>
            </div>
          )}
          
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
                      onClick={() => {
                        trackFilterApply("section_all");
                        setSearchParams(new URLSearchParams());
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        !category && !tag ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-secondary'
                      }`}
                    >
                      Все товары
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        trackFilterApply("section_tag", { tag: "sale", category: undefined });
                        setParam({ tag: "sale", category: undefined, page: "1" });
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        tag === "sale" ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-secondary'
                      }`}
                    >
                      Акции
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        trackFilterApply("section_tag", { tag: "new", category: undefined });
                        setParam({ tag: "new", category: undefined, page: "1" });
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        tag === "new" ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-secondary'
                      }`}
                    >
                      Новинки
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        trackFilterApply("section_tag", { tag: "hits", category: undefined });
                        setParam({ tag: "hits", category: undefined, page: "1" });
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        tag === "hits" ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-secondary'
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
                          category.slug === currentCategory?.slug
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'hover:bg-secondary'
                        }`}
                      >
                        <span>{category.emoji ? `${category.emoji} ` : ""}{category.name}</span>
                        <span className={`text-xs ${
                          category.slug === currentCategory?.slug ? 'text-primary-foreground/70' : 'text-muted-foreground'
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
                      placeholder="от"
                      value={priceMinInput}
                      onChange={(event) => setPriceMinInput(event.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary text-sm"
                    />
                    <span className="text-muted-foreground">—</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="до"
                      value={priceMaxInput}
                      onChange={(event) => setPriceMaxInput(event.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm mt-3">
                    <input
                      type="checkbox"
                      checked={inStock}
                      onChange={(event) => {
                        const nextStock = event.target.checked ? "true" : undefined;
                        trackFilterApply("stock_toggle", { inStock: nextStock });
                        setParam({ inStock: nextStock, page: "1" });
                      }}
                    />
                    Только в наличии
                  </label>
                  <Button
                    variant="outline"
                    className="w-full mt-3"
                    onClick={applyFilters}
                  >
                    Применить цену
                  </Button>
                </div>
                
                {isFilterOpen && (
                  <Button className="w-full mt-6 lg:hidden btn-gold" onClick={applyFilters}>
                    Применить фильтры
                  </Button>
                )}
              </div>
            </aside>
            
            {/* Products Grid */}
            <div className="flex-1">
              {productsLoading ? (
                <div className={`grid gap-4 grid-cols-2 ${gridCols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="bg-card rounded-xl border border-border overflow-hidden animate-pulse">
                      <div className="aspect-[4/5] bg-secondary/70" />
                      <div className="p-3 sm:p-4 space-y-2">
                        <div className="h-3 w-20 bg-secondary/80 rounded" />
                        <div className="h-4 w-full bg-secondary/80 rounded" />
                        <div className="h-4 w-4/5 bg-secondary/80 rounded" />
                        <div className="h-6 w-28 bg-secondary/80 rounded mt-2" />
                        <div className="h-9 w-full bg-secondary/80 rounded mt-2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="bg-card rounded-xl p-12 text-center">
                  <div className="text-4xl mb-4">😔</div>
                  <h3 className="font-heading font-semibold text-lg mb-2">Товары не найдены</h3>
                  <p className="text-muted-foreground text-sm">Попробуйте изменить параметры фильтрации</p>
                  <Button variant="outline" className="mt-4" onClick={clearFilters}>
                    Сбросить фильтры
                  </Button>
                </div>
              ) : (
                <>
                  <div className={`grid gap-4 grid-cols-2 ${gridCols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
                    {products.map((product, index) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        analyticsContext="catalog"
                        onProductClick={() => handleSelectItem(product.id, product.name, index)}
                      />
                    ))}
                  </div>
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setParam({ page: String(page - 1) })}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Назад
                    </Button>
                    <div className="text-sm text-muted-foreground px-2">
                      Страница {page} из {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setParam({ page: String(page + 1) })}
                    >
                      Вперёд
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
        <div className="container-custom py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setIsFilterOpen(true)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Фильтры{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleSortCycle}>
            {SORT_LABELS[sortBy]}
          </Button>
          <div className="text-xs text-muted-foreground px-1 min-w-[64px] text-right">
            {total} шт
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default Catalog;
