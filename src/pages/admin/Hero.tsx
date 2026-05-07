import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { apiRequest, getErrorMessage } from "@/integrations/api/client";
import { toast } from "sonner";

interface HeroProductRow {
  id: string;
  product_id: string;
  badge: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  created_at: string;
  products?: { name: string | null } | null;
}

interface ProductOption {
  id: string;
  name: string;
}

const emptyForm = {
  product_id: "",
  badge: "",
  is_active: true,
  starts_at: "",
  ends_at: "",
  sort_order: 0,
};

const toDateTimeLocal = (value: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset();
  const local = new Date(parsed.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
};

const AdminHero = () => {
  const [heroItems, setHeroItems] = useState<HeroProductRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<HeroProductRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const [heroData, productsData] = await Promise.all([
        apiRequest<HeroProductRow[]>("/api/admin/hero-products"),
        apiRequest<ProductOption[]>("/api/admin/products/options"),
      ]);
      setHeroItems(heroData || []);
      setProducts(productsData || []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка загрузки"));
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setIsOpen(true);
  };

  const openEdit = (item: HeroProductRow) => {
    setEditing(item);
    setForm({
      product_id: item.product_id,
      badge: item.badge || "",
      is_active: item.is_active,
      starts_at: toDateTimeLocal(item.starts_at),
      ends_at: toDateTimeLocal(item.ends_at),
      sort_order: item.sort_order,
    });
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!form.product_id) {
      toast.error("Выберите товар");
      return;
    }
    setSaving(true);
    const data = {
      product_id: form.product_id,
      badge: form.badge.trim() || null,
      is_active: form.is_active,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      sort_order: form.sort_order,
    };

    if (editing) {
      try {
        await apiRequest(`/api/admin/hero-products/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
        toast.success("Блок обновлён");
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Ошибка сохранения"));
      }
    } else {
      try {
        await apiRequest("/api/admin/hero-products", {
          method: "POST",
          body: JSON.stringify(data),
        });
        toast.success("Блок добавлен");
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Ошибка сохранения"));
      }
    }
    setSaving(false);
    setIsOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить запись?")) return;
    try {
      await apiRequest(`/api/admin/hero-products/${id}`, { method: "DELETE" });
      toast.success("Запись удалена");
      fetchData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка удаления"));
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl">Hero блок</h1>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Добавить</Button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Товар</TableHead>
              <TableHead>Бейдж</TableHead>
              <TableHead>Активен</TableHead>
              <TableHead>Период</TableHead>
              <TableHead>Порядок</TableHead>
              <TableHead className="w-24">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {heroItems.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.products?.name || "—"}</TableCell>
                <TableCell>{item.badge || "—"}</TableCell>
                <TableCell>{item.is_active ? "✅" : "❌"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {(item.starts_at || item.ends_at)
                    ? `${item.starts_at ? new Date(item.starts_at).toLocaleString("ru-RU") : "сейчас"} - ${item.ends_at ? new Date(item.ends_at).toLocaleString("ru-RU") : "бессрочно"}`
                    : "Без ограничений"}
                </TableCell>
                <TableCell>{item.sort_order}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {heroItems.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Нет записей</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать блок" : "Новый блок"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Товар *</Label>
              <Select value={form.product_id} onValueChange={(value) => setForm(prev => ({ ...prev, product_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Выберите товар" /></SelectTrigger>
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
              <Label>Бейдж</Label>
              <Input value={form.badge} onChange={e => setForm(prev => ({ ...prev, badge: e.target.value }))} placeholder="Хит / Премиум / Акция" />
            </div>
            <div className="space-y-2">
              <Label>Порядок</Label>
              <Input type="number" value={form.sort_order} onChange={e => setForm(prev => ({ ...prev, sort_order: Number(e.target.value) }))} />
            </div>
            <label className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(prev => ({ ...prev, is_active: v }))} />
              <span className="text-sm">Активен</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Показывать с</Label>
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={e => setForm(prev => ({ ...prev, starts_at: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Показывать до</Label>
                <Input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={e => setForm(prev => ({ ...prev, ends_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>Отмена</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Сохранение..." : "Сохранить"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminHero;
