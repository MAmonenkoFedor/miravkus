import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, CreditCard, Truck } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { apiRequest } from "@/integrations/api/client";

interface OrderItem {
  id: string;
  product_name: string;
  product_image: string | null;
  price: number;
  quantity: number;
}

interface OrderData {
  id: string;
  order_number: string;
  status: string;
  total_price: number;
  delivery_price: number;
  delivery_method: string | null;
  payment_method: string | null;
  address: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  "Новый": "bg-blue-100 text-blue-700",
  "В обработке": "bg-yellow-100 text-yellow-700",
  "Отправлен": "bg-purple-100 text-purple-700",
  "Доставлен": "bg-green-100 text-green-700",
};

const paymentLabels: Record<string, string> = {
  card: "Банковская карта",
  sbp: "СБП",
  cash: "При получении",
};

const deliveryLabels: Record<string, string> = {
  courier: "Курьерская доставка",
  pickup: "Самовывоз",
};

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!id) return;
      const [orderRes, itemsRes] = await Promise.all([
        apiRequest<OrderData>(`/api/my/orders/${id}`),
        apiRequest<OrderItem[]>(`/api/my/orders/${id}/items`),
      ]);
      setOrder(orderRes || null);
      setItems(itemsRes || []);
      setLoading(false);
    };
    fetch();
  }, [id]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("ru-RU").format(price) + " ₽";

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Заказ не найден</p>
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
            to="/account"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Мои заказы
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <h1 className="font-heading font-bold text-2xl">{order.order_number}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[order.status] || "bg-muted text-muted-foreground"}`}>
              {order.status}
            </span>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            {formatDate(order.created_at)}
          </p>

          {/* Items */}
          <div className="bg-card rounded-xl p-5 shadow-card mb-4">
            <h2 className="font-heading font-semibold mb-4">Товары</h2>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-secondary flex-shrink-0">
                    <img
                      src={item.product_image || "/placeholder.svg"}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity} шт. × {formatPrice(item.price)}</p>
                  </div>
                  <span className="text-sm font-medium">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Details */}
          <div className="grid sm:grid-cols-2 gap-4">
            {order.delivery_method && (
              <div className="bg-card rounded-xl p-5 shadow-card">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm">Доставка</h3>
                </div>
                <p className="text-sm">{deliveryLabels[order.delivery_method] || order.delivery_method}</p>
                {order.address && (
                  <div className="flex items-start gap-1 mt-2">
                    <MapPin className="w-3 h-3 text-muted-foreground mt-0.5" />
                    <p className="text-xs text-muted-foreground">{order.address}</p>
                  </div>
                )}
                <p className="text-sm mt-2">
                  {order.delivery_price === 0 ? (
                    <span className="text-trust">Бесплатно</span>
                  ) : (
                    formatPrice(order.delivery_price)
                  )}
                </p>
              </div>
            )}

            {order.payment_method && (
              <div className="bg-card rounded-xl p-5 shadow-card">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm">Оплата</h3>
                </div>
                <p className="text-sm">{paymentLabels[order.payment_method] || order.payment_method}</p>
              </div>
            )}
          </div>

          {/* Total */}
          <div className="bg-card rounded-xl p-5 shadow-card mt-4">
            <div className="flex justify-between items-baseline">
              <span className="font-heading font-semibold">Итого</span>
              <span className="font-heading font-bold text-2xl text-primary">
                {formatPrice(order.total_price)}
              </span>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default OrderDetail;
