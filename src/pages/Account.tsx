import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package, LogOut, ChevronRight, Clock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/integrations/api/client";
import { useNavigate } from "react-router-dom";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_price: number;
  created_at: string;
}

const statusColors: Record<string, string> = {
  "Новый": "bg-blue-100 text-blue-700",
  "В обработке": "bg-yellow-100 text-yellow-700",
  "Отправлен": "bg-purple-100 text-purple-700",
  "Доставлен": "bg-green-100 text-green-700",
};

const Account = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      const data = await apiRequest<Order[]>("/api/my/orders");
      setOrders(data || []);
      setLoading(false);
    };
    fetchOrders();
  }, []);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("ru-RU").format(price) + " ₽";

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-secondary/30">
        <div className="container-custom py-6 sm:py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-heading font-bold text-2xl sm:text-3xl">
              Личный кабинет
            </h1>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
              <LogOut className="w-4 h-4 mr-2" />
              Выйти
            </Button>
          </div>

          {user?.phone && (
            <p className="text-sm text-muted-foreground mb-6">
              Телефон: {user.phone}
            </p>
          )}

          <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Мои заказы
          </h2>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-card rounded-xl p-8 text-center shadow-card">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">У вас пока нет заказов</p>
              <Link to="/catalog">
                <Button className="btn-gold">Перейти в каталог</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  to={`/account/order/${order.id}`}
                  className="block bg-card rounded-xl p-4 sm:p-5 shadow-card hover:shadow-hover transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{order.order_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[order.status] || "bg-muted text-muted-foreground"}`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(order.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold text-primary">
                        {formatPrice(order.total_price)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Account;
