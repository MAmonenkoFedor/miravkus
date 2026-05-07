import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Heart, ShoppingCart, Menu, X, ChevronDown, User, Shield } from "lucide-react";
import logo from "@/assets/logo.png";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useAuth } from "@/context/AuthContext";
import { useCatalogProducts, useCategories } from "@/hooks/useProducts";
import { trackEvent } from "@/lib/utils";

const POPULAR_SEARCHES = [
  "подарочные наборы",
  "японские сладости",
  "корейские снеки",
  "шоколадные боксы",
];
const RECENT_SEARCHES_KEY = "miravkus_recent_searches_v1";
const MAX_RECENT_SEARCHES = 6;

type SearchAction = {
  id: string;
  onSelect: () => void;
};

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { totalItems } = useCart();
  const { totalFavorites } = useFavorites();
  const { user, roles } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const desktopSearchRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchRef = useRef<HTMLDivElement | null>(null);
  const { data: categories = [] } = useCategories();
  const trimmedQuery = searchQuery.trim();
  const shouldSearch = trimmedQuery.length >= 2;
  const { data: searchData, isLoading: searchLoading } = useCatalogProducts({
    search: shouldSearch ? trimmedQuery : undefined,
    page: 1,
    pageSize: 6,
    sort: "popular",
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const inDesktop = desktopSearchRef.current?.contains(target);
      const inMobile = mobileSearchRef.current?.contains(target);
      if (!inDesktop && !inMobile) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, MAX_RECENT_SEARCHES);
        setRecentSearches(normalized);
      }
    } catch {
      setRecentSearches([]);
    }
  }, []);

  const categorySuggestions = useMemo(() => {
    if (!shouldSearch) return [];
    const query = trimmedQuery.toLowerCase();
    return categories
      .filter((category) => category.name.toLowerCase().includes(query))
      .slice(0, 4);
  }, [categories, shouldSearch, trimmedQuery]);

  const productSuggestions = useMemo(() => searchData?.items ?? [], [searchData?.items]);
  const showSuggestions = isSearchOpen;

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setIsMenuOpen(false);
    setActiveSuggestionIndex(-1);
  }, []);

  const persistRecentSearches = useCallback((next: string[]) => {
    setRecentSearches(next);
    try {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors (private mode / quota)
    }
  }, []);

  const addRecentSearch = useCallback(
    (query: string) => {
      const normalized = query.trim();
      if (!normalized) return;
      const next = [normalized, ...recentSearches.filter((item) => item.toLowerCase() !== normalized.toLowerCase())]
        .slice(0, MAX_RECENT_SEARCHES);
      persistRecentSearches(next);
    },
    [recentSearches, persistRecentSearches],
  );

  const clearRecentSearches = useCallback(() => {
    persistRecentSearches([]);
  }, [persistRecentSearches]);

  const goToSearch = useCallback((query: string, method: string = "submit") => {
    const normalized = query.trim();
    if (!normalized) return;
    trackEvent("search_submit", {
      method,
      query,
      query_length: normalized.length,
    });
    addRecentSearch(normalized);
    navigate(`/catalog?search=${encodeURIComponent(normalized)}`);
    closeSearch();
  }, [navigate, closeSearch, addRecentSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    goToSearch(searchQuery, "enter");
  };

  const isAdminUser = roles.includes("admin");
  const popularSuggestions = useMemo(
    () => POPULAR_SEARCHES.filter((value) => !recentSearches.some((recent) => recent.toLowerCase() === value.toLowerCase())),
    [recentSearches],
  );

  const searchActions = useMemo<SearchAction[]>(() => {
    if (!shouldSearch) {
      const recentActions = recentSearches.map((query) => ({
        id: `recent-${query}`,
        onSelect: () => {
          trackEvent("search_select_suggestion", { suggestion_type: "recent", value: query });
          setSearchQuery(query);
          goToSearch(query, "recent");
        },
      }));
      const popularActions = popularSuggestions.map((query) => ({
        id: `popular-${query}`,
        onSelect: () => {
          trackEvent("search_select_suggestion", { suggestion_type: "popular", value: query });
          setSearchQuery(query);
          goToSearch(query, "popular");
        },
      }));
      return [...recentActions, ...popularActions];
    }

    const actions: SearchAction[] = [];
    productSuggestions.forEach((product) => {
      actions.push({
        id: `product-${product.id}`,
        onSelect: () => {
          trackEvent("search_select_suggestion", {
            suggestion_type: "product",
            product_id: product.id,
            value: product.name,
          });
          navigate(`/product/${product.slug || product.id}`);
          closeSearch();
        },
      });
    });
    categorySuggestions.forEach((category) => {
      actions.push({
        id: `category-${category.id}`,
        onSelect: () => {
          trackEvent("search_select_suggestion", {
            suggestion_type: "category",
            category_id: category.id,
            value: category.name,
          });
          navigate(`/catalog?category=${category.slug}`);
          closeSearch();
        },
      });
    });
    actions.push({
      id: "view-all",
      onSelect: () => {
        trackEvent("search_select_suggestion", { suggestion_type: "view_all", value: trimmedQuery });
        goToSearch(trimmedQuery, "view_all");
      },
    });
    return actions;
  }, [shouldSearch, recentSearches, popularSuggestions, productSuggestions, categorySuggestions, navigate, trimmedQuery, closeSearch, goToSearch]);

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [trimmedQuery, shouldSearch, isSearchOpen, productSuggestions.length, categorySuggestions.length]);

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearchOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (searchActions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => (prev + 1) % searchActions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => (prev <= 0 ? searchActions.length - 1 : prev - 1));
      return;
    }
    if (event.key === "Enter" && activeSuggestionIndex >= 0) {
      event.preventDefault();
      searchActions[activeSuggestionIndex]?.onSelect();
    }
  };

  const highlightMatch = (text: string) => {
    if (!shouldSearch) return text;
    const source = text.toLowerCase();
    const query = trimmedQuery.toLowerCase();
    const index = source.indexOf(query);
    if (index < 0) return text;
    const before = text.slice(0, index);
    const match = text.slice(index, index + trimmedQuery.length);
    const after = text.slice(index + trimmedQuery.length);
    return (
      <>
        {before}
        <mark className="bg-gold/30 text-foreground rounded-sm px-0.5">{match}</mark>
        {after}
      </>
    );
  };

  const searchPanel = (
    <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-border bg-card shadow-hover overflow-hidden z-50">
      {!shouldSearch ? (
        <div className="py-2">
          {recentSearches.length > 0 && (
            <>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Недавние запросы</span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={clearRecentSearches}
                >
                  Очистить
                </button>
              </div>
              {recentSearches.map((query, index) => (
                <button
                  key={`recent-${query}`}
                  className={`w-full text-left px-3 py-2 transition-colors text-sm ${
                    activeSuggestionIndex === index ? "bg-secondary" : "hover:bg-secondary"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  onClick={() => searchActions[index]?.onSelect()}
                >
                  {query}
                </button>
              ))}
            </>
          )}
          <div className={`px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground ${recentSearches.length > 0 ? "mt-1 border-t border-border" : ""}`}>
            Популярные запросы
          </div>
          {popularSuggestions.map((query, offset) => {
            const index = recentSearches.length + offset;
            return (
              <button
                key={`popular-${query}`}
                className={`w-full text-left px-3 py-2 transition-colors text-sm ${
                  activeSuggestionIndex === index ? "bg-secondary" : "hover:bg-secondary"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveSuggestionIndex(index)}
                onClick={() => searchActions[index]?.onSelect()}
              >
                {query}
              </button>
            );
          })}
        </div>
      ) : searchLoading ? (
        <div className="p-3 text-sm text-muted-foreground">Ищем подходящие товары...</div>
      ) : (
        <>
          {productSuggestions.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">Товары</div>
              {productSuggestions.map((product, index) => (
                <button
                  key={product.id}
                  className={`w-full text-left px-3 py-2 transition-colors ${
                    activeSuggestionIndex === index ? "bg-secondary" : "hover:bg-secondary"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  onClick={() => searchActions[index]?.onSelect()}
                >
                  <div className="text-sm font-medium line-clamp-1">{highlightMatch(product.name)}</div>
                  <div className="text-xs text-muted-foreground">{new Intl.NumberFormat("ru-RU").format(product.price)} ₽</div>
                </button>
              ))}
            </div>
          )}
          {categorySuggestions.length > 0 && (
            <div className="py-1 border-t border-border">
              <div className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">Категории</div>
              {categorySuggestions.map((category, index) => (
                <button
                  key={category.id}
                  className={`w-full text-left px-3 py-2 transition-colors text-sm ${
                    activeSuggestionIndex === productSuggestions.length + index ? "bg-secondary" : "hover:bg-secondary"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveSuggestionIndex(productSuggestions.length + index)}
                  onClick={() => searchActions[productSuggestions.length + index]?.onSelect()}
                >
                  {highlightMatch(category.name)}
                </button>
              ))}
            </div>
          )}
          {productSuggestions.length === 0 && categorySuggestions.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">Ничего не найдено. Попробуйте другой запрос.</div>
          )}
          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              className={`w-full justify-start ${activeSuggestionIndex === productSuggestions.length + categorySuggestions.length ? "bg-secondary" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveSuggestionIndex(productSuggestions.length + categorySuggestions.length)}
              onClick={() => searchActions[productSuggestions.length + categorySuggestions.length]?.onSelect()}
            >
              <Search className="w-4 h-4 mr-2" />
              Смотреть все результаты
            </Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
      {/* Top bar */}
      <div className="bg-primary text-primary-foreground py-1.5 text-center text-xs sm:text-sm">
        <span className="font-medium">🎁 Бесплатная доставка от 3000₽</span>
        <span className="hidden sm:inline ml-4">📦 Доставка по всей России</span>
      </div>

      <div className="container-custom py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <img src={logo} alt="МираВкус" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
              <div className="hidden sm:block">
                <h1 className="font-heading font-bold text-lg text-primary leading-tight">МираВкус</h1>
                <p className="text-[10px] text-muted-foreground -mt-0.5">Азиатские сладости</p>
              </div>
            </div>
          </Link>

          {/* Catalog Button - Desktop */}
          <div className="hidden lg:block relative">
            <Button
              variant="default"
              className="bg-primary hover:bg-deepBlue-light gap-2 font-semibold"
              onClick={() => setIsCatalogOpen(!isCatalogOpen)}
            >
              <Menu className="w-4 h-4" />
              Каталог
              <ChevronDown className={`w-4 h-4 transition-transform ${isCatalogOpen ? 'rotate-180' : ''}`} />
            </Button>
            
            {isCatalogOpen && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-card rounded-xl shadow-hover border border-border overflow-hidden animate-fade-in">
                <div className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">Разделы</div>
                <Link
                  to="/catalog?tag=sale"
                  className="flex items-center justify-between px-4 py-3 hover:bg-secondary transition-colors"
                  onClick={() => setIsCatalogOpen(false)}
                >
                  <span className="font-medium text-sm">Акции</span>
                </Link>
                <Link
                  to="/catalog?tag=new"
                  className="flex items-center justify-between px-4 py-3 hover:bg-secondary transition-colors"
                  onClick={() => setIsCatalogOpen(false)}
                >
                  <span className="font-medium text-sm">Новинки</span>
                </Link>
                <Link
                  to="/catalog?tag=hits"
                  className="flex items-center justify-between px-4 py-3 hover:bg-secondary transition-colors"
                  onClick={() => setIsCatalogOpen(false)}
                >
                  <span className="font-medium text-sm">Хиты продаж</span>
                </Link>
                <div className="border-t border-border mt-2" />
                <div className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">Категории</div>
                {categories.map(category => (
                  <Link
                    key={category.id}
                    to={`/catalog?category=${category.slug}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-secondary transition-colors"
                    onClick={() => setIsCatalogOpen(false)}
                  >
                    <span className="font-medium text-sm">{category.name}</span>
                    <span className="text-xs text-muted-foreground">{category.productCount}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-xl hidden md:block" ref={desktopSearchRef}>
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Найти сладости, подарки..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (!isSearchOpen) {
                    trackEvent("search_open", { source: "desktop" });
                  }
                  setIsSearchOpen(true);
                }}
                onKeyDown={handleSearchKeyDown}
                className="w-full input-search pl-10 pr-4 py-2.5"
              />
              {showSuggestions && searchPanel}
            </form>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Search Mobile */}
            <Button variant="ghost" size="icon" className="md:hidden">
              <Search className="w-5 h-5" />
            </Button>

            {/* Favorites */}
            <Link to="/favorites">
              <Button variant="ghost" size="icon" className="relative">
                <Heart className={`w-5 h-5 ${totalFavorites > 0 ? 'fill-destructive text-destructive' : ''}`} />
                {totalFavorites > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center">
                    {totalFavorites}
                  </span>
                )}
              </Button>
            </Link>

            {/* Cart */}
            <Link to="/cart">
              <Button variant="ghost" size="icon" className="relative">
                <ShoppingCart className="w-5 h-5" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent text-accent-foreground text-xs font-bold rounded-full flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </Button>
            </Link>

            {/* Admin */}
            {isAdminUser && (
              <Link to="/admin">
                <Button variant="ghost" size="icon" title="Админ-панель">
                  <Shield className="w-5 h-5 text-accent" />
                </Button>
              </Link>
            )}

            {/* Account */}
            <Link to={user ? "/account" : "/auth"}>
              <Button variant="ghost" size="icon">
                <User className={`w-5 h-5 ${user ? 'text-primary' : ''}`} />
              </Button>
            </Link>

            {/* Mobile Menu */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="mt-3 md:hidden" ref={mobileSearchRef}>
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Найти сладости..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (!isSearchOpen) {
                  trackEvent("search_open", { source: "mobile" });
                }
                setIsSearchOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              className="w-full input-search pl-10 pr-4 py-2.5"
            />
            {showSuggestions && searchPanel}
          </form>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="lg:hidden bg-card border-t border-border animate-slide-in">
          <nav className="container-custom py-4 space-y-2">
            <div className="px-4 pt-2 text-xs uppercase tracking-wide text-muted-foreground">Разделы</div>
            <Link
              to="/catalog?tag=sale"
              className="block px-4 py-3 rounded-lg hover:bg-secondary font-medium transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              🔥 Акции
            </Link>
            <Link
              to="/catalog?tag=new"
              className="block px-4 py-3 rounded-lg hover:bg-secondary font-medium transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              ✨ Новинки
            </Link>
            <Link
              to="/catalog?tag=hits"
              className="block px-4 py-3 rounded-lg hover:bg-secondary font-medium transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              ⭐ Хиты продаж
            </Link>
            <div className="px-4 pt-2 text-xs uppercase tracking-wide text-muted-foreground">Категории</div>
            {categories.slice(0, 4).map(category => (
              <Link
                key={category.id}
                to={`/catalog?category=${category.slug}`}
                className="block px-4 py-2 pl-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                {category.name}
              </Link>
            ))}
            <Link
              to="/page/o-kompanii"
              className="block px-4 py-3 rounded-lg hover:bg-secondary font-medium transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              ℹ️ О нас
            </Link>
            <Link
              to="/page/dostavka-i-oplata"
              className="block px-4 py-3 rounded-lg hover:bg-secondary font-medium transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              🚚 Доставка
            </Link>
            <Link
              to="/articles"
              className="block px-4 py-3 rounded-lg hover:bg-secondary font-medium transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              📖 Мир вкуса
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
