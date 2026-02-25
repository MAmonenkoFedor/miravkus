import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiUpload } from "@/integrations/api/client";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Save, X, Image as ImageIcon, FileText } from "lucide-react";
import type { Article } from "@/hooks/useArticles";

const ARTICLE_CATEGORIES = ["Новинки", "Обзор", "Рецепты", "Советы", "Новости"];

const AdminArticles = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Article | null>(null);
  const [isNew, setIsNew] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("Обзор");
  const [coverImage, setCoverImage] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["admin-articles"],
    queryFn: async () => {
      return apiRequest<Article[]>("/api/admin/articles");
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products-list"],
    queryFn: async () => {
      return apiRequest<{ id: string; name: string }[]>("/api/admin/products/options");
    },
  });

  const resetForm = () => {
    setTitle(""); setSlug(""); setCategory("Обзор");
    setCoverImage(""); setExcerpt(""); setContent("");
    setMetaTitle(""); setMetaDescription(""); setStatus("draft");
    setSelectedProductIds([]);
    setEditing(null); setIsNew(false);
  };

  const startEdit = (article: Article) => {
    setEditing(article);
    setIsNew(false);
    setTitle(article.title);
    setSlug(article.slug);
    setCategory(article.category);
    setCoverImage(article.cover_image || "");
    setExcerpt(article.excerpt || "");
    setContent(article.content);
    setMetaTitle(article.meta_title || "");
    setMetaDescription(article.meta_description || "");
    setStatus(article.status);
    setSelectedProductIds(article.related_product_ids || []);
  };

  const startNew = () => {
    resetForm();
    setIsNew(true);
  };

  const generateSlug = (t: string) =>
    t.toLowerCase()
      .replace(/[^a-zа-яё0-9\s-]/gi, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await apiUpload("/api/uploads/article-cover", file);
      setCoverImage(url);
    } catch {
      toast({ title: "Ошибка загрузки", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        slug,
        category,
        cover_image: coverImage || null,
        excerpt: excerpt || null,
        content,
        meta_title: metaTitle || null,
        meta_description: metaDescription || null,
        status,
        related_product_ids: selectedProductIds,
      };

      if (isNew) {
        await apiRequest("/api/admin/articles", { method: "POST", body: JSON.stringify(payload) });
      } else if (editing) {
        await apiRequest(`/api/admin/articles/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
      resetForm();
      toast({ title: isNew ? "Статья создана" : "Статья обновлена" });
    },
    onError: () => {
      toast({ title: "Ошибка при сохранении", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/admin/articles/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
      toast({ title: "Статья удалена" });
    },
  });

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const showForm = isNew || !!editing;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading font-bold text-2xl text-foreground">Статьи</h1>
            <p className="text-sm text-muted-foreground mt-1">Управление блогом «Мир вкуса»</p>
          </div>
          {!showForm && (
            <Button onClick={startNew}>
              <Plus className="w-4 h-4 mr-1" /> Добавить статью
            </Button>
          )}
        </div>

        {showForm && (
          <Card className="p-6 space-y-4">
            <h2 className="font-heading font-semibold text-lg">
              {isNew ? "Новая статья" : "Редактировать статью"}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Заголовок *</label>
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (isNew) setSlug(generateSlug(e.target.value));
                  }}
                  placeholder="Заголовок статьи"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slug *</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug-statyi" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Категория</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ARTICLE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Статус</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Черновик</SelectItem>
                    <SelectItem value="published">Опубликовано</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Обложка</label>
                <div className="flex gap-2">
                  <Input
                    value={coverImage}
                    onChange={(e) => setCoverImage(e.target.value)}
                    placeholder="URL или загрузите файл"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <ImageIcon className="w-4 h-4" />
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadCover} />
                </div>
                {coverImage && (
                  <img src={coverImage} alt="cover" className="w-32 h-20 object-cover rounded mt-1" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Краткое описание</label>
              <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} placeholder="Для карточки на главной" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Основной текст *</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                placeholder="Поддерживается Markdown: ## Заголовок, **жирный**, — пункт списка"
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Meta Title</label>
                <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="SEO заголовок" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Meta Description</label>
                <Input value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="SEO описание" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Связанные товары</label>
              <div className="max-h-40 overflow-y-auto border rounded-lg p-3 space-y-2">
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedProductIds.includes(p.id)}
                      onCheckedChange={() => toggleProduct(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !title || !slug || !content}>
                <Save className="w-4 h-4 mr-1" /> Сохранить
              </Button>
              <Button variant="outline" onClick={resetForm}>
                <X className="w-4 h-4 mr-1" /> Отмена
              </Button>
            </div>
          </Card>
        )}

        {isLoading ? (
          <p className="text-muted-foreground">Загрузка...</p>
        ) : (
          <div className="space-y-3">
            {articles.map((a) => (
              <Card key={a.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {a.cover_image ? (
                    <img src={a.cover_image} alt="" className="w-16 h-10 object-cover rounded flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-10 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm truncate">{a.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={a.status === "published" ? "default" : "secondary"} className="text-xs">
                        {a.status === "published" ? "Опубликовано" : "Черновик"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{a.category}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => startEdit(a)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm("Удалить статью?")) deleteMutation.mutate(a.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
            {articles.length === 0 && !isLoading && (
              <p className="text-muted-foreground text-sm text-center py-8">Статей пока нет</p>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminArticles;
