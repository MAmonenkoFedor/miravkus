import { useState } from "react";
import { Link } from "react-router-dom";
import { Star, Heart, ShoppingCart, Minus, Plus, Truck, ShieldCheck, RotateCcw } from "lucide-react";
import { Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { toast } from "sonner";
import { trackEvent } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
  analyticsContext?: "catalog" | "home" | "article" | "carousel";
  onProductClick?: (product: Product) => void;
}

export function ProductCard({ product, analyticsContext = "carousel", onProductClick }: ProductCardProps) {
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const { addToCart, updateQuantity, items } = useCart();
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();
  const favorite = isFavorite(product.id);
  const cartItem = items.find((item) => item.product.id === product.id);
  const quantity = cartItem?.quantity ?? 0;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product);
    if (analyticsContext === "catalog") {
      trackEvent("add_to_cart_from_catalog", {
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        quantity: quantity + 1,
      });
    }
    toast.success("Добавлено в корзину", {
      description: product.name,
    });
  };

  const handleIncrease = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!product.inStock) return;
    updateQuantity(product.id, quantity + 1);
    if (analyticsContext === "catalog") {
      trackEvent("add_to_cart_from_catalog", {
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        quantity: quantity + 1,
      });
    }
  };

  const handleDecrease = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateQuantity(product.id, quantity - 1);
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (favorite) {
      removeFromFavorites(product.id);
      toast.info("Удалено из избранного");
    } else {
      addToFavorites(product);
      toast.success("Добавлено в избранное");
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("ru-RU").format(price) + " ₽";
  };

  const productLink = `/product/${product.slug || product.id}`;
  const gallery = product.images && product.images.length > 0 ? [product.image, ...product.images.filter((img) => img !== product.image)] : [product.image];

  const handleOpenQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsQuickViewOpen(true);
    setActiveImage(0);
    if (analyticsContext === "catalog") {
      trackEvent("quick_view_open", {
        product_id: product.id,
        product_name: product.name,
      });
    }
  };

  return (
    <>
      <Link
        to={productLink}
        className="block"
        onClick={() => onProductClick?.(product)}
      >
        <article className="card-product group h-full flex flex-col border border-border/70 hover:border-primary/20">
        {/* Image */}
        <div className="relative aspect-square sm:aspect-[4/5] w-full bg-secondary overflow-hidden p-3 sm:p-4">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          
          {/* Badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {product.discount && (
              <span className="badge-sale">-{product.discount}%</span>
            )}
            {product.isPremium && (
              <span className="badge-premium">Premium</span>
            )}
            {product.isNew && (
              <span className="bg-trust text-white text-xs font-bold px-2 py-1 rounded-md">
                Новинка
              </span>
            )}
            {product.inStock && (
              <span className="bg-emerald-600 text-white text-[11px] font-semibold px-2 py-1 rounded-md">
                В наличии
              </span>
            )}
          </div>

          {/* Favorite */}
          <button
            onClick={handleToggleFavorite}
            className="absolute top-2 right-2 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
            aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"}
          >
            <Heart
              className={`w-5 h-5 transition-colors ${
                favorite ? "fill-destructive text-destructive" : "text-muted-foreground"
              }`}
            />
          </button>

          {/* Quick Add - Shows on hover */}
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
            {quantity > 0 ? (
              <div className="w-full bg-white/95 rounded-lg px-2 py-1 flex items-center justify-between">
                <Button size="icon" variant="ghost" onClick={handleDecrease} className="h-8 w-8">
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-sm font-semibold text-foreground">{quantity} шт</span>
                <Button size="icon" variant="ghost" onClick={handleIncrease} className="h-8 w-8">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleAddToCart}
                className="w-full btn-gold text-sm py-2"
                disabled={!product.inStock}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                В корзину
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-3 sm:p-4 flex flex-col">
          {/* Rating */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-gold text-gold" />
              <span className="text-sm font-medium">{product.rating}</span>
              <span className="text-xs text-muted-foreground">
                ({product.reviewsCount})
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">Быстрая доставка</span>
          </div>

          {/* Name */}
          <h3 className="font-medium text-sm sm:text-base line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {product.name}
          </h3>

          {/* Price */}
          <div className="mt-auto flex items-end gap-2">
            <span className="font-heading font-bold text-xl sm:text-2xl text-primary leading-none">
              {formatPrice(product.price)}
            </span>
            {product.oldPrice && (
              <span className="text-sm text-muted-foreground line-through leading-none">
                {formatPrice(product.oldPrice)}
              </span>
            )}
          </div>

          {/* Stock */}
          {!product.inStock && (
            <p className="text-xs text-destructive mt-2 font-medium">Нет в наличии</p>
          )}

          <Button
            variant="outline"
            className="w-full mt-3 h-9 text-sm"
            onClick={handleOpenQuickView}
          >
            Быстрый просмотр
          </Button>

          {product.inStock && (
            <div className="mt-3">
              {quantity > 0 ? (
                <div className="rounded-lg border border-border px-2 py-1 flex items-center justify-between">
                  <Button size="icon" variant="ghost" onClick={handleDecrease} className="h-8 w-8">
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-semibold">{quantity} в корзине</span>
                  <Button size="icon" variant="ghost" onClick={handleIncrease} className="h-8 w-8">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button onClick={handleAddToCart} className="w-full btn-gold text-sm py-2">
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  В корзину
                </Button>
              )}
            </div>
          )}
        </div>
        </article>
      </Link>

      <Dialog open={isQuickViewOpen} onOpenChange={setIsQuickViewOpen}>
        <DialogContent className="max-w-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8">{product.name}</DialogTitle>
            <DialogDescription>
              Рейтинг {product.rating} ({product.reviewsCount} отзывов)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <div className="bg-secondary rounded-lg p-3 aspect-square">
                <img src={gallery[activeImage]} alt={product.name} className="w-full h-full object-contain" />
              </div>
              {gallery.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {gallery.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      onClick={() => setActiveImage(index)}
                      className={`w-12 h-12 rounded-md border overflow-hidden shrink-0 ${
                        activeImage === index ? "border-primary ring-1 ring-primary/40" : "border-border"
                      }`}
                    >
                      <img src={image} alt={`${product.name} ${index + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <span className="font-heading font-bold text-2xl text-primary">{formatPrice(product.price)}</span>
                {product.oldPrice && (
                  <span className="text-sm text-muted-foreground line-through">{formatPrice(product.oldPrice)}</span>
                )}
              </div>
              {product.description && (
                <p className="text-sm text-muted-foreground line-clamp-4">{product.description}</p>
              )}
              <div className="text-sm">
                {product.inStock ? (
                  <span className="text-emerald-600 font-medium">В наличии</span>
                ) : (
                  <span className="text-destructive font-medium">Нет в наличии</span>
                )}
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground bg-secondary/60 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-primary" />
                  <span>Доставка по России от 1 до 5 дней</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span>Безопасная онлайн-оплата</span>
                </div>
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-primary" />
                  <span>Возврат и обмен по правилам магазина</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                {product.inStock && quantity > 0 ? (
                  <div className="rounded-lg border border-border px-2 py-1 flex items-center justify-between flex-1">
                    <Button size="icon" variant="ghost" onClick={handleDecrease} className="h-8 w-8">
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-semibold">{quantity} в корзине</span>
                    <Button size="icon" variant="ghost" onClick={handleIncrease} className="h-8 w-8">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="btn-gold"
                    disabled={!product.inStock}
                    onClick={handleAddToCart}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Добавить в корзину
                  </Button>
                )}
                <Link to={productLink} onClick={() => setIsQuickViewOpen(false)}>
                  <Button variant="outline" className="w-full">Открыть товар</Button>
                </Link>
              </div>
            </div>
          </div>
          <div className="sm:hidden sticky bottom-0 -mx-4 mt-4 border-t border-border bg-background/95 backdrop-blur px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">Цена</div>
                <div className="font-heading font-bold text-lg text-primary">{formatPrice(product.price)}</div>
              </div>
              {product.inStock && quantity > 0 ? (
                <div className="rounded-lg border border-border px-2 py-1 flex items-center justify-between min-w-[150px]">
                  <Button size="icon" variant="ghost" onClick={handleDecrease} className="h-8 w-8">
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-semibold">{quantity}</span>
                  <Button size="icon" variant="ghost" onClick={handleIncrease} className="h-8 w-8">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button className="btn-gold h-10" disabled={!product.inStock} onClick={handleAddToCart}>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  В корзину
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
