/**
 * Tipos mínimos del objeto `hass` que Home Assistant inyecta en las tarjetas.
 * Solo se declara lo que usa el dashboard; el objeto real tiene mucho más.
 */
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    unit_of_measurement?: string;
    entity_id?: string[];
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
  locale?: { language: string; time_format?: string };
  themes: { darkMode: boolean };
  connection: HassConnection;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
}

export type ThemeMode = "auto" | "light" | "dark";

export interface DashboardConfig {
  type: string;
  title?: string;
  /** Tema por defecto si el usuario no ha elegido otro en la tablet. */
  theme?: ThemeMode;
  weather?: string;
  alarm?: string;
  sun?: string;
  climate?: {
    name?: string;
    temperature: string;
    humidity?: string;
  };
  /** Climatizador / aire acondicionado opcional. */
  hvac?: string;
}
