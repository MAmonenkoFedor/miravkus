import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { apiRequest, getErrorMessage } from "@/integrations/api/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_price: number;
  delivery_price: number;
  delivery_method: string | null;
  payment_method: string | null;
  address: string | null;
  created_at: string;
  user_id: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  product_image: string | null;
  price: number;
  quantity: number;
}

interface Profile {
  id: string;
  name: string | null;
  phone: string | null;
}

const statusColors: Record<string, string> = {
  "Новый": "bg-blue-100 text-blue-800",
  "В обработке": "bg-yellow-100 text-yellow-800",
  "Отправлен": "bg-purple-100 text-purple-800",
  "Доставлен": "bg-green-100 text-green-800",
};

const statuses = ["Новый", "В обработке", "Отправлен", "Доставлен"];

const Orders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  const fetchOrders = async () => {
    const data = await apiRequest<{ orders: Order[]; profiles: Record<string, Profile> }>(
      "/api/admin/orders"
    );
    setOrders(data?.orders || []);
    setProfiles(data?.profiles || {});
  };

  useEffect(() => { fetchOrders(); }, []);

  const openOrder = async (order: Order) => {
    setSelectedOrder(order);
    const data = await apiRequest<OrderItem[]>(`/api/admin/orders/${order.id}/items`);
    setOrderItems(data || []);
  };

  const updateStatus = async (orderId: string, status: string) => {
    try {
      await apiRequest(`/api/admin/orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      toast.success("Статус обновлён");
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, status } : null);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка обновления"));
    }
  };

  const formatPrice = (n: number) => new Intl.NumberFormat("ru-RU").format(n) + " ₽";

  return (
    <AdminLayout>
      <h1 className="font-heading font-bold text-2xl mb-6">Заказы</h1>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Номер</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Покупатель</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map(o => {
              const profile = profiles[o.user_id];
              return (
                <TableRow key={o.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => openOrder(o)}>
                  <TableCell className="font-medium">{o.order_number}</TableCell>
                  <TableCell>{format(new Date(o.created_at), "dd MMM yyyy, HH:mm", { locale: ru })}</TableCell>
                  <TableCell>{profile?.name || profile?.phone || "—"}</TableCell>
                  <TableCell>{formatPrice(o.total_price)}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[o.status] || "bg-secondary"}`}>
                      {o.status}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            {orders.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет заказов</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Заказ {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Дата:</span>
                  <p className="font-medium">{format(new Date(selectedOrder.created_at), "dd MMM yyyy, HH:mm", { locale: ru })}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Покупатель:</span>
                  <p className="font-medium">{profiles[selectedOrder.user_id]?.name || "—"}</p>
                  <p className="text-muted-foreground">{profiles[selectedOrder.user_id]?.phone || ""}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Доставка:</span>
                  <p className="font-medium">{selectedOrder.delivery_method === "courier" ? "Курьер" : "Самовывоз"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Оплата:</span>
                  <p className="font-medium">{selectedOrder.payment_method || "—"}</p>
                </div>
                {selectedOrder.address && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Адрес:</span>
                    <p className="font-medium">{selectedOrder.address}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">Статус:</span>
                <Select value={selectedOrder.status} onValueChange={v => updateStatus(selectedOrder.id, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <span className="text-sm text-muted-foreground mb-2 block">Товары:</span>
                <div className="space-y-2">
                  {orderItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                      {item.product_image && (
                        <img src={item.product_image} alt="" className="w-10 h-10 rounded object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">{item.quantity} × {formatPrice(item.price)}</p>
                      </div>
                      <span className="text-sm font-medium">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-border pt-3 flex justify-between font-heading font-bold">
                <span>Итого:</span>
                <span className="text-primary">{formatPrice(selectedOrder.total_price)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default Orders;
