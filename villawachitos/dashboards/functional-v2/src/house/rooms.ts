/**
 * Estancias y espacios del panel, con sus dispositivos reales de Home Assistant.
 *
 * La forma de la casa (rectángulos, muros, luces y muebles) sale del plano compartido con
 * House 3D v1 (`src/plan/house-plan.ts`); aquí solo se decide qué se controla
 * y se muestra en cada estancia. Para añadir un dispositivo, basta con añadirlo a su estancia.
 */
import {
  mdiBathtubOutline,
  mdiBedDoubleOutline,
  mdiBedOutline,
  mdiDoorOpen,
  mdiPineTree,
  mdiSofaOutline,
  mdiStove,
  mdiTshirtCrewOutline,
  mdiWalk,
  mdiMonitor,
  mdiShower,
} from "@mdi/js";
import {
  ENERGY,
  FRIDGE,
  LAMPS,
  PEDESTRIAN_GATE,
  PRINTER,
  TOWEL_RAILS,
  PUMP,
  ROOMS,
  TV,
  VACUUM,
  WASHER,
  type Rect,
  type LampKind,
} from "../plan/house-plan";

export { ENERGY, FRIDGE, PRINTER, PUMP, TV, VACUUM, WASHER };

export interface LightDef {
  entity: string;
  name: string;
}

export interface CoverDef {
  entity: string;
  name: string;
  /** Cortina (se abre en horizontal) en vez de persiana: otro icono y otra tarjeta */
  curtain?: boolean;
}

/** Cámara (Frigate): sus sensores de movimiento y persona, y su entidad `camera.*` para la imagen y el directo. */
export interface CameraDef {
  name: string;
  motion: string;
  person?: string;
  camera?: string;
}

/** Cámaras sin sensores de movimiento propios (solo imagen): el portero automático. */
export const EXTRA_CAMERAS: { name: string; camera: string }[] = [
  { name: "Portero", camera: "camera.jardin_norte_portero_automatico_exterior_duox_doorbell_camera" },
];

/** Dispositivos con tarjeta propia en la vista de la estancia. */
export type DeviceDef =
  | { type: "hvac"; entity: string; name: string }
  | { type: "tv"; entity: string; name: string }
  | { type: "vacuum"; entity: string; name: string; battery?: string }
  | { type: "fridge"; name: string }
  | {
      type: "printer";
      name: string;
      entity: string;
      inks: Record<"black" | "cyan" | "magenta" | "yellow", string>;
    }
  | {
      type: "dishwasher";
      name: string;
      state: string;
      progress: string;
      end: string;
      door: string;
      salt: string;
      rinse: string;
    }
  | { type: "airfryer"; name: string; status: string; temperature: string; remaining: string }
  | { type: "washer"; name: string; entity: string; power: string; status: string; running: string }
  | {
      type: "litter";
      name: string;
      status: string;
      visits: string;
      sand: string;
      clean: string;
      full: string;
    }
  | { type: "towel"; name: string; entity: string; mode: string }
  | {
      type: "switch";
      name: string;
      entity: string;
      power?: string;
      icon?: string;
      /** Enchufe que dosifica de forma periódica (ambientador): script de descarga, temporizador, intervalo y automatización */
      dose?: { script: string; timer: string; interval: string; auto: string; hours?: string };
    }
  | { type: "pump"; name: string; entity: string; power: string; temperature?: string }
  | { type: "energy"; name: string }
  | { type: "gates"; name: string; gates: { entity: string; name: string }[] }
  | { type: "lock"; name: string; entity: string }
  | { type: "cameras"; name: string; cameras: CameraDef[] }
  | { type: "presence"; name: string; occupancy?: string; illuminance?: string };

export interface RoomDef {
  id: string;
  name: string;
  /** Nombre corto para la barra inferior */
  short?: string;
  icon: string;
  /** Rectángulos del plano que forman la estancia (vacío = espacio exterior) */
  rects: Rect[];
  /** Punto [x, z] del acceso en el plano cuando la estancia une varias (por defecto, centro del rectángulo mayor) */
  anchor?: [x: number, z: number];
  lights: LightDef[];
  covers: CoverDef[];
  /** Sensores de clima de la estancia */
  temperature?: string;
  humidity?: string;
  devices: DeviceDef[];
  /** Sensores que, si se activan, generan un aviso en la vista general */
  leaks?: string[];
  doors?: { entity: string; name: string }[];
}

