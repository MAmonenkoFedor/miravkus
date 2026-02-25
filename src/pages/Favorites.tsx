import { Link } from "react-router-dom";
import { Heart, Trash2, ShoppingCart, ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/context/FavoritesContext";
import { useCart } from "@/context/CartContext";
import { toast } from "sonner";

const Favorites = () => {
  const { favorites, removeFromFavorites } = useFavorites();
  const { addToCart } = useCart();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("ru-RU").format(price) + " ₽";
  };

  const handleAddToCart = (product: typeof favorites[0]) => {
    addToCart(product);
    toast.success("Добавлено в корзину", {
      description: product.name,
    });
  };

  if (favorites.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center bg-secondary/30">
          <div className="text-center px-4">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
              <Heart className="w-12 h-12 text-destructive" />
            </div>
            <h1 className="font-heading font-bold text-2xl mb-2">Избранное пусто</h1>
            <p className="text-muted-foreground mb-6">
              Добавьте товары в избранное, нажав на сердечко
            </p>
            <Link to="/catalog">
              <Button className="btn-gold">
                Перейти в каталог
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 bg-secondary/30">
        <div className="container-custom py-6 sm:py-8">
          <h1 className="font-heading font-bold text-2xl sm:text-3xl mb-6">
            Избранное ({favorites.length})
          </h1>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {favorites.map((product) => (
              <div key={product.id} className="bg-card rounded-xl overflow-hidden shadow-card">
                <Link to={`/product/${product.id}`}>
                  <div className="relative aspect-square bg-secondary">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                    {product.discount && (
                      <span className="absolute top-2 left-2 badge-sale">
                        -{product.discount}%
                      </span>
                    )}
                  </div>
                </Link>
                
                <div className="p-3">
                  <Link to={`/product/${product.id}`}>
                    <h3 className="font-medium text-sm line-clamp-2 hover:text-primary transition-colors">
                      {product.name}
                    </h3>
                  </Link>
                  
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-heading font-bold text-lg">
                      {formatPrice(product.price)}
                    </span>
                    {product.oldPrice && (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatPrice(product.oldPrice)}
                      </span>
                    )}
                  </div>
                  
                  <div className="mt-3 flex gap-2">
                    <Button
                      className="flex-1 btn-gold text-xs py-2"
                      onClick={() => handleAddToCart(product)}
                    >
                      <ShoppingCart className="w-3 h-3 mr-1" />
                      В корзину
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={() => removeFromFavorites(product.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Favorites;
