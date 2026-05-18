import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Package, FolderOpen, Image, ShoppingBag, LayoutDashboard, LogOut, ChevronLeft, FileText, MessageSquare, BookOpen, Sparkles, SlidersHorizontal, Mail, KeyRound, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Дашборд", path: "/admin", icon: LayoutDashboard },
  { title: "Товары", path: "/admin/products", icon: Package },
  { title: "Категории", path: "/admin/categories", icon: FolderOpen },
  { title: "Баннеры", path: "/admin/banners", icon: Image },
  { title: "Hero блок", path: "/admin/hero", icon: Sparkles },
  { title: "Витрина", path: "/admin/home-layout", icon: SlidersHorizontal },
  { title: "Сообщения", path: "/admin/client-messages", icon: Mail },
  { title: "Интеграции", path: "/admin/integrations", icon: KeyRound },
  { title: "Дизайн", path: "/admin/theme", icon: Palette },
  { title: "Заказы", path: "/admin/orders", icon: ShoppingBag },
  { title: "Отзывы", path: "/admin/reviews", icon: MessageSquare },
  { title: "Страницы", path: "/admin/pages", icon: FileText },
  { title: "Статьи", path: "/admin/articles", icon: BookOpen },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, roles, session, signOut } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const sessionInfo = useMemo(() => {
    const expiresAt = session?.expiresAt ? new Date(session.expiresAt).getTime() : null;
    if (!expiresAt || Number.isNaN(expiresAt)) return null;
    const msLeft = expiresAt - now;
    const minutesTotal = Math.max(0, Math.floor(msLeft / 60_000));
    const hours = Math.floor(minutesTotal / 60);
    const minutes = minutesTotal % 60;
    const leftLabel = hours > 0 ? `${hours}ч ${minutes}м` : `${minutes}м`;
    return {
      expiresAtLabel: new Date(expiresAt).toLocaleString("ru-RU"),
      leftLabel,
      expired: msLeft <= 0,
    };
  }, [now, session?.expiresAt]);

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
          <div className="mb-3 text-xs text-muted-foreground space-y-0.5">
            <div className="text-foreground font-medium truncate">
              {roles.includes("admin") ? "Админ" : "Пользователь"}: {user?.email || user?.phone || user?.id || "—"}
            </div>
            {sessionInfo && (
              <div>
                Сессия: {sessionInfo.expired ? "истекла" : `ещё ${sessionInfo.leftLabel}`} (до{" "}
                {sessionInfo.expiresAtLabel})
              </div>
            )}
          </div>
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
