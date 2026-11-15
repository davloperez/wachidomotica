import type { HassEntity, HomeAssistant } from "../src/types";
import { ENERGY, FRIDGE, PEOPLE, ROOMS_DEF, lampKind } from "../src/house/rooms";

/**
 * `hass` simulado con todas las entidades del panel: luces al azar, persianas, energía,
 * clima, alarma y electrodomésticos. También responde a las estadísticas y al historial
 * con series inventadas para ver las gráficas sin Home Assistant.
 */
const now = () => new Date().toISOString();
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const entity = (
  entity_id: string,
  state: string,
  attributes: HassEntity["attributes"] = {},
  changed = now(),
): HassEntity => ({
  entity_id,
  state,
  attributes,
  last_changed: changed,
  last_updated: changed,
});

export function createMockHass(getDarkMode: () => boolean, onUpdate: (hass: HomeAssistant) => void): void {
  const states: Record<string, HassEntity> = {};
  const set = (id: string, state: string, attrs: HassEntity["attributes"] = {}, changed?: string) =>
    (states[id] = entity(id, state, attrs, changed));

  for (const r of ROOMS_DEF) {
    for (const l of r.lights) {
      const kind = lampKind(l.entity);
      const modes = kind === "strip" ? ["rgbw"] : kind === "lamp" ? ["color_temp", "hs"] : ["onoff"];
      const on = Math.random() < 0.35;
      set(l.entity, on ? "on" : "off", {
        friendly_name: `${r.name} ${l.name}`,
        supported_color_modes: modes,
        color_mode: on ? modes[modes.length - 1] : null,
        brightness: modes[0] === "onoff" ? null : Math.round(60 + Math.random() * 190),
        rgb_color: kind === "strip" ? [255, 170, 110] : [255, 200, 140],
        ...(kind === "strip"
          ? { effect_list: ["Solid", "Breathe", "Candle", "Fire 2012", "Ocean"], effect: "Solid" }
          : {}),
        ...(kind === "lamp"
          ? { min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500, color_temp_kelvin: 3000 }
          : {}),
      });
    }
    for (const c of r.covers) {
      const pos = [0, 40, 100][Math.floor(Math.random() * 3)];
      set(c.entity, pos === 0 ? "closed" : "open", {
        friendly_name: c.name,
        current_position: pos,
        supported_features: 15,
      });
    }
  }
  set("sensor.shelly_salon_sur_temperatura", "23.4", { unit_of_measurement: "°C" });
  set("sensor.shelly_salon_sur_humedad", "48", { unit_of_measurement: "%" });
  set("sensor.shelly_salon_sur_iluminancia", "320");
  set("weather.forecast_casa", "partlycloudy", {
    temperature: 19,
    humidity: 62,
    wind_speed: 11,
    friendly_name: "Casa",
  });
  set(
    "alarm_control_panel.alarma_vivienda",
    "disarmed",
    {
      friendly_name: "Alarmo Alarma vivienda",
      supported_features: 46,
      code_format: null,
      code_arm_required: false,
    },
    ago(190),
  );
  set("input_boolean.alarma_modo_silencioso", "on", { friendly_name: "Alarma modo silencioso" });
  set("input_datetime.alarma_noche_conectar", "23:30:00", { has_time: true, has_date: false });
  set("input_datetime.alarma_noche_desconectar", "07:00:00", { has_time: true, has_date: false });
  set("climate.aidoo_28_cc_ff_82_82_6f", "cool", {
    friendly_name: "Climatizador",
    current_temperature: 24.5,
    temperature: 23,
    min_temp: 15,
    max_temp: 32,
    hvac_modes: ["heat_cool", "cool", "heat", "fan_only", "dry", "off"],
    fan_modes: ["auto", "low", "medium", "high"],
    fan_mode: "auto",
  });
  PEOPLE.forEach((p, i) =>
    set(p, i === 0 ? "home" : "not_home", { friendly_name: i === 0 ? "David López" : "Inmaculada Pérez" }),
  );

  const e = ENERGY.sensors;
  const solar: Record<string, string> = {
    [e.pv]: "3.42",
    [e.soc]: "78",
    [e.battery]: "1.85",
    [e.load]: "0.94",
    [e.grid]: "-0.63",
    "sensor.david_lopez_perez_daily_pv_generation": "21.6",
    "sensor.david_lopez_perez_home_consumption_today": "11.2",
    "sensor.david_lopez_perez_grid_export_today": "6.4",
    "sensor.david_lopez_perez_grid_import_today": "0.3",
    "sensor.david_lopez_perez_battery_stored_energy": "14.1",
    "sensor.david_lopez_perez_battery_total_capacity": "18.08",
    "sensor.david_lopez_perez_battery_charging_today": "11.7",
    "sensor.david_lopez_perez_battery_discharging_today": "10.9",
    "sensor.david_lopez_perez_lifetime_pv_generation": "283",
    "sensor.david_lopez_perez_home_consumption_total": "240",
    "sensor.david_lopez_perez_grid_export_total": "45.5",
    "sensor.david_lopez_perez_grid_import_total": "19.2",
    "sensor.david_lopez_perez_battery_discharging_total": "139.9",
    "sensor.david_lopez_perez_inverter_0080_internal_temperature": "46.2",
    "sensor.david_lopez_perez_inverter_0080_phase_a_voltage": "227.6",
    "sensor.david_lopez_perez_inverter_0080_grid_frequency": "50.02",
  };
  for (const [id, v] of Object.entries(solar)) set(id, v);
  const f = FRIDGE.sensors;
  set(f.fridge, "4");
  set(f.fridgeTarget, "4");
  set(f.freezer, "-19");
  set(f.freezerTarget, "-18");
  set(f.door, "off");

  set("media_player.salon_tv_samsung_salon_85", "off", {
    friendly_name: "TV",
    source_list: ["TV", "HDMI 1", "Netflix"],
  });
  set("remote.salon_tv_samsung_salon_85", "off");
  set("vacuum.limpiasuelos", "docked", { friendly_name: "Limpiasuelos" });
  set("sensor.limpiasuelos_battery_level", "100");
  set("sensor.epson_et_5150_series", "idle");
  set("sensor.epson_et_5150_series_black_ink", "73", { unit_of_measurement: "%" });
  set("sensor.epson_et_5150_series_cyan_ink", "81", { unit_of_measurement: "%" });
  set("sensor.epson_et_5150_series_magenta_ink", "12", { unit_of_measurement: "%" });
  set("sensor.epson_et_5150_series_yellow_ink", "82", { unit_of_measurement: "%" });
  set(
    "binary_sensor.limpiasuelos_maintenance",
    "on",
    { device_class: "problem", friendly_name: "Robot: mantenimiento pendiente" },
    ago(600),
  );
  set("sensor.lavavajillas_estado_de_operacion", "run");
  set("sensor.lavavajillas_progreso_del_programa", "62");
  set(
    "sensor.lavavajillas_hora_de_finalizacion_del_programa",
    new Date(Date.now() + 48 * 60_000).toISOString(),
  );
  set("sensor.lavavajillas_puerta", "closed");
  set("sensor.lavavajillas_sal_casi_vacia", "off");
  set("sensor.lavavajillas_abrillantador_casi_vacio", "present");
  set("sensor.cocina_air_fryer_status", "bereit");
  set("sensor.cocina_air_fryer_temperature", "24");
  set("sensor.cocina_air_fryer_time_remaining", "0");
  set("switch.enchufe_lavadora", "on");
  set("sensor.enchufe_lavadora_power", "412");
  set("sensor.lavadora_estado", "Centrifugando");
  set("binary_sensor.lavadora_en_marcha", "on", { device_class: "running" });
  set("sensor.lavadero_arenero_neakasa_m1_status", "idle");
  set("sensor.lavadero_arenero_neakasa_m1_visits_today", "7");
  set("sensor.lavadero_arenero_neakasa_m1_sand_level", "80");
  set("binary_sensor.lavadero_arenero_neakasa_m1_needs_cleaning", "off");
  set("binary_sensor.lavadero_arenero_neakasa_m1_waste_bucket_full", "off");
  set("switch.interruptor_ventilacion_forzada", "on");
  set("sensor.interruptor_ventilacion_forzada_power_a", "15");
  set("switch.esp_bano_2_luz_toallero_bano_2", "on");
  set("switch.bano_1_bano_1_luz_toallero_bano_1", "off");
  for (const n of [1, 2])
    set(`input_select.modo_de_toalleros_bano_${n}`, "Automático Invierno", {
      options: ["Automático Invierno", "Automático Verano"],
    });
  set("switch.enchufe_limpiador_piscina", "off");
  set("switch.interruptor_depuradora", "on");
  set("sensor.interruptor_depuradora_power_a", "742");
  set("sensor.interruptor_depuradora_current_a", "3.31");
  set("sensor.interruptor_depuradora_voltage_a", "231");
  set("sensor.interruptor_depuradora_temperature", "27");
  set("sensor.interruptor_depuradora_energy", "532.9");
  set("schedule.horario_depuradora_de_piscina", "on", {
    friendly_name: "Horario depuradora de piscina",
    next_event: new Date(Date.now() + 40 * 60_000).toISOString(),
  });
  set("automation.encendido_y_apagado_automatico_de_depuradora_de_la_piscina", "on");
  set("binary_sensor.sensor_puerta_garaje_1_contact", "off", {}, ago(95));
  set("binary_sensor.sensor_puerta_garaje_2_contact", "on", {}, ago(4));
  set("binary_sensor.sensor_puerta_principal_contact", "off", {}, ago(30));
  set("lock.jardin_norte_portero_automatico_exterior_duox_zero", "locked");
  for (const r of ROOMS_DEF)
    for (const d of r.devices) {
      if (d.type === "cameras")
        d.cameras.forEach((c, i) => {
          set(c.motion, i === 1 ? "on" : "off", {}, ago(3 + i * 17));
          if (c.person) set(c.person, "off");
        });
      if (d.type === "presence") {
        if (d.occupancy) set(d.occupancy, Math.random() < 0.5 ? "on" : "off", {}, ago(12));
        if (d.illuminance) set(d.illuminance, String(Math.round(Math.random() * 400)));
      }
    }

  const emit = () =>
    onUpdate({
      states: { ...states },
      connected: true,
      language: "es",
      themes: { darkMode: getDarkMode() },
      connection: { subscribeMessage: async () => async () => {} },
      callWS: async <T>(msg: Record<string, unknown>) => mockWS(msg, states) as T,
      callService: async (domain, service, data) => {
        mockService(states, domain, service, data ?? {});
        emit();
      },
    });

  window.addEventListener("fv1-dev-refresh", emit);
  emit();
}

