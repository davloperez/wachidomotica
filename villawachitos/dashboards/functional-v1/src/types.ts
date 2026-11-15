/** Tipos mínimos del objeto `hass` que Home Assistant inyecta en las tarjetas. */
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    unit_of_measurement?: string;
    device_class?: string;
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

/** Posición dentro de una imagen, en % de su ancho y alto. */
export type ImagePoint = [x: number, y: number];

export interface ImagesConfig {
  /** Imagen general de la casa (interior y exterior). Sin ella se dibuja una maqueta isométrica. */
  home?: string;
  /** Dónde colocar el acceso de cada estancia sobre `home` (solo con imagen real). */
  hotspots?: Record<string, ImagePoint>;
  /** Imagen de cada estancia (id de estancia → URL). Sin ella se acerca la vista general. */
  rooms?: Record<string, string>;
  /** Posición de cada luz sobre la imagen de su estancia (entidad → punto). Opcional. */
  markers?: Record<string, ImagePoint>;
}

export interface DashboardConfig {
  type: string;
  title?: string;
  theme?: ThemeMode;
  weather?: string;
  alarm?: string;
  /** Segundos sin tocar la pantalla tras los que se vuelve a la vista general (0 = nunca). */
  idle_return_seconds?: number;
  images?: ImagesConfig;
  /** Ubicación de la casa (para el sol de la maqueta 3D) */
  latitude?: number;
  longitude?: number;
}
