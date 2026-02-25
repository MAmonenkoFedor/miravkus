import { Link, useLocation } from "react-router-dom";
import { Package, FolderOpen, Image, ShoppingBag, LayoutDashboard, LogOut, ChevronLeft, FileText, MessageSquare, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Дашборд", path: "/admin", icon: LayoutDashboard },
  { title: "Товары", path: "/admin/products", icon: Package },
  { title: "Категории", path: "/admin/categories", icon: FolderOpen },
  { title: "Баннеры", path: "/admin/banners", icon: Image },
  { title: "Hero блок", path: "/admin/hero", icon: Sparkles },
  { title: "Заказы", path: "/admin/orders", icon: ShoppingBag },
  { title: "Отзывы", path: "/admin/reviews", icon: MessageSquare },
  { title: "Страницы", path: "/admin/pages", icon: FileText },
  { title: "Статьи", path: "/admin/articles", icon: BookOpen },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex bg-secondary/30">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-3">
            <ChevronLeft className="w-4 h-4" />
            На сайт
          </Link>
          <h1 className="font-heading font-bold text-lg text-primary">Админ-панель</h1>
          <p className="text-xs text-muted-foreground">МираВкус</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path !== "/admin" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={signOut}
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