const rectOf = (name: string): Rect[] => ROOMS.filter((r) => r.name === name).map((r) => r.rect);

export const ROOMS_DEF: RoomDef[] = [
  {
    id: "salon",
    name: "Salón",
    icon: mdiSofaOutline,
    rects: rectOf("Salón"),
    lights: [
      { entity: "light.salon_persiana_salon_3_luz_techo_salon", name: "Luz Techo" },
      { entity: "light.salon_persiana_salon_3_luz_pasillo_salon", name: "Luz Techo Pasillo" },
      { entity: "light.salon_persiana_salon_3_luz_aplique_pasillo_salon", name: "Aplique" },
      { entity: "light.wled_gledopto", name: "Cortinero LED" },
    ],
    covers: [
      { entity: "cover.persiana_salon_1_persiana", name: "Persiana 1" },
      { entity: "cover.persiana_salon_2_persiana", name: "Persiana 2" },
      { entity: "cover.persiana_salon_3_persiana", name: "Persiana 3" },
      { entity: "cover.cortina_grande_salon", name: "Cortina grande", curtain: true },
      { entity: "cover.cortina_pequena_salon", name: "Cortina pequeña", curtain: true },
    ],
    devices: [
      { type: "tv", entity: TV.entity, name: 'TV 85"' },
      {
        type: "vacuum",
        entity: VACUUM.entity,
        name: "Robot aspirador",
        battery: VACUUM.battery,
      },
      {
        type: "presence",
        name: "Panel del salón",
        occupancy: "binary_sensor.shellywalldisplay_0205030bbdd8_ocupacion",
        illuminance: "sensor.shellywalldisplay_0205030bbdd8_iluminancia",
      },
    ],
    leaks: ["binary_sensor.sensor_agua_dreame_water_leak"],
  },
  {
    id: "cocina",
    name: "Cocina",
    icon: mdiStove,
    rects: rectOf("Cocina").concat(ROOMS.filter((r) => r.name === "").map((r) => r.rect)),
    lights: [
      { entity: "light.cocina_esp_cocina_luz_techo_cocina", name: "Luz Techo" },
      { entity: "light.cocina_esp_cocina_luz_isla_cocina", name: "Luz de cocinar" },
      { entity: "light.led_barra_isla", name: "LED barra" },
      { entity: "light.luz_fregadero_cocina", name: "Fregadero" },
    ],
    covers: [],
    devices: [
      {
        type: "presence",
        name: "Panel cocina",
        occupancy: "binary_sensor.cocina_shelly_cocina_ocupacion",
        illuminance: "sensor.cocina_shelly_cocina_iluminancia",
      },
      { type: "fridge", name: "Frigorífico" },
      {
        type: "dishwasher",
        name: "Lavavajillas",
        state: "sensor.lavavajillas_estado_de_operacion",
        progress: "sensor.lavavajillas_progreso_del_programa",
        end: "sensor.lavavajillas_hora_de_finalizacion_del_programa",
        door: "sensor.lavavajillas_puerta",
        salt: "sensor.lavavajillas_sal_casi_vacia",
        rinse: "sensor.lavavajillas_abrillantador_casi_vacio",
      },
      {
        type: "airfryer",
        name: "Freidora de aire",
        status: "sensor.cocina_air_fryer_status",
        temperature: "sensor.cocina_air_fryer_temperature",
        remaining: "sensor.cocina_air_fryer_time_remaining",
      },
    ],
  },
  {
    id: "entrada",
    name: "Entrada",
    icon: mdiDoorOpen,
    // El recibidor sigue hacia el sur por el pasillo del cuadro (dentro del rectángulo de la cocina)
    rects: [...rectOf("Entrada"), [-5.76, -2.41, -4.6, -1.2]],
    lights: [
      { entity: "light.salon_esp_entrada_luz_techo_entrada", name: "Luz Techo" },
      { entity: "light.salon_esp_entrada_luz_cuadro_entrada", name: "Cuadro" },
    ],
    covers: [],
    // El control y termostato del aire acondicionado está en el armario del recibidor
    devices: [{ type: "hvac", entity: "climate.aidoo_28_cc_ff_82_82_6f", name: "Climatización" }],
    doors: [{ entity: "binary_sensor.sensor_puerta_principal_contact", name: "Puerta principal" }],
  },
  {
    id: "lavadero",
    name: "Lavadero",
    icon: mdiTshirtCrewOutline,
    rects: rectOf("Lavadero"),
    lights: [{ entity: "light.salon_esp_entrada_luz_techo_lavadero", name: "Luz Techo" }],
    covers: [],
    devices: [
      { type: "energy", name: "Instalación solar" },
      {
        type: "washer",
        name: "Lavadora",
        entity: WASHER.switch,
        power: WASHER.power,
        status: WASHER.status,
        running: WASHER.running,
      },
      {
        type: "litter",
        name: "Arenero",
        status: "sensor.lavadero_arenero_neakasa_m1_status",
        visits: "sensor.lavadero_arenero_neakasa_m1_visits_today",
        sand: "sensor.lavadero_arenero_neakasa_m1_sand_level",
        clean: "binary_sensor.lavadero_arenero_neakasa_m1_needs_cleaning",
        full: "binary_sensor.lavadero_arenero_neakasa_m1_waste_bucket_full",
      },
      {
        type: "switch",
        name: "Ventilación forzada",
        entity: "switch.interruptor_ventilacion_forzada",
        power: "sensor.interruptor_ventilacion_forzada_power_a",
      },
    ],
  },
  {
    id: "oficina_1",
    name: "Oficina 1",
    icon: mdiMonitor,
    rects: rectOf("Oficina 1"),
    lights: [
      { entity: "light.oficina_1_persiana_oficina_1_luz_techo", name: "Luz Techo" },
      { entity: "light.oficina_1_lampara_mueble_oficina_1", name: "Lámpara mueble" },
      { entity: "light.oficina_1_wled_cortinero_oficina_1", name: "Cortinero" },
    ],
    covers: [{ entity: "cover.persiana_oficina_1_persiana", name: "Persiana" }],
    devices: [
      { type: "printer", name: "Impresora", entity: PRINTER.entity, inks: PRINTER.inks },
      {
        type: "switch",
        name: "Ambientador",
        entity: "switch.enchufe_ambientador",
        // Dosificación periódica (automatización «Ambientador periódico»): una descarga de 10 s cada X minutos
        dose: {
          script: "script.ambientador_descarga",
          timer: "timer.ambientador",
          interval: "input_number.ambientador_intervalo",
          auto: "automation.ambientador_periodico",
          hours: "08:00–21:00",
        },
      },
      {
        type: "presence",
        name: "Panel oficina 1",
        occupancy: "binary_sensor.oficina_1_shellywalldisplay_oficina1_ocupacion",
        illuminance: "sensor.oficina_1_shellywalldisplay_oficina1_iluminancia",
      },
    ],
  },
  {
    id: "oficina_2",
    name: "Oficina 2",
    icon: mdiMonitor,
    rects: rectOf("Oficina 2"),
    lights: [
      { entity: "light.persiana_oficina_2_luz_techo", name: "Luz Techo" },
      { entity: "light.oficina_2_lampara_pro_mi_1", name: "Flexo 1" },
      { entity: "light.oficina_2_lampara_pro_mi_2_mijia_desk_lamp_sw", name: "Flexo 2" },
      { entity: "light.oficina_2_wled_cortinero_oficina_2", name: "Cortinero" },
    ],
    covers: [{ entity: "cover.persiana_oficina_2_persiana", name: "Persiana" }],
    devices: [
      {
        type: "presence",
        name: "Panel oficina 2",
        occupancy: "binary_sensor.oficina_2_shellywalldisplay_oficina2_ocupacion",
        illuminance: "sensor.oficina_2_shellywalldisplay_oficina2_iluminancia",
      },
    ],
  },
  {
    id: "bano_2",
    name: "Baño 2",
    icon: mdiShower,
    rects: rectOf("Baño 2"),
    lights: [
      { entity: "light.bano_2_esp_bano_2_luz_techo_bano_2", name: "Luz Techo" },
      { entity: "light.bano_2_esp_bano_2_luz_espejo_bano_2", name: "Espejo" },
      { entity: "light.bano_2_esp_bano_2_luz_hornacina_bano_2", name: "Hornacina" },
    ],
    covers: [],
    devices: [
      {
        type: "towel",
        name: "Toallero",
        entity: "switch.esp_bano_2_luz_toallero_bano_2",
        mode: "input_select.modo_de_toalleros_bano_2",
      },
      {
        type: "presence",
        name: "Panel baño 2",
        occupancy: "binary_sensor.bano_2_shelly_bano_2_ocupacion",
        illuminance: "sensor.bano_2_shelly_bano_2_iluminancia",
      },
    ],
  },
  {
    id: "dormitorio_3",
    name: "Dormitorio 3",
    short: "Dorm. 3",
    icon: mdiBedOutline,
    rects: rectOf("Dormitorio 3"),
    lights: [
      { entity: "light.dormitorio_3_persiana_dormitorio_3_luz_techo", name: "Luz Techo" },
      { entity: "light.dormitorio_3_persiana_dormitorio_3_luz_techo_2", name: "Luz Techo 2" },
      { entity: "light.dormitorio_3_persiana_dormitorio_3_luz_mesita", name: "Mesita 1" },
      { entity: "light.dormitorio_3_persiana_dormitorio_3_luz_mesita_2", name: "Mesita 2" },
    ],
    covers: [{ entity: "cover.persiana_dormitorio_3_persiana", name: "Persiana" }],
    devices: [
      {
        type: "presence",
        name: "Panel dormitorio 3",
        occupancy: "binary_sensor.dormitorio_3_shelly_dormitorio_3_ocupacion",
        illuminance: "sensor.dormitorio_3_shelly_dormitorio_3_iluminancia",
      },
    ],
  },
  {
    id: "pasillo",
    name: "Pasillo",
    icon: mdiWalk,
    rects: rectOf("Pasillo"),
    lights: [
      { entity: "light.bano_2_esp_bano_2_luz_techo_pasillo", name: "Luz Techo" },
      { entity: "light.bano_2_esp_bano_2_luz_aplique_pasillo", name: "Aplique" },
    ],
    covers: [],
    devices: [],
  },
  {
    id: "dormitorio_2",
    name: "Dormitorio 2",
    short: "Dorm. 2",
    icon: mdiBedOutline,
    rects: rectOf("Dormitorio 2"),
    lights: [
      { entity: "light.dormitorio_2_persiana_dormitorio_2_luz_techo", name: "Luz Techo" },
      { entity: "light.luz_wifi_mesita_noche_dorm_2", name: "Mesita" },
    ],
    covers: [{ entity: "cover.persiana_dormitorio_2_persiana", name: "Persiana" }],
    devices: [
      {
        type: "presence",
        name: "Panel dormitorio 2",
        occupancy: "binary_sensor.dormitorio_2_shelly_dormitorio_2_ocupacion",
        illuminance: "sensor.dormitorio_2_shelly_dormitorio_2_iluminancia",
      },
    ],
  },
  {
    // Dormitorio principal y su vestidor en una sola vista
    id: "dormitorio_1",
    name: "Dormitorio 1 y vestidor",
    short: "Dorm. 1",
    icon: mdiBedDoubleOutline,
    rects: [...rectOf("Dormitorio 1"), ...rectOf("Vestidor")],
    anchor: [3.3, 2.18],
    lights: [
      { entity: "light.dormitorio_1_persiana_dormitorio_1_luz_techo_dormitorio_1", name: "Luz Techo" },
      { entity: "light.luz_mesita_noche_dorm_1", name: "Mesita" },
      { entity: "light.enchufe_luz_nube_infantil", name: "Nube infantil" },
      { entity: "light.dormitorio_1_persiana_dormitorio_1_luz_techo_vestidor", name: "Luz Techo vestidor" },
      { entity: "light.luz_armarios_altos", name: "Armarios altos" },
      { entity: "light.luz_armarios_bajos", name: "Armarios bajos" },
      { entity: "light.luz_cajones", name: "Cajones" },
    ],
    covers: [{ entity: "cover.persiana_dormitorio_1_persiana", name: "Persiana" }],
    devices: [
      {
        type: "presence",
        name: "Movimiento vestidor",
        occupancy: "binary_sensor.sensor_movimiento_vestidor_occupancy",
      },
      {
        type: "presence",
        name: "Panel dormitorio 1",
        occupancy: "binary_sensor.dormitorio_1_shelly_dormitorio_1_ocupacion",
        illuminance: "sensor.dormitorio_1_shelly_dormitorio_1_iluminancia",
      },
    ],
  },
  {
    id: "bano_1",
    name: "Baño 1",
    icon: mdiBathtubOutline,
    rects: rectOf("Baño 1"),
    lights: [
      { entity: "light.bano_1_bano_1_luz_techo_bano_1", name: "Luz Techo" },
      { entity: "light.bano_1_bano_1_luz_espejo_bano_1", name: "Espejo" },
      { entity: "light.bano_1_bano_1_luz_hornacina_bano_1", name: "Hornacina" },
    ],
    covers: [],
    devices: [
      {
        type: "towel",
        name: "Toallero",
        entity: "switch.bano_1_bano_1_luz_toallero_bano_1",
        mode: "input_select.modo_de_toalleros_bano_1",
      },
      {
        type: "presence",
        name: "Panel baño 1",
        occupancy: "binary_sensor.bano_1_shelly_bano_1_ocupacion",
        illuminance: "sensor.bano_1_shelly_bano_1_iluminancia",
      },
    ],
  },
  {
    id: "exterior",
    name: "Jardín y piscina",
    short: "Exterior",
    icon: mdiPineTree,
    rects: [],
    lights: [
      { entity: "light.jardin_sur_luz_piscina", name: "Piscina" },
      { entity: "light.lampara_blanca_exterior", name: "Lámpara jardín" },
      { entity: "light.salon_esp_entrada_luz_exterior_barbacoa", name: "Barbacoa" },
      { entity: "light.salon_esp_entrada_luz_mamposteria_entrada", name: "Mampostería" },
      { entity: "light.luz_exterior_oficinas", name: "Fachada oficinas" },
      { entity: "light.bano_2_esp_bano_2_luz_exterior_bano_2", name: "Fachada baño 2" },
      {
        entity: "light.dormitorio_3_persiana_dormitorio_3_luz_exterior_dormitorio_3",
        name: "Lateral dorm. 3",
      },
      {
        entity: "light.dormitorio_3_persiana_dormitorio_3_luz_exterior_dormitorio_2",
        name: "Lateral dorm. 2",
      },
      { entity: "light.salon_esp_entrada_luz_exterior_lavadero", name: "Patio lavadero" },
    ],
    covers: [],
    devices: [
      { type: "pump", name: "Depuradora", entity: PUMP.entity, power: PUMP.power },
      // Portero automático en la puerta peatonal del jardín norte
      {
        type: "lock",
        name: "Portero de la calle",
        entity: "lock.jardin_norte_portero_automatico_exterior_duox_zero",
      },
      {
        type: "gates",
        name: "Puertas de la calle",
        gates: [
          { entity: "binary_sensor.sensor_puerta_garaje_1_contact", name: "Garaje 1" },
          { entity: "binary_sensor.sensor_puerta_garaje_2_contact", name: "Garaje 2" },
        ],
      },
      {
        type: "cameras",
        name: "Cámaras",
        cameras: [
          {
            name: "Garaje",
            camera: "camera.cam_garaje",
            motion: "binary_sensor.cam_garaje_motion",
            person: "binary_sensor.cam_garaje_person_occupancy",
          },
          {
            name: "Patio lavadero",
            camera: "camera.cam_patio_lavadero",
            motion: "binary_sensor.cam_patio_lavadero_motion_2",
            person: "binary_sensor.cam_patio_lavadero_person_occupancy",
          },
          {
            name: "Piscina este",
            camera: "camera.cam_piscina_este",
            motion: "binary_sensor.cam_piscina_este_motion",
            person: "binary_sensor.cam_piscina_este_person_occupancy",
          },
          {
            name: "Piscina oeste",
            camera: "camera.cam_piscina_oeste",
            motion: "binary_sensor.cam_piscina_oeste_motion_2",
            person: "binary_sensor.cam_piscina_oeste_person_occupancy",
          },
          {
            name: "Exterior este",
            camera: "camera.cam_exterior_este",
            motion: "binary_sensor.cam_exterior_este_motion_2",
            person: "binary_sensor.cam_exterior_este_person_occupancy",
          },
        ],
      },
    ],
  },
];

