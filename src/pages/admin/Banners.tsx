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

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  discount: string | null;
  link_url: string | null;
  link_text: string | null;
  variant: string;
  is_active: boolean;
  position: string;
  sort_order: number;
}

const emptyForm = {
  title: "", subtitle: "", discount: "", link_url: "", link_text: "",
  variant: "gold", is_active: true, position: "promo", sort_order: 0,
};

const Banners = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const data = await apiRequest<Banner[]>("/api/admin/banners");
    setBanners(data || []);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setIsOpen(true); };

  const openEdit = (b: Banner) => {
    setEditing(b);
    setForm({
      title: b.title, subtitle: b.subtitle || "", discount: b.discount || "",
      link_url: b.link_url || "", link_text: b.link_text || "", variant: b.variant,
      is_active: b.is_active, position: b.position, sort_order: b.sort_order,
    });
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!form.title) { toast.error("Заполните заголовок"); return; }
    setSaving(true);
    const data = {
      ...form,
      subtitle: form.subtitle || null, discount: form.discount || null,
      link_url: form.link_url || null, link_text: form.link_text || null,
    };

    if (editing) {
      try {
        await apiRequest(`/api/admin/banners/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
        toast.success("Баннер обновлён");
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Ошибка сохранения"));
      }
    } else {
      try {
        await apiRequest("/api/admin/banners", {
          method: "POST",
          body: JSON.stringify(data),
        });
        toast.success("Баннер создан");
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Ошибка сохранения"));
      }
    }
    setSaving(false); setIsOpen(false); fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить баннер?")) return;
    try {
      await apiRequest(`/api/admin/banners/${id}`, { method: "DELETE" });
      toast.success("Баннер удалён");
      fetchData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка удаления"));
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl">Баннеры и акции</h1>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Добавить</Button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Заголовок</TableHead>
              <TableHead>Вариант</TableHead>
              <TableHead>Позиция</TableHead>
              <TableHead>Активен</TableHead>
              <TableHead className="w-24">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {banners.map(b => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.title}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-1 rounded-md ${b.variant === "red" ? "bg-destructive/10 text-destructive" : "bg-accent/10 text-accent"}`}>
                    {b.variant}
                  </span>
                </TableCell>
                <TableCell>{b.position}</TableCell>
                <TableCell>{b.is_active ? "✅" : "❌"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {banners.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет баннеров</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать баннер" : "Новый баннер"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Заголовок *</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Подзаголовок</Label>
                <Input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Скидка</Label>
                <Input value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} placeholder="-30%" />
              </div>
              <div className="space-y-2">
                <Label>Вариант</Label>
                <Select value={form.variant} onValueChange={v => setForm({ ...form, variant: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gold">Золотой</SelectItem>
                    <SelectItem value="red">Красный</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Позиция</Label>
                <Select value={form.position} onValueChange={v => setForm({ ...form, position: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hero">Главный баннер</SelectItem>
                    <SelectItem value="promo">Промо</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ссылка</Label>
                <Input value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })} placeholder="/catalog" />
              </div>
              <div className="space-y-2">
                <Label>Текст ссылки</Label>
                <Input value={form.link_text} onChange={e => setForm({ ...form, link_text: e.target.value })} placeholder="Подробнее" />
              </div>
            </div>
            <label className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <span className="text-sm">Активен</span>
            </label>
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

export default Banners;
