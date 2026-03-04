import { Link } from "react-router-dom";
import { Star, Heart, ShoppingCart } from "lucide-react";
import { Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { toast } from "sonner";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addToCart } = useCart();
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();
  const favorite = isFavorite(product.id);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product);
    toast.success("Добавлено в корзину", {
      description: product.name,
    });
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

  return (
    <Link to={productLink} className="block">
      <article className="card-product group h-full flex flex-col">
        {/* Image */}
        <div className="relative aspect-[4/5] w-[80%] mx-auto bg-secondary overflow-hidden">
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
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              onClick={handleAddToCart}
              className="w-full btn-gold text-sm py-2"
              disabled={!product.inStock}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              В корзину
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-3 sm:p-4 flex flex-col">
          {/* Rating */}
          <div className="flex items-center gap-1 mb-2">
            <Star className="w-4 h-4 fill-gold text-gold" />
            <span className="text-sm font-medium">{product.rating}</span>
            <span className="text-xs text-muted-foreground">
              ({product.reviewsCount})
            </span>
          </div>

          {/* Name */}
          <h3 className="font-medium text-sm sm:text-base line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {product.name}
          </h3>

          {/* Price */}
          <div className="mt-auto flex items-baseline gap-2">
            <span className="font-heading font-bold text-lg sm:text-xl text-primary">
              {formatPrice(product.price)}
            </span>
            {product.oldPrice && (
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(product.oldPrice)}
              </span>
            )}
          </div>

          {/* Stock */}
          {!product.inStock && (
            <p className="text-xs text-destructive mt-2 font-medium">Нет в наличии</p>
          )}
        </div>
      </article>
    </Link>
  );
}
