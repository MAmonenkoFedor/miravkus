import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { apiRequest, getErrorMessage } from "@/integrations/api/client";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  emoji: string | null;
  sort_order: number;
}

const Categories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", image: "", emoji: "", sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const data = await apiRequest<Category[]>("/api/admin/categories");
    setCategories(data || []);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", slug: "", image: "", emoji: "", sort_order: 0 });
    setIsOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, slug: c.slug, image: c.image || "", emoji: c.emoji || "", sort_order: c.sort_order });
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.slug) { toast.error("Заполните название и slug"); return; }
    setSaving(true);
    const data = { ...form, image: form.image || null, emoji: form.emoji || null };

    if (editing) {
      try {
        await apiRequest(`/api/admin/categories/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
        toast.success("Категория обновлена");
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Ошибка сохранения"));
      }
    } else {
      try {
        await apiRequest("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify(data),
        });
        toast.success("Категория создана");
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Ошибка сохранения"));
      }
    }
    setSaving(false);
    setIsOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить категорию?")) return;
    try {
      await apiRequest(`/api/admin/categories/${id}`, { method: "DELETE" });
      toast.success("Категория удалена");
      fetchData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка удаления"));
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl">Категории</h1>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Добавить</Button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Эмодзи</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Порядок</TableHead>
              <TableHead className="w-24">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map(c => (
              <TableRow key={c.id}>
                <TableCell className="text-xl">{c.emoji || "—"}</TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                <TableCell>{c.sort_order}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {categories.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет категорий</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать категорию" : "Новая категория"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Название *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Эмодзи</Label>
                <Input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} placeholder="🎁" />
              </div>
              <div className="space-y-2">
                <Label>Изображение</Label>
                <Input value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} placeholder="URL" />
              </div>
              <div className="space-y-2">
                <Label>Порядок</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} />
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

export default Categories;
