import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(eventName: string, payload: AnalyticsPayload = {}) {
  if (typeof window === "undefined") return;

  const win = window as Window & {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  };
  const eventPayload = { event: eventName, ...payload };

  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push(eventPayload);
  }

  if (typeof win.gtag === "function") {
    win.gtag("event", eventName, payload);
  }

  if (import.meta.env.DEV) {
    console.debug("[analytics]", eventName, payload);
  }
}