export const ROOM_BY_ID = new Map(ROOMS_DEF.map((r) => [r.id, r]));

/** Tipo de luminaria según el plano (para el icono y las escenas). */
export function lampKind(entity: string): LampKind | undefined {
  return LAMPS.find((l) => l.entity === entity)?.kind;
}

/** Posición de la luminaria en el plano [x, y, z] (si está en el plano). */
/** Marcadores de luz que no van sobre la propia luminaria del plano, [x, z] (el aplique del pasillo, en su pared). */
const PIN_OVERRIDE: Record<string, [number, number]> = {
  "light.salon_persiana_salon_3_luz_aplique_pasillo_salon": [-1.15, -0.61],
};

export function lampPos(entity: string): [number, number, number] | undefined {
  const l = LAMPS.find((x) => x.entity === entity);
  if (!l) return undefined;
  const o = PIN_OVERRIDE[entity];
  if (o) return [o[0], l.pos[1], o[1]];
  // Marcador desplazado (luces de un mismo mueble repartidas para que no se solapen)
  return l.pin ? [l.pin[0], l.pos[1], l.pin[1]] : l.pos;
}

/** Punto del marcador de un dispositivo en el plano (los toalleros, en su pared de cada baño). */
export function deviceSpot(d: DeviceDef): [number, number, number] | undefined {
  if (d.type === "towel") {
    const t = TOWEL_RAILS.find((r) => r.entity === d.entity);
    return t ? [t.at[0], 1.2, t.at[1]] : undefined;
  }
  return DEVICE_SPOTS[d.type];
}