/** Estadísticas e historial inventados (curvas suaves y tramos de encendido). */
function mockWS(msg: Record<string, unknown>, states: Record<string, HassEntity>): unknown {
  const ids = (msg.statistic_ids ?? msg.entity_ids ?? []) as string[];
  const start = Date.parse(msg.start_time as string);
  const end = Date.now();
  const out: Record<string, unknown[]> = {};
  if (msg.type === "recorder/statistics_during_period") {
    const day = msg.period === "day";
    const step = day ? 86_400_000 : 3600_000;
    for (const id of ids) {
      const rows = [];
      for (let t = start, i = 0; t < end; t += step, i++) {
        const hour = new Date(t).getHours();
        const sun = Math.max(0, Math.sin(((hour - 7) / 12) * Math.PI));
        let v: number;
        if (day) v = id.includes("pv") ? 18 + Math.random() * 10 : 9 + Math.random() * 6;
        else if (id.includes("state_of_charge")) v = 40 + 45 * sun + i * 0.3;
        else if (id.includes("pv")) v = 5.2 * sun;
        else if (id.includes("load_power")) v = 0.45 + 0.6 * Math.abs(Math.sin(i / 3));
        else if (id.includes("humedad")) v = 50 + 6 * Math.cos(i / 4);
        else if (id.includes("congelador")) v = -19 + Math.sin(i) * 0.8;
        else if (id.includes("refrigerador")) v = 4 + Math.sin(i / 2) * 0.6;
        else if (id.includes("power")) v = hour >= 10 && hour < 16 ? 740 : 0;
        else v = 21 + 3.5 * sun + Math.random() * 0.3;
        if (id.includes("_energy")) v = 1.2 + Math.random() * 0.8;
        rows.push(day ? { start: t, state: v, change: v } : { start: t, mean: v });
      }
      out[id] = rows;
    }
    return out;
  }
  if (msg.type === "history/history_during_period") {
    for (const id of ids) {
      const rows: { s: string; lu: number }[] = [];
      const cover = id.startsWith("cover.");
      let t = start;
      let on = false;
      rows.push({ s: cover ? "closed" : "off", lu: t / 1000 });
      while (t < end) {
        t += (on ? 20 + Math.random() * 90 : 60 + Math.random() * 300) * 60_000;
        if (t >= end) break;
        on = !on;
        rows.push({ s: cover ? (on ? "open" : "closed") : on ? "on" : "off", lu: t / 1000 });
      }
      rows.push({ s: states[id]?.state ?? "off", lu: (end - 60_000) / 1000 });
      out[id] = rows;
    }
    return out;
  }
  if (msg.type === "schedule/list") {
    const day = [
      { from: "10:00:00", to: "11:00:00" },
      { from: "14:00:00", to: "15:00:00" },
    ];
    const week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    return [{ id: "horario_depuradora_de_piscina", ...Object.fromEntries(week.map((d) => [d, day])) }];
  }
  throw new Error("mock");
}

