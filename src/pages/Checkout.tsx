import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Truck, CheckCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, getErrorMessage } from "@/integrations/api/client";
import { toast } from "sonner";

const Checkout = () => {
  const { items, totalPrice, clearCart } = useCart();
  const { user, requestOtp } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("courier");
  const [paymentMethod, setPaymentMethod] = useState("card");

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("ru-RU").format(price) + " ₽";
  };

  const deliveryPrice = deliveryMethod === "pickup" ? 0 : (totalPrice >= 3000 ? 0 : 300);
  const finalTotal = totalPrice + deliveryPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const city = formData.get("city") as string || "";
    const address = formData.get("address") as string || "";
    const fullAddress = deliveryMethod === "courier" ? `${city}, ${address}` : "Самовывоз";

    const generatedOrderNumber = `МВ-${Date.now().toString().slice(-6)}`;

    try {
      // If user is logged in, save order to DB
      if (user) {
        await apiRequest("/api/orders", {
          method: "POST",
          body: JSON.stringify({
            order_number: generatedOrderNumber,
            status: "Новый",
            total_price: finalTotal,
            delivery_price: deliveryPrice,
            delivery_method: deliveryMethod,
            payment_method: paymentMethod,
            address: fullAddress,
            items: items.map(({ product, quantity }) => ({
              product_id: product.id,
              product_name: product.name,
              product_image: product.image,
              price: product.price,
              quantity,
            })),
            profile_name: name,
          }),
        });
      } else {
        if (phone) {
          const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
          await requestOtp(formattedPhone);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: unknown) {
      console.error("Order error:", error);
      toast.error(getErrorMessage(error, "Ошибка при оформлении заказа"));
      setIsSubmitting(false);
      return;
    }

    setOrderNumber(generatedOrderNumber);
    setIsSubmitting(false);
    setIsComplete(true);
    clearCart();
    toast.success("Заказ успешно оформлен!");
  };

  if (items.length === 0 && !isComplete) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="font-heading font-bold text-2xl mb-4">Корзина пуста</h1>
            <Link to="/catalog" className="text-primary hover:underline">
              Вернуться в каталог
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center bg-secondary/30">
          <div className="text-center px-4 max-w-md">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-trust/10 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-trust" />
            </div>
            <h1 className="font-heading font-bold text-2xl mb-2">Заказ оформлен!</h1>
            <p className="text-muted-foreground mb-2">
              Номер заказа: <span className="font-semibold text-foreground">#{orderNumber}</span>
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Мы отправили подтверждение на вашу почту. Наш менеджер свяжется с вами в ближайшее время.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/catalog">
                <Button className="btn-gold">Продолжить покупки</Button>
              </Link>
              {user && (
                <Link to="/account">
                  <Button variant="outline">Мои заказы</Button>
                </Link>
              )}
            </div>
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
          <Link
            to="/cart"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Вернуться в корзину
          </Link>
          
          <h1 className="font-heading font-bold text-2xl sm:text-3xl mb-6">
            Оформление заказа
          </h1>
          
          <form onSubmit={handleSubmit}>
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Contact Info */}
                <div className="bg-card rounded-xl p-6 shadow-card">
                  <h2 className="font-heading font-semibold text-lg mb-4">
                    Контактные данные
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Имя *</Label>
                      <Input id="name" name="name" placeholder="Ваше имя" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Телефон *</Label>
                      <Input id="phone" name="phone" type="tel" placeholder="+7 (___) ___-__-__" required />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" placeholder="email@example.com" />
                    </div>
                  </div>
                </div>
                
                {/* Delivery */}
                <div className="bg-card rounded-xl p-6 shadow-card">
                  <h2 className="font-heading font-semibold text-lg mb-4">
                    Способ доставки
                  </h2>
                  <RadioGroup value={deliveryMethod} onValueChange={setDeliveryMethod}>
                    <div className="space-y-3">
                      <label className="flex items-center gap-4 p-4 rounded-lg border border-border cursor-pointer hover:bg-secondary transition-colors">
                        <RadioGroupItem value="courier" id="courier" />
                        <Truck className="w-5 h-5 text-primary" />
                        <div className="flex-1">
                          <p className="font-medium">Курьерская доставка</p>
                          <p className="text-sm text-muted-foreground">1-3 рабочих дня</p>
                        </div>
                        <span className={totalPrice >= 3000 ? 'text-trust font-medium' : ''}>
                          {totalPrice >= 3000 ? 'Бесплатно' : '300 ₽'}
                        </span>
                      </label>
                      
                      <label className="flex items-center gap-4 p-4 rounded-lg border border-border cursor-pointer hover:bg-secondary transition-colors">
                        <RadioGroupItem value="pickup" id="pickup" />
                        <div className="w-5 h-5 flex items-center justify-center text-primary">📍</div>
                        <div className="flex-1">
                          <p className="font-medium">Самовывоз</p>
                          <p className="text-sm text-muted-foreground">Завтра с 10:00</p>
                        </div>
                        <span className="text-trust font-medium">Бесплатно</span>
                      </label>
                    </div>
                  </RadioGroup>
                  
                  {deliveryMethod === "courier" && (
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">Город *</Label>
                        <Input id="city" name="city" placeholder="Москва" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address">Адрес *</Label>
                        <Input id="address" name="address" placeholder="Улица, дом, квартира" required />
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Payment */}
                <div className="bg-card rounded-xl p-6 shadow-card">
                  <h2 className="font-heading font-semibold text-lg mb-4">
                    Способ оплаты
                  </h2>
                  <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                    <div className="space-y-3">
                      <label className="flex items-center gap-4 p-4 rounded-lg border border-border cursor-pointer hover:bg-secondary transition-colors">
                        <RadioGroupItem value="card" id="card" />
                        <CreditCard className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">Банковская карта</p>
                          <p className="text-sm text-muted-foreground">Visa, Mastercard, Мир</p>
                        </div>
                      </label>
                      
                      <label className="flex items-center gap-4 p-4 rounded-lg border border-border cursor-pointer hover:bg-secondary transition-colors">
                        <RadioGroupItem value="sbp" id="sbp" />
                        <div className="w-5 h-5 flex items-center justify-center text-primary font-bold text-xs">СБП</div>
                        <div>
                          <p className="font-medium">СБП</p>
                          <p className="text-sm text-muted-foreground">Система быстрых платежей</p>
                        </div>
                      </label>
                      
                      <label className="flex items-center gap-4 p-4 rounded-lg border border-border cursor-pointer hover:bg-secondary transition-colors">
                        <RadioGroupItem value="cash" id="cash" />
                        <div className="w-5 h-5 flex items-center justify-center text-primary">💵</div>
                        <div>
                          <p className="font-medium">При получении</p>
                          <p className="text-sm text-muted-foreground">Наличными или картой</p>
                        </div>
                      </label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
              
              {/* Order Summary */}
              <div className="lg:col-span-1">
                <div className="bg-card rounded-xl p-6 shadow-card sticky top-24">
                  <h2 className="font-heading font-bold text-lg mb-4">
                    Ваш заказ
                  </h2>
                  
                  <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
                    {items.map(({ product, quantity }) => (
                      <div key={product.id} className="flex gap-3">
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-secondary flex-shrink-0">
                          <img src={product.image} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{quantity} шт.</p>
                        </div>
                        <span className="text-sm font-medium">
                          {formatPrice(product.price * quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="border-t border-border pt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Товары</span>
                      <span>{formatPrice(totalPrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Доставка</span>
                      <span className={deliveryPrice === 0 ? 'text-trust' : ''}>
                        {deliveryPrice === 0 ? 'Бесплатно' : formatPrice(deliveryPrice)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="border-t border-border mt-4 pt-4">
                    <div className="flex justify-between items-baseline mb-4">
                      <span className="font-heading font-semibold">Итого</span>
                      <span className="font-heading font-bold text-2xl text-primary">
                        {formatPrice(finalTotal)}
                      </span>
                    </div>
                    
                    <Button
                      type="submit"
                      className="w-full btn-gold text-base py-6"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Оформляем...' : 'Оформить заказ'}
                    </Button>
                    
                    <p className="text-xs text-muted-foreground text-center mt-4">
                      Нажимая кнопку, вы соглашаетесь с условиями оферты
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Checkout;
