import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Check, X, Eye } from "lucide-react";
import { apiRequest, getErrorMessage } from "@/integrations/api/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Review {
  id: string;
  user_id: string;
  product_id: string;
  order_id: string | null;
  rating: number;
  text: string;
  status: string;
  author_name: string | null;
  created_at: string;
  product_name?: string;
}

interface Product {
  id: string;
  name: string;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  pending: { label: "На модерации", variant: "secondary" },
  published: { label: "Опубликован", variant: "default" },
  rejected: { label: "Отклонён", variant: "destructive" },
};

const AdminReviews = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selected, setSelected] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const [form, setForm] = useState({
    product_id: "",
    rating: 5,
    text: "",
    author_name: "",
    status: "published",
    order_id: "",
  });

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<Review[]>("/api/admin/reviews");
      setReviews(data || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка загрузки"));
    }
    setLoading(false);
  };

  const fetchProducts = async () => {
    try {
      const data = await apiRequest<Product[]>("/api/admin/products/options");
      setProducts(data || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка загрузки товаров"));
    }
  };

  useEffect(() => {
    fetchReviews();
    fetchProducts();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await apiRequest(`/api/admin/reviews/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      toast.success(status === "published" ? "Отзыв опубликован" : "Отзыв отклонён");
      setReviews(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка обновления"));
    }
  };

  const deleteReview = async (id: string) => {
    try {
      await apiRequest(`/api/admin/reviews/${id}`, { method: "DELETE" });
      toast.success("Отзыв удалён");
      setReviews(prev => prev.filter(r => r.id !== id));
      setSelected(null);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка удаления"));
    }
  };

  const openCreate = () => {
    setForm({
      product_id: "",
      rating: 5,
      text: "",
      author_name: "",
      status: "published",
      order_id: "",
    });
    setIsCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!form.product_id) {
      toast.error("Выберите товар");
      return;
    }
    if (!form.text.trim()) {
      toast.error("Введите текст отзыва");
      return;
    }
    if (!user?.id) {
      toast.error("Нет доступа");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/api/admin/reviews", {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
          product_id: form.product_id,
          order_id: form.order_id.trim() ? form.order_id.trim() : null,
          rating: form.rating,
          text: form.text.trim().slice(0, 2000),
          author_name: form.author_name.trim().slice(0, 100) || null,
          status: form.status,
        }),
      });
      toast.success("Отзыв добавлен");
      setIsCreateOpen(false);
      fetchReviews();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка сохранения"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl">Отзывы</h1>
        <Button onClick={openCreate}>Добавить отзыв</Button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Товар</TableHead>
              <TableHead>Автор</TableHead>
              <TableHead>Рейтинг</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((r) => {
              const st = statusLabels[r.status] || statusLabels.pending;
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{format(new Date(r.created_at), "dd.MM.yyyy", { locale: ru })}</TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">{r.product_name}</TableCell>
                  <TableCell>{r.author_name || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-3 h-3 ${i < r.rating ? "fill-gold text-gold" : "text-muted"}`} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setSelected(r)} title="Просмотр">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {r.status !== "published" && (
                        <Button variant="ghost" size="icon" onClick={() => updateStatus(r.id, "published")} title="Опубликовать" className="text-green-600">
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      {r.status !== "rejected" && (
                        <Button variant="ghost" size="icon" onClick={() => updateStatus(r.id, "rejected")} title="Отклонить" className="text-destructive">
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!loading && reviews.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Нет отзывов</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Отзыв</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Товар:</span> <span className="font-medium">{selected.product_name}</span></p>
                <p><span className="text-muted-foreground">Автор:</span> <span className="font-medium">{selected.author_name || "Аноним"}</span></p>
                <p><span className="text-muted-foreground">Дата:</span> {format(new Date(selected.created_at), "dd MMM yyyy, HH:mm", { locale: ru })}</p>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Оценка:</span>
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < selected.rating ? "fill-gold text-gold" : "text-muted"}`} />
                  ))}
                </div>
              </div>

              <div className="bg-secondary rounded-lg p-4">
                <p className="text-sm whitespace-pre-wrap">{selected.text}</p>
              </div>

              <div className="flex gap-2">
                {selected.status !== "published" && (
                  <Button className="flex-1" onClick={() => updateStatus(selected.id, "published")}>
                    <Check className="w-4 h-4 mr-2" /> Опубликовать
                  </Button>
                )}
                {selected.status !== "rejected" && (
                  <Button variant="outline" className="flex-1" onClick={() => updateStatus(selected.id, "rejected")}>
                    <X className="w-4 h-4 mr-2" /> Отклонить
                  </Button>
                )}
                <Button variant="destructive" size="icon" onClick={() => deleteReview(selected.id)} title="Удалить">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Добавить отзыв</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Товар</Label>
              <Select
                value={form.product_id}
                onValueChange={(value) => setForm(prev => ({ ...prev, product_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите товар" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(product => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Автор</Label>
              <Input
                placeholder="Имя автора"
                value={form.author_name}
                onChange={(e) => setForm(prev => ({ ...prev, author_name: e.target.value }))}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label>Оценка</Label>
              <Select
                value={String(form.rating)}
                onValueChange={(value) => setForm(prev => ({ ...prev, rating: Number(value) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Оценка" />
                </SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Статус</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Опубликован</SelectItem>
                  <SelectItem value="pending">На модерации</SelectItem>
                  <SelectItem value="rejected">Отклонён</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Текст отзыва</Label>
              <Textarea
                placeholder="Текст отзыва"
                value={form.text}
                onChange={(e) => setForm(prev => ({ ...prev, text: e.target.value }))}
                rows={4}
                maxLength={2000}
              />
            </div>

            <div className="space-y-2">
              <Label>ID заказа (если есть)</Label>
              <Input
                placeholder="UUID заказа"
                value={form.order_id}
                onChange={(e) => setForm(prev => ({ ...prev, order_id: e.target.value }))}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving} className="flex-1">
                {saving ? "Сохранение..." : "Добавить"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setIsCreateOpen(false)}>
                Отмена
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminReviews;
