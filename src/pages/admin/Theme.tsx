import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiRequest, getErrorMessage } from "@/integrations/api/client";
import { applyThemeSettings, resetThemeSettings, ThemePalette, ThemeSettings } from "@/lib/theme";

const presets: Array<{ key: string; title: string; palette: ThemePalette }> = [
  {
    key: "premium_light",
    title: "Вариант 1 — Светлый premium / маркетплейсный",
    palette: {
      background: "#F7F9FC",
      card: "#FFFFFF",
      foreground: "#172033",
      primary: "#123A63",
      accent: "#D9A441",
      secondary: "#EEF2F7",
      muted: "#EEF2F7",
      mutedForeground: "#6B7280",
      border: "#E5E7EB",
      saleRed: "#D92D20",
      heroBackground: "#F7F9FC",
      heroGradientStart: "#FFFFFF",
      heroGradientEnd: "#EEF2F7",
      heroText: "#172033",
      heroDecor: "#D9A441",
    },
  },
  {
    key: "blue_cream",
    title: "Вариант 2 — Синий + кремовый “подарочный”",
    palette: {
      background: "#FFF8EC",
      card: "#FFFFFF",
      foreground: "#1F2933",
      primary: "#153E64",
      accent: "#C9982E",
      secondary: "#FFF1D7",
      muted: "#FFF1D7",
      mutedForeground: "#6B7280",
      border: "#E8CFA3",
      saleRed: "#D92D20",
      heroBackground: "#FFF8EC",
      heroGradientStart: "#FFFFFF",
      heroGradientEnd: "#FFF1D7",
      heroText: "#1F2933",
      heroDecor: "#E8CFA3",
    },
  },
  {
    key: "premium_dark_light",
    title: "Вариант 3 — Premium dark (легче текущего)",
    palette: {
      background: "#F6F8FB",
      card: "#FFFFFF",
      foreground: "#111827",
      primary: "#1E4B73",
      accent: "#E3B341",
      secondary: "#EEF2F7",
      muted: "#EEF2F7",
      mutedForeground: "#6B7280",
      border: "#E5E7EB",
      saleRed: "#D92D20",
      heroBackground: "#102F4E",
      heroGradientStart: "#102F4E",
      heroGradientEnd: "#1E4B73",
      heroText: "#FFFFFF",
      heroDecor: "#E3B341",
    },
  },
  {
    key: "ecommerce_red",
    title: "Вариант 4 — Белый + красный акцент (e-commerce)",
    palette: {
      background: "#FFFFFF",
      card: "#FFFFFF",
      foreground: "#1F2933",
      primary: "#153E64",
      accent: "#D6A33A",
      secondary: "#F4F6F8",
      muted: "#F4F6F8",
      mutedForeground: "#6B7280",
      border: "#E5E7EB",
      saleRed: "#D92D20",
      heroBackground: "#F4F6F8",
      heroGradientStart: "#FFFFFF",
      heroGradientEnd: "#F4F6F8",
      heroText: "#1F2933",
      heroDecor: "#D6A33A",
    },
  },
  {
    key: "minimal_clean",
    title: "Вариант 5 — Минималистичный “чистый бренд”",
    palette: {
      background: "#FAFAFA",
      card: "#FFFFFF",
      foreground: "#111827",
      primary: "#0F3557",
      accent: "#C89B3C",
      secondary: "#F4F6F8",
      muted: "#F4F6F8",
      mutedForeground: "#6B7280",
      border: "#E5E7EB",
      saleRed: "#D92D20",
      heroBackground: "#FAFAFA",
      heroGradientStart: "#FFFFFF",
      heroGradientEnd: "#F4F6F8",
      heroText: "#111827",
      heroDecor: "#C89B3C",
    },
  },
];

