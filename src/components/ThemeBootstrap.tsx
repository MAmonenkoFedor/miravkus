import { useEffect } from "react";
import { apiRequest } from "@/integrations/api/client";
import { applyThemeSettings, resetThemeSettings, ThemeSettings } from "@/lib/theme";

const ThemeBootstrap = () => {
  useEffect(() => {
    let cancelled = false;

    const apply = (settings: ThemeSettings | null | undefined) => {
      if (!settings?.enabled) {
        resetThemeSettings();
        return;
      }
      if (settings.palette) {
        applyThemeSettings(settings);
      }
    };

    const load = () =>
      apiRequest<ThemeSettings>("/api/theme")
        .then((settings) => {
          if (cancelled) return;
          apply(settings);
        })
        .catch(() => undefined);

    const handleRefresh = () => {
      void load();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "theme_refresh") {
        void load();
      }
    };

    void load();
    window.addEventListener("theme:refresh", handleRefresh);
    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("theme:refresh", handleRefresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
};

export default ThemeBootstrap;
