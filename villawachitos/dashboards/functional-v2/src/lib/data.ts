/**
 * Datos históricos de Home Assistant para las gráficas: estadísticas a largo plazo del
 * recorder (medias horarias y consumos diarios) e historial de estados (líneas de actividad).
 * Todo se pide por el websocket que ya tiene `hass`; los resultados se cachean unos minutos.
 */
import type { HomeAssistant } from "../types";

export type Point = [time: number, value: number];

interface StatRow {
  start: number | string;
  mean?: number | null;
  state?: number | null;
}

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 5 * 60_000;

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

const toMs = (t: number | string) => (typeof t === "number" ? t : Date.parse(t));

/** Medias horarias de las últimas `hours` horas. */
export function hourlyMeans(
  hass: HomeAssistant,
  ids: string[],
  hours = 24,
): Promise<Record<string, Point[]>> {
  return cached(`mean:${hours}:${ids.join(",")}`, async () => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 3600_000);
    const res = await hass.callWS<Record<string, StatRow[]>>({
      type: "recorder/statistics_during_period",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: ids,
      period: "hour",
      types: ["mean"],
    });
    const out: Record<string, Point[]> = {};
    for (const id of ids)
      out[id] = (res[id] ?? [])
        .filter((r) => typeof r.mean === "number")
        .map((r) => [toMs(r.start), r.mean!]);
    return out;
  });
}

/**
 * Total de cada uno de los últimos `days` días a partir de sensores que se ponen a cero cada día
 * (p. ej. `daily_pv_generation`): el estado al final del día es el total de ese día.
 */
export function dailyTotals(hass: HomeAssistant, ids: string[], days = 7): Promise<Record<string, Point[]>> {
  return cached(`day:${days}:${ids.join(",")}`, async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const res = await hass.callWS<Record<string, StatRow[]>>({
      type: "recorder/statistics_during_period",
      start_time: start.toISOString(),
      statistic_ids: ids,
      period: "day",
      types: ["state"],
    });
    const out: Record<string, Point[]> = {};
    for (const id of ids) out[id] = (res[id] ?? []).map((r) => [toMs(r.start), Math.max(0, r.state ?? 0)]);
    return out;
  });
}

/** Energía (u otro contador creciente) gastada cada día: diferencia diaria de las estadísticas. */
export function dailyChange(hass: HomeAssistant, ids: string[], days = 7): Promise<Record<string, Point[]>> {
  return cached(`change:${days}:${ids.join(",")}`, async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const res = await hass.callWS<Record<string, (StatRow & { change?: number | null })[]>>({
      type: "recorder/statistics_during_period",
      start_time: start.toISOString(),
      statistic_ids: ids,
      period: "day",
      types: ["change"],
    });
    const out: Record<string, Point[]> = {};
    for (const id of ids) out[id] = (res[id] ?? []).map((r) => [toMs(r.start), Math.max(0, r.change ?? 0)]);
    return out;
  });
}

export interface Span {
  from: number;
  to: number;
  state: string;
}

interface HistRow {
  s: string;
  lu: number;
  lc?: number;
}

/** Tramos de estado de cada entidad desde `since` hasta ahora (historial del recorder). */
export function stateSpans(hass: HomeAssistant, ids: string[], since: Date): Promise<Record<string, Span[]>> {
  return cached(`hist:${since.getTime()}:${ids.join(",")}`, async () => {
    const res = await hass.callWS<Record<string, HistRow[]>>({
      type: "history/history_during_period",
      start_time: since.toISOString(),
      entity_ids: ids,
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    });
    const now = Date.now();
    const out: Record<string, Span[]> = {};
    for (const id of ids) {
      const rows = res[id] ?? [];
      out[id] = rows.map((r, i) => ({
        from: Math.max(since.getTime(), (r.lc ?? r.lu) * 1000),
        to: i + 1 < rows.length ? (rows[i + 1].lc ?? rows[i + 1].lu) * 1000 : now,
        state: r.s,
      }));
    }
    return out;
  });
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
