import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Heart, ShoppingCart, Menu, X, ChevronDown, User, Shield } from "lucide-react";
import logo from "@/assets/logo.png";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useAuth } from "@/context/AuthContext";
import { useCategories } from "@/hooks/useProducts";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { totalItems } = useCart();
  const { totalFavorites } = useFavorites();
  const { user, roles } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: categories = [] } = useCategories();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/catalog?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsMenuOpen(false);
    }
  };

  const isAdminUser = roles.includes("admin");

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
          <div className="flex-1 max-w-xl hidden md:block">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Найти сладости, подарки..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full input-search pl-10 pr-4 py-2.5"
              />
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
        <div className="mt-3 md:hidden">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Найти сладости..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full input-search pl-10 pr-4 py-2.5"
            />
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
