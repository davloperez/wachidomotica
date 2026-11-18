import type { ThemeMode } from "../types";

const STORAGE_KEY = "fv2-theme-mode";

/** El modo elegido en la tablet se recuerda por navegador; si no hay, se usa el de la configuración. */
export function loadThemeMode(fallback: ThemeMode): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "auto" || v === "light" || v === "dark") return v;
  } catch {
    /* almacenamiento no disponible: se usa el valor por defecto */
  }
  return fallback;
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignorar */
  }
}

/**
 * En modo auto se sigue el modo oscuro de Home Assistant (que a su vez puede seguir
 * al sistema operativo). Si no hay `hass`, se usa la preferencia del navegador.
 */
export function resolveTheme(mode: ThemeMode, haDarkMode: boolean | undefined): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  if (haDarkMode !== undefined) return haDarkMode ? "dark" : "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
