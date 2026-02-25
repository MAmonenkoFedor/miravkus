import { useEffect, useRef, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { apiRequest, apiUpload, getErrorMessage } from "@/integrations/api/client";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  slug: string | null;
  category_id: string | null;
  price: number;
  old_price: number | null;
  description: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  seo_text?: string | null;
  images: string[];
  product_type: string;
  in_stock: boolean;
  stock_count: number | null;
  rating: number;
  reviews_count: number;
  is_premium: boolean;
  is_new: boolean;
  sort_order: number;
  category_ids?: string[];
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

const emptyProduct: Omit<Product, "id"> = {
  name: "",
  slug: null,
  category_id: null,
  price: 0,
  old_price: null,
  description: "",
  meta_title: "",
  meta_description: "",
  meta_keywords: "",
  seo_text: "",
  images: [],
  product_type: "regular",
  in_stock: true,
  stock_count: 0,
  rating: 0,
  reviews_count: 0,
  is_premium: false,
  is_new: false,
  sort_order: 0,
  category_ids: [],
};

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Omit<Product, "id">>(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [imagesText, setImagesText] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [productCategoriesMap, setProductCategoriesMap] = useState<Record<string, string[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    const [productsData, categoriesData, productCategories] = await Promise.all([
      apiRequest<Product[]>("/api/admin/products"),
      apiRequest<Category[]>("/api/admin/categories"),
      apiRequest<{ product_id: string; category_id: string }[]>("/api/admin/product-categories"),
    ]);
    setProducts(productsData || []);
    setCategories(categoriesData || []);

    const map: Record<string, string[]> = {};
    (productCategories || []).forEach((pc) => {
      if (!map[pc.product_id]) map[pc.product_id] = [];
      map[pc.product_id].push(pc.category_id);
    });
    setProductCategoriesMap(map);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyProduct);
    setImagesText("");
    setSelectedCategoryIds([]);
    setIsOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ ...p });
    setImagesText((p.images || []).join("\n"));
    setSelectedCategoryIds(productCategoriesMap[p.id] || []);
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || form.price <= 0) {
      toast.error("Заполните название и цену");
      return;
    }
    setSaving(true);
    const { category_ids, ...formWithoutCategoryIds } = form;
    const data = {
      ...formWithoutCategoryIds,
      category_id: selectedCategoryIds[0] || null,
      images: imagesText.split("\n").map(s => s.trim()).filter(Boolean),
      slug: form.slug || form.name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/-+$/, ""),
    };

    let productId = editing?.id;

    if (editing) {
      try {
        await apiRequest(`/api/admin/products/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...data, category_ids: selectedCategoryIds }),
        });
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Ошибка сохранения"));
        setSaving(false);
        return;
      }
    } else {
      try {
        const created = await apiRequest<{ id: string }>("/api/admin/products", {
          method: "POST",
          body: JSON.stringify({ ...data, category_ids: selectedCategoryIds }),
        });
        productId = created?.id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Ошибка сохранения"));
        setSaving(false);
        return;
      }
    }


    toast.success(editing ? "Товар обновлён" : "Товар добавлен");
    setSaving(false);
    setIsOpen(false);
    fetchData();
  };

  const handleImagesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    const urls: string[] = [];
    let failed = 0;
    let bucketMissing = false;

    try {
      for (const file of Array.from(files)) {
        try {
          const { url } = await apiUpload("/api/uploads/product-image", file);
          if (url) urls.push(url);
        } catch (error: unknown) {
          failed += 1;
          if (getErrorMessage(error, "").toLowerCase().includes("bucket")) bucketMissing = true;
          toast.error(getErrorMessage(error, "Ошибка загрузки"));
        }
      }

      if (urls.length > 0) {
        setImagesText((prev) => [prev, ...urls].filter(Boolean).join("\n"));
        if (failed > 0) toast.error(`Не удалось загрузить ${failed} файлов`);
      } else if (bucketMissing) {
        toast.error("Бакет product-images не найден. Примените миграцию.");
      } else if (failed > 0) {
        toast.error("Не удалось загрузить изображения");
      }
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }

  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить товар?")) return;
    try {
      await apiRequest(`/api/admin/products/${id}`, { method: "DELETE" });
      toast.success("Товар удалён");
      fetchData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Ошибка удаления"));
    }
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatPrice = (n: number) => new Intl.NumberFormat("ru-RU").format(n) + " ₽";
  const getCategoryNames = (productId: string) => {
    const ids = productCategoriesMap[productId] || [];
    if (ids.length === 0) return "—";
    return ids.map(id => categories.find(c => c.id === id)?.name).filter(Boolean).join(", ");
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl">Товары</h1>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Добавить товар</Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Поиск товаров..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead>Цена</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Наличие</TableHead>
              <TableHead className="w-24">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{getCategoryNames(p.id)}</TableCell>
                <TableCell>
                  {formatPrice(p.price)}
                  {p.old_price ? <span className="text-xs text-muted-foreground line-through ml-2">{formatPrice(p.old_price)}</span> : null}
                </TableCell>
                <TableCell>
                  <span className="text-xs px-2 py-1 rounded-md bg-secondary">
                    {p.product_type === "gift" ? "Подарочный" : p.product_type === "premium" ? "Премиум" : "Обычный"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={`w-2 h-2 rounded-full inline-block mr-2 ${p.in_stock ? "bg-trust" : "bg-destructive"}`} />
                  {p.in_stock ? "Да" : "Нет"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Нет товаров</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать товар" : "Новый товар"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Название *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={form.slug || ""} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="auto" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Цена *</Label>
                <Input type="number" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Старая цена</Label>
                <Input type="number" value={form.old_price || ""} onChange={e => setForm({ ...form, old_price: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="space-y-2">
                <Label>Остаток</Label>
                <Input type="number" value={form.stock_count || 0} onChange={e => setForm({ ...form, stock_count: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Категории</Label>
                <div className="border border-border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                  {categories.map(c => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedCategoryIds.includes(c.id)}
                        onCheckedChange={(checked) => {
                          setSelectedCategoryIds(prev =>
                            checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                          );
                        }}
                      />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))}
                  {categories.length === 0 && <p className="text-sm text-muted-foreground">Нет категорий</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Тип товара</Label>
                <Select value={form.product_type} onValueChange={v => setForm({ ...form, product_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Обычный</SelectItem>
                    <SelectItem value="gift">Подарочный набор</SelectItem>
                    <SelectItem value="premium">Премиум</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Описание</Label>
              <Textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Meta Title</Label>
                <Input value={form.meta_title || ""} onChange={e => setForm({ ...form, meta_title: e.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Meta Description</Label>
                <Input value={form.meta_description || ""} onChange={e => setForm({ ...form, meta_description: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Meta Keywords</Label>
              <Input value={form.meta_keywords || ""} onChange={e => setForm({ ...form, meta_keywords: e.target.value })} placeholder="через запятую" />
            </div>

            <div className="space-y-2">
              <Label>SEO текст (внизу карточки)</Label>
              <Textarea value={form.seo_text || ""} onChange={e => setForm({ ...form, seo_text: e.target.value })} rows={4} />
            </div>

            <div className="space-y-2">
              <Label>Изображения (по одной ссылке на строку)</Label>
              <Textarea value={imagesText} onChange={e => setImagesText(e.target.value)} rows={3} placeholder="https://example.com/image1.jpg" />
            </div>

            <div className="space-y-2">
              <Label>Загрузка изображений</Label>
              <Input ref={fileInputRef} type="file" accept="image/*" multiple disabled={uploadingImages} onChange={(e) => handleImagesUpload(e.target.files)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Рейтинг</Label>
                <Input type="number" step="0.1" min="0" max="5" value={form.rating} onChange={e => setForm({ ...form, rating: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Кол-во отзывов</Label>
                <Input type="number" value={form.reviews_count} onChange={e => setForm({ ...form, reviews_count: Number(e.target.value) })} />
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2">
                <Switch checked={form.in_stock} onCheckedChange={v => setForm({ ...form, in_stock: v })} />
                <span className="text-sm">В наличии</span>
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={form.is_premium} onCheckedChange={v => setForm({ ...form, is_premium: v })} />
                <span className="text-sm">Премиум</span>
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={form.is_new} onCheckedChange={v => setForm({ ...form, is_new: v })} />
                <span className="text-sm">Новинка</span>
              </label>
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

export default Products;