const ThemeAdmin = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [presetKey, setPresetKey] = useState(presets[0].key);
  const [palette, setPalette] = useState<ThemePalette>(presets[0].palette);
  const [assets, setAssets] = useState<NonNullable<ThemeSettings["assets"]>>({
    backgroundMode: "color",
    siteBackgroundImage: "",
    siteBackgroundOverlay: "#FFFFFF",
    siteBackgroundOverlayOpacity: 0,
  });

  const selectedPreset = useMemo(() => presets.find((p) => p.key === presetKey) ?? presets[0], [presetKey]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<ThemeSettings>("/api/admin/theme");
      const nextEnabled = Boolean(data?.enabled);
      const nextPreset = typeof data?.preset === "string" && data.preset ? data.preset : presets[0].key;
      const preset = presets.find((p) => p.key === nextPreset) ?? presets[0];
      setEnabled(nextEnabled);
      setPresetKey(preset.key);
      setPalette(data?.palette ?? preset.palette);
      setAssets({
        backgroundMode: data?.assets?.backgroundMode === "image" ? "image" : "color",
        siteBackgroundImage: data?.assets?.siteBackgroundImage ?? "",
        siteBackgroundOverlay: data?.assets?.siteBackgroundOverlay ?? "#FFFFFF",
        siteBackgroundOverlayOpacity:
          typeof data?.assets?.siteBackgroundOverlayOpacity === "number" ? data.assets.siteBackgroundOverlayOpacity : 0,
      });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Не удалось загрузить тему"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const applyPreview = () => {
    if (!enabled) {
      resetThemeSettings();
      return;
    }
    applyThemeSettings({ enabled: true, preset: presetKey, palette, assets });
    toast.success("Предпросмотр применён");
  };

  const applyPreset = (key: string) => {
    const preset = presets.find((p) => p.key === key) ?? presets[0];
    setPresetKey(preset.key);
    setPalette(preset.palette);
    if (enabled) applyThemeSettings({ enabled: true, preset: preset.key, palette: preset.palette, assets });
  };

  const save = async () => {
    setSaving(true);
    try {
      const nextTheme: ThemeSettings = {
        enabled,
        preset: presetKey,
        palette,
        assets,
      };
      await apiRequest("/api/admin/theme", {
        method: "PUT",
        body: JSON.stringify(nextTheme),
      });
      if (nextTheme.enabled) {
        applyThemeSettings(nextTheme);
      } else {
        resetThemeSettings();
      }
      toast.success("Тема сохранена");
      window.dispatchEvent(new Event("theme:refresh"));
      localStorage.setItem("theme_refresh", String(Date.now()));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Не удалось сохранить тему"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-heading font-bold text-2xl">Дизайн</h1>
            <p className="text-sm text-muted-foreground">Выбор стиля и управление базовой палитрой.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={applyPreview} disabled={loading || saving || !enabled}>
              Предпросмотр
            </Button>
            <Button type="button" onClick={save} disabled={loading || saving}>
              {saving ? "Сохраняю..." : "Сохранить"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Режим</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Включить управление темой</Label>
              <select
                value={enabled ? "on" : "off"}
                onChange={(e) => setEnabled(e.target.value === "on")}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                disabled={loading}
              >
                <option value="off">Выключено (как сейчас)</option>
                <option value="on">Включено</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Пресет</Label>
              <select
                value={presetKey}
                onChange={(e) => applyPreset(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                disabled={loading}
              >
                {presets.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.title}
                  </option>
                ))}
              </select>
              <div className="text-xs text-muted-foreground">{selectedPreset.title}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Палитра</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            {(
              [
                ["background", "Основной фон"],
                ["card", "Карточки / блоки"],
                ["foreground", "Основной текст"],
                ["primary", "Фирменный цвет / CTA"],
                ["accent", "Акцент (золото)"],
                ["saleRed", "Скидки / акции (красный)"],
                ["secondary", "Вторичный фон"],
                ["border", "Границы / разделители"],
                ["mutedForeground", "Вторичный текст"],
                ["heroBackground", "Hero фон (база)"],
                ["heroGradientStart", "Hero градиент (старт)"],
                ["heroGradientEnd", "Hero градиент (финиш)"],
                ["heroText", "Hero цвет текста"],
                ["heroDecor", "Hero акцент / декор"],
              ] as Array<[keyof ThemePalette, string]>
            ).map(([key, title]) => (
              <div className="space-y-2" key={key}>
                <Label>{title}</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={palette[key]}
                    onChange={(e) => setPalette((prev) => ({ ...prev, [key]: e.target.value }))}
                    disabled={loading}
                    className="h-10 w-12 rounded-md border border-input bg-background"
                  />
                  <Input
                    value={palette[key]}
                    onChange={(e) => setPalette((prev) => ({ ...prev, [key]: e.target.value }))}
                    disabled={loading}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Фон сайта</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Режим</Label>
              <select
                value={assets.backgroundMode === "image" ? "image" : "color"}
                onChange={(e) =>
                  setAssets((prev) => ({ ...prev, backgroundMode: e.target.value === "image" ? "image" : "color" }))
                }
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                disabled={loading}
              >
                <option value="color">Цвет / градиенты темы</option>
                <option value="image">Фоновая картинка</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>URL фоновой картинки</Label>
              <Input
                value={assets.siteBackgroundImage ?? ""}
                onChange={(e) => setAssets((prev) => ({ ...prev, siteBackgroundImage: e.target.value }))}
                placeholder="https://... или /uploads/..."
                disabled={loading || assets.backgroundMode !== "image"}
              />
            </div>

            <div className="space-y-2">
              <Label>Оверлей (цвет)</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={assets.siteBackgroundOverlay ?? "#FFFFFF"}
                  onChange={(e) => setAssets((prev) => ({ ...prev, siteBackgroundOverlay: e.target.value }))}
                  disabled={loading}
                  className="h-10 w-12 rounded-md border border-input bg-background"
                />
                <Input
                  value={assets.siteBackgroundOverlay ?? "#FFFFFF"}
                  onChange={(e) => setAssets((prev) => ({ ...prev, siteBackgroundOverlay: e.target.value }))}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Оверлей (прозрачность 0..1)</Label>
              <Input
                inputMode="decimal"
                value={String(assets.siteBackgroundOverlayOpacity ?? 0)}
                onChange={(e) => {
                  const nextValue = Number.parseFloat(e.target.value);
                  setAssets((prev) => ({
                    ...prev,
                    siteBackgroundOverlayOpacity: Number.isFinite(nextValue) ? Math.min(1, Math.max(0, nextValue)) : 0,
                  }));
                }}
                disabled={loading}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default ThemeAdmin;