function mockService(
  states: Record<string, HassEntity>,
  domain: string,
  service: string,
  data: Record<string, unknown>,
): void {
  const ids = ([] as string[]).concat((data.entity_id as string | string[]) ?? []);
  for (const id of ids) {
    const st = states[id];
    if (!st) continue;
    const a = { ...st.attributes };
    let state = st.state;
    if (domain === "light" || domain === "switch") {
      state = service === "toggle" ? (state === "on" ? "off" : "on") : service === "turn_on" ? "on" : "off";
      if (typeof data.brightness_pct === "number")
        a.brightness = Math.round((data.brightness_pct / 100) * 255);
      if (typeof data.color_temp_kelvin === "number") a.color_temp_kelvin = data.color_temp_kelvin;
      if (Array.isArray(data.hs_color)) {
        a.hs_color = data.hs_color;
        a.rgb_color = hsl(data.hs_color[0] as number);
      }
      if (typeof data.effect === "string") a.effect = data.effect;
    }
    if (domain === "cover") {
      const pos =
        service === "open_cover"
          ? 100
          : service === "close_cover"
            ? 0
            : service === "set_cover_position"
              ? (data.position as number)
              : undefined;
      if (pos !== undefined) {
        a.current_position = pos;
        state = pos === 0 ? "closed" : "open";
      }
    }
    if (domain === "alarm_control_panel")
      state =
        service === "alarm_disarm"
          ? "disarmed"
          : service === "alarm_arm_night"
            ? "armed_night"
            : "armed_away";
    if (domain === "climate") {
      if (service === "set_temperature") a.temperature = data.temperature;
      if (service === "set_hvac_mode") state = String(data.hvac_mode);
      if (service === "set_fan_mode") a.fan_mode = data.fan_mode;
    }
    if (domain === "input_select") state = String(data.option);
    if (domain === "media_player") {
      if (service === "turn_off") state = "off";
      if (service === "volume_mute") a.is_volume_muted = data.is_volume_muted;
      if (service === "select_source") a.source = data.source;
    }
    if (domain === "remote")
      states["media_player.salon_tv_samsung_salon_85"] = entity(
        "media_player.salon_tv_samsung_salon_85",
        "on",
        { ...states["media_player.salon_tv_samsung_salon_85"].attributes, source: "TV", volume_level: 0.2 },
      );
    if (domain === "vacuum")
      state = service === "start" ? "cleaning" : service === "pause" ? "paused" : "returning";
    states[id] = entity(id, state, a);
  }
}

function hsl(h: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (0.62 - 0.45 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
