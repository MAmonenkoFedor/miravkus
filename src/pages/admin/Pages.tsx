import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/integrations/api/client";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Save, X, FileText } from "lucide-react";

const AdminPages = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ["admin-pages"],
    queryFn: async () => {
      return apiRequest("/api/admin/pages");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, title, content }: { id: string; title: string; content: string }) => {
      await apiRequest(`/api/admin/pages/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title, content }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pages"] });
      setEditingId(null);
      toast({ title: "Страница обновлена" });
    },
    onError: () => {
      toast({ title: "Ошибка при сохранении", variant: "destructive" });
    },
  });

  const startEdit = (page: { id: string; title: string; content: string }) => {
    setEditingId(page.id);
    setEditTitle(page.title);
    setEditContent(page.content);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Страницы</h1>
          <p className="text-sm text-muted-foreground mt-1">Редактирование информационных страниц сайта</p>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Загрузка...</p>
        ) : (
          <div className="space-y-4">
            {pages.map((page) => (
              <Card key={page.id} className="p-5">
                {editingId === page.id ? (
                  <div className="space-y-4">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Название страницы"
                      className="font-semibold"
                    />
                    <p className="text-xs text-muted-foreground">Slug: /{page.slug}</p>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={12}
                      placeholder="Содержимое страницы"
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Форматирование: ## Заголовок, **жирный**, — пункт списка
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: page.id, title: editTitle, content: editContent })}
                        disabled={updateMutation.isPending}
                      >
                        <Save className="w-4 h-4 mr-1" />
                        Сохранить
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4 mr-1" />
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground">{page.title}</h3>
                        <p className="text-xs text-muted-foreground">/{page.slug}</p>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{page.content.slice(0, 120)}...</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => startEdit(page)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Редактировать
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminPages;
