import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingBag, FolderOpen, TrendingUp } from "lucide-react";
import { apiRequest } from "@/integrations/api/client";

const Dashboard = () => {
  const [stats, setStats] = useState({ products: 0, orders: 0, categories: 0, revenue: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const data = await apiRequest<{ products: number; orders: number; categories: number; revenue: number }>(
        "/api/admin/stats"
      );
      setStats({
        products: data?.products || 0,
        orders: data?.orders || 0,
        categories: data?.categories || 0,
        revenue: data?.revenue || 0,
      });
    };
    fetchStats();
  }, []);

  const formatPrice = (n: number) => new Intl.NumberFormat("ru-RU").format(n) + " ₽";

  const cards = [
    { title: "Товары", value: stats.products, icon: Package, color: "text-primary" },
    { title: "Заказы", value: stats.orders, icon: ShoppingBag, color: "text-accent" },
    { title: "Категории", value: stats.categories, icon: FolderOpen, color: "text-trust" },
    { title: "Выручка", value: formatPrice(stats.revenue), icon: TrendingUp, color: "text-destructive" },
  ];

  return (
    <AdminLayout>
      <h1 className="font-heading font-bold text-2xl mb-6">Дашборд</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
};

export default Dashboard;
