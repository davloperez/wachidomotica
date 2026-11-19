import type { HomeAssistant, ThemeMode } from "../types";

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
 * En modo auto manda el sensor de luz del panel (`luxTheme`, si lo tiene y ya ha dado lectura); si no, el
 * modo oscuro de Home Assistant (que a su vez puede seguir al sistema operativo). Si no hay `hass`, se usa
 * la preferencia del navegador.
 */
export function resolveTheme(
  mode: ThemeMode,
  haDarkMode: boolean | undefined,
  luxTheme?: "light" | "dark",
): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  if (luxTheme) return luxTheme;
  if (haDarkMode !== undefined) return haDarkMode ? "dark" : "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Por debajo de estos lux se pasa a oscuro… */
export const LUX_DARK_BELOW = 50;
/** …y por encima de estos, a claro (entre medias se mantiene el tema actual, para no parpadear al atardecer). */
export const LUX_LIGHT_ABOVE = 70;
/** Tiempo que tiene que mantenerse la nueva lectura antes de cambiar (una sombra o alguien delante no cuenta). */
export const LUX_HOLD_MS = 90_000;

/**
 * Tema «auto» de un panel con sensor de luz propio. Los sensores de las Shelly miden sobre todo la luz natural
 * (de noche marcan 0–5 lx aunque haya luces encendidas), así que de día queda claro y al anochecer, oscuro.
 */
export class LuxTheme {
  private theme?: "light" | "dark";
  private next?: "light" | "dark";
  private since = 0;

  constructor(readonly entity: string) {}

  /** ¿Hay un cambio esperando a cumplir `LUX_HOLD_MS`? (para volver a evaluar aunque no cambie `hass`) */
  get pending(): boolean {
    return this.next !== undefined;
  }

  /** Tema según el sensor; `undefined` si todavía no ha dado ninguna lectura válida. */
  update(hass: HomeAssistant | undefined, now = Date.now()): "light" | "dark" | undefined {
    const raw = hass?.states[this.entity]?.state;
    const lux = raw === undefined || raw === "" ? NaN : Number(raw);
    // Sensor no disponible: se mantiene lo último que se decidió
    if (!Number.isFinite(lux)) return this.theme;
    const want =
      lux < LUX_DARK_BELOW
        ? "dark"
        : lux > LUX_LIGHT_ABOVE
          ? "light"
          : (this.theme ?? (lux < (LUX_DARK_BELOW + LUX_LIGHT_ABOVE) / 2 ? "dark" : "light"));
    // Primera lectura (al cargar la página): se aplica sin esperar
    if (!this.theme) this.theme = want;
    if (want === this.theme) this.next = undefined;
    else if (this.next !== want) {
      this.next = want;
      this.since = now;
    } else if (now - this.since >= LUX_HOLD_MS) {
      this.theme = want;
      this.next = undefined;
    }
    return this.theme;
  }
}
