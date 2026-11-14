/** Tipos mínimos del objeto `hass` que Home Assistant inyecta en las tarjetas. */
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    brightness?: number | null;
    rgb_color?: [number, number, number] | null;
    current_position?: number | null;
    azimuth?: number;
    elevation?: number;
  };
  last_changed: string;
  last_updated: string;
}

export type HassEntities = Record<string, HassEntity>;

export interface HassConnection {
  subscribeMessage<T>(callback: (msg: T) => void, msg: Record<string, unknown>): Promise<() => Promise<void>>;
}

export interface HomeAssistant {
  states: HassEntities;
  connected: boolean;
  language: string;
  locale?: { language: string };
  themes: { darkMode: boolean };
  connection: HassConnection;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
}

export type ThemeMode = "auto" | "light" | "dark";

export interface DashboardConfig {
  type: string;
  title?: string;
  theme?: ThemeMode;
  sun?: string;
  /** Límite de resolución del lienzo 3D (rendimiento en tablets). Por defecto 1.5. */
  max_pixel_ratio?: number;
}
