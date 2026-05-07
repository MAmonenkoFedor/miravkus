import { Link } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";

const Cart = () => {
  const { items, updateQuantity, removeFromCart, totalPrice, clearCart } = useCart();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("ru-RU").format(price) + " ₽";
  };

  const totalSavings = items.reduce((sum, item) => {
    if (item.product.oldPrice) {
      return sum + (item.product.oldPrice - item.product.price) * item.quantity;
    }
    return sum;
  }, 0);

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center bg-secondary/30">
          <div className="text-center px-4">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
              <ShoppingBag className="w-12 h-12 text-primary" />
            </div>
            <h1 className="font-heading font-bold text-2xl mb-2">Корзина пуста</h1>
            <p className="text-muted-foreground mb-6">
              Добавьте товары, чтобы оформить заказ
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
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-heading font-bold text-2xl sm:text-3xl">
              Корзина
            </h1>
            <Button variant="ghost" className="text-muted-foreground" onClick={clearCart}>
              Очистить корзину
            </Button>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {items.map(({ product, quantity }) => (
                <div
                  key={product.id}
                  className="bg-card rounded-xl p-4 shadow-card flex gap-4"
                >
                  {/* Image */}
                  <Link to={`/product/${product.id}`} className="flex-shrink-0">
                    <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden bg-secondary">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </Link>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link to={`/product/${product.id}`}>
                      <h3 className="font-medium text-sm sm:text-base line-clamp-2 hover:text-primary transition-colors">
                        {product.name}
                      </h3>
                    </Link>
                    
                    {product.discount && (
                      <span className="badge-sale text-xs mt-1 inline-block">
                        -{product.discount}%
                      </span>
                    )}
                    
                    {/* Price - Mobile */}
                    <div className="mt-2 sm:hidden">
                      <span className="font-heading font-bold text-lg">
                        {formatPrice(product.price * quantity)}
                      </span>
                    </div>
                    
                    {/* Quantity Controls */}
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex items-center gap-2 bg-secondary rounded-lg">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8"
                          onClick={() => updateQuantity(product.id, quantity - 1)}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="w-8 text-center font-medium">{quantity}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8"
                          onClick={() => updateQuantity(product.id, quantity + 1)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeFromCart(product.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Price - Desktop */}
                  <div className="hidden sm:block text-right">
                    <span className="font-heading font-bold text-xl">
                      {formatPrice(product.price * quantity)}
                    </span>
                    {product.oldPrice && (
                      <p className="text-sm text-muted-foreground line-through">
                        {formatPrice(product.oldPrice * quantity)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-card rounded-xl p-6 shadow-card sticky top-24">
                <h2 className="font-heading font-bold text-lg mb-4">
                  Итого
                </h2>
                
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Товары ({items.length})</span>
                    <span>{formatPrice(totalPrice + totalSavings)}</span>
                  </div>
                  
                  {totalSavings > 0 && (
                    <div className="flex justify-between text-trust">
                      <span>Скидка</span>
                      <span>-{formatPrice(totalSavings)}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Доставка</span>
                    <span className={totalPrice >= 3000 ? 'text-trust' : ''}>
                      {totalPrice >= 3000 ? 'Бесплатно' : formatPrice(300)}
                    </span>
                  </div>
                  
                  {totalPrice < 3000 && (
                    <p className="text-xs text-muted-foreground">
                      До бесплатной доставки: {formatPrice(3000 - totalPrice)}
                    </p>
                  )}
                </div>
                
                <div className="border-t border-border my-4" />
                
                <div className="flex justify-between items-baseline mb-6">
                  <span className="font-heading font-semibold text-lg">К оплате</span>
                  <span className="font-heading font-bold text-2xl text-primary">
                    {formatPrice(totalPrice + (totalPrice >= 3000 ? 0 : 300))}
                  </span>
                </div>
                
                <Link to="/checkout">
                  <Button className="w-full btn-gold text-base py-6">
                    Оформить заказ
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                
                <p className="text-xs text-muted-foreground text-center mt-4">
                  💳 Безопасная оплата • 🔒 SSL защита
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Cart;