/** Sensores de fugas de agua sin estancia asignada (zigbee). */
export const EXTRA_LEAKS = [
  "binary_sensor.0xa4c1380e560ce904_water_leak",
  "binary_sensor.0xa4c138c3d63ea15c_water_leak",
];

export const PEOPLE = ["person.david_lopez_perez", "person.inmaculada_perez_mayoer"];

/** Script de Home Assistant que lo apaga todo (botón de la vista general). */
export const ALL_OFF_SCRIPT = "script.apagar_todo";

/** Dispositivos con sitio en el plano (marcador al entrar en su estancia). */
export const DEVICE_SPOTS: Partial<Record<DeviceDef["type"], [x: number, y: number, z: number]>> = {
  fridge: [FRIDGE.at[0], 1.35, FRIDGE.at[1]],
  vacuum: [VACUUM.dock[0] - 0.2, 0.7, VACUUM.dock[1]],
  printer: [PRINTER.at[0], 1.15, PRINTER.at[1]],
  washer: [WASHER.at[0], 1.15, WASHER.at[1]],
  energy: [ENERGY.battery.at[0], 1.65, ENERGY.battery.at[1]],
  pump: [(PUMP.rect[0] + PUMP.rect[2]) / 2, 0.7, (PUMP.rect[1] + PUMP.rect[3]) / 2],
  lock: [
    (PEDESTRIAN_GATE.from[0] + PEDESTRIAN_GATE.to[0]) / 2,
    1.6,
    (PEDESTRIAN_GATE.from[1] + PEDESTRIAN_GATE.to[1]) / 2 + 0.3,
  ],
};
