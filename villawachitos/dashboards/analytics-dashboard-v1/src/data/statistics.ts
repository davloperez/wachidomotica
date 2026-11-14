import type { HomeAssistant } from "../types";

export type Point = [time: number, value: number];

interface StatRow {
  start: number | string;
  mean?: number | null;
}

/**
 * Serie de las últimas `hours` horas a partir de las estadísticas a largo plazo
 * del recorder (media cada 5 min). Es más ligera y suave que el histórico crudo.
 */
export async function fetchMeanSeries(
  hass: HomeAssistant,
  entityIds: string[],
  hours = 24,
): Promise<Record<string, Point[]>> {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  const res = await hass.callWS<Record<string, StatRow[]>>({
    type: "recorder/statistics_during_period",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    statistic_ids: entityIds,
    period: "5minute",
    types: ["mean"],
  });

  const out: Record<string, Point[]> = {};
  for (const id of entityIds) {
    out[id] = (res[id] ?? [])
      .filter((r) => typeof r.mean === "number")
      .map((r) => [typeof r.start === "number" ? r.start : Date.parse(r.start), r.mean as number]);
  }
  return out;
}
