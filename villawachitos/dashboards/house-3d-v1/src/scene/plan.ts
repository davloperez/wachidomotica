/**
 * Plano de la vivienda (hipotético, una sola planta). Unidades en metros.
 * Ejes: X → este, Z → sur, Y → arriba. El origen está en el centro de la casa.
 *
 * Para ajustar el plano real basta con editar este archivo: habitaciones, muros con
 * sus huecos (puertas y ventanas), persianas y luces vinculadas a entidades de Home Assistant.
 */

export const WALL_HEIGHT = 2.7;
export const EXTERIOR_THICKNESS = 0.3;
export const INTERIOR_THICKNESS = 0.12;

export type FloorKind = "wood" | "tile" | "stone";

export interface Room {
  name: string;
  /** Esquina noroeste (x1, z1) y sureste (x2, z2) */
  rect: [x1: number, z1: number, x2: number, z2: number];
  floor: FloorKind;
}

export interface Opening {
  /** Distancia desde el inicio del muro hasta el centro del hueco */
  at: number;
  width: number;
  /** Altura del alféizar (0 para puertas y balconeras) */
  sill: number;
  height: number;
  kind: "window" | "door";
  /** Entidad `cover.*` de la persiana que cubre esta ventana */
  cover?: string;
}

export interface Wall {
  from: [x: number, z: number];
  to: [x: number, z: number];
  exterior?: boolean;
  openings?: Opening[];
}

export type LampKind = "ceiling" | "pendant" | "lamp" | "strip";

export interface Lamp {
  entity: string;
  kind: LampKind;
  pos: [x: number, y: number, z: number];
  /** Longitud de las tiras LED (en el eje indicado) */
  strip?: { length: number; axis: "x" | "z" };
}

export interface Furniture {
  /** Centro en planta, tamaño [ancho X, alto Y, fondo Z] */
  at: [x: number, z: number];
  size: [w: number, h: number, d: number];
  tone?: "dark" | "light" | "accent";
}

/* ------------------------------------------------------------------ */

export const ROOMS: Room[] = [
  { name: "Salón", rect: [-9, 1.5, 0, 6], floor: "wood" },
  { name: "Cocina", rect: [0, 1.5, 4, 6], floor: "tile" },
  { name: "Dormitorio 1", rect: [4, 1.5, 9, 6], floor: "wood" },
  { name: "Vestidor", rect: [4, 1.5, 6, 3.3], floor: "wood" },
  { name: "Pasillo", rect: [-9, 0, 9, 1.5], floor: "stone" },
  { name: "Distribuidor", rect: [4.5, -6, 6, 0], floor: "stone" },
  { name: "Oficina 1", rect: [-9, -6, -5.5, 0], floor: "wood" },
  { name: "Oficina 2", rect: [-5.5, -6, -2, 0], floor: "wood" },
  { name: "Baño 2", rect: [-2, -6, 0, 0], floor: "tile" },
  { name: "Entrada", rect: [0, -6, 2.5, 0], floor: "stone" },
  { name: "Baño 1", rect: [2.5, -6, 4.5, 0], floor: "tile" },
  { name: "Dormitorio 2", rect: [6, -6, 9, -3], floor: "wood" },
  { name: "Dormitorio 3", rect: [6, -3, 9, 0], floor: "wood" },
];

const door = (at: number, width = 0.9, height = 2.1): Opening => ({
  at,
  width,
  sill: 0,
  height,
  kind: "door",
});
const win = (at: number, width: number, sill: number, height: number, cover?: string): Opening => ({
  at,
  width,
  sill,
  height,
  kind: "window",
  cover,
});

export const WALLS: Wall[] = [
  /* ---------- Exteriores ---------- */
  {
    // Norte
    from: [-9, -6],
    to: [9, -6],
    exterior: true,
    openings: [
      win(1.75, 1.4, 0.9, 1.3, "cover.persiana_oficina_1_persiana"),
      win(5.25, 1.4, 0.9, 1.3, "cover.persiana_oficina_2_persiana"),
      win(8, 0.6, 1.6, 0.6),
      door(10.25, 1.1, 2.2),
      win(12.5, 0.6, 1.6, 0.6),
    ],
  },
  {
    // Sur
    from: [-9, 6],
    to: [9, 6],
    exterior: true,
    openings: [
      win(2, 1.8, 0, 2.2, "cover.persiana_salon_1_persiana"),
      win(4.5, 1.8, 0, 2.2, "cover.persiana_salon_2_persiana"),
      win(7, 1.8, 0, 2.2, "cover.persiana_salon_3_persiana"),
      win(11, 1.4, 1.0, 1.2),
      win(16, 1.6, 0.9, 1.3, "cover.persiana_dormitorio_1_persiana"),
    ],
  },
  {
    // Oeste
    from: [-9, -6],
    to: [-9, 6],
    exterior: true,
    openings: [win(3, 1.2, 0.9, 1.3), win(6.75, 1, 0.9, 1.3), win(9.75, 2.2, 0, 2.2)],
  },
  {
    // Este
    from: [9, -6],
    to: [9, 6],
    exterior: true,
    openings: [
      win(1.5, 1.4, 0.9, 1.3, "cover.persiana_dormitorio_2_persiana"),
      win(4.5, 1.4, 0.9, 1.3, "cover.persiana_dormitorio_3_persiana"),
      win(6.75, 0.8, 0.9, 1.3),
      win(10, 1.4, 0.9, 1.3),
    ],
  },

  /* ---------- Interiores ---------- */
  // Pasillo norte: puertas a oficinas, baños y entrada
  {
    from: [-9, 0],
    to: [4.5, 0],
    openings: [door(2.5), door(6), door(8, 0.8), door(10.25, 1.6, 2.3), door(12.5, 0.8)],
  },
  { from: [6, 0], to: [9, 0] },
  // Pasillo sur: salón (arco amplio), cocina, dormitorio 1
  { from: [-9, 1.5], to: [9, 1.5], openings: [door(4.5, 3, 2.4), door(10, 1.2), door(16)] },
  // Tabiques norte
  { from: [-5.5, -6], to: [-5.5, 0] },
  { from: [-2, -6], to: [-2, 0] },
  { from: [0, -6], to: [0, 0] },
  { from: [2.5, -6], to: [2.5, 0] },
  { from: [4.5, -6], to: [4.5, 0] },
  { from: [6, -6], to: [6, 0], openings: [door(1.5), door(4.5)] },
  { from: [6, -3], to: [9, -3] },
  // Tabiques sur
  { from: [0, 1.5], to: [0, 6], openings: [door(2.25, 2.5, 2.4)] },
  { from: [4, 1.5], to: [4, 6] },
  // Vestidor
  { from: [6, 1.5], to: [6, 3.3], openings: [door(0.9, 0.8)] },
  { from: [4, 3.3], to: [6, 3.3] },
];

export const LAMPS: Lamp[] = [
  /* Salón y pasillo */
  { entity: "light.salon_persiana_salon_3_luz_techo_salon", kind: "ceiling", pos: [-4.5, 2.55, 3.75] },
  { entity: "light.salon_persiana_salon_3_luz_pasillo_salon", kind: "ceiling", pos: [-6, 2.55, 0.75] },
  { entity: "light.salon_persiana_salon_3_luz_aplique_pasillo_salon", kind: "lamp", pos: [-2.5, 1.9, 0.14] },
  { entity: "light.wled_gledopto", kind: "strip", pos: [-4.5, 2.5, 5.75], strip: { length: 7.5, axis: "x" } },
  /* Entrada */
  { entity: "light.salon_esp_entrada_luz_techo_entrada", kind: "ceiling", pos: [1.25, 2.55, -3] },
  { entity: "light.salon_esp_entrada_luz_cuadro_entrada", kind: "lamp", pos: [0.15, 1.8, -1.5] },
  /* Cocina */
  { entity: "light.cocina_esp_cocina_luz_techo_cocina", kind: "ceiling", pos: [2, 2.55, 2.6] },
  { entity: "light.cocina_esp_cocina_luz_isla_cocina", kind: "pendant", pos: [2, 1.9, 4] },
  { entity: "light.led_barra_isla", kind: "strip", pos: [2, 0.95, 4.42], strip: { length: 2.2, axis: "x" } },
  { entity: "light.luz_fregadero_cocina", kind: "lamp", pos: [2, 2.0, 5.65] },
  /* Oficinas */
  { entity: "light.oficina_1_persiana_oficina_1_luz_techo", kind: "ceiling", pos: [-7.25, 2.55, -3] },
  { entity: "light.oficina_1_lampara_mueble_oficina_1", kind: "lamp", pos: [-8.55, 1.1, -0.6] },
  {
    entity: "light.oficina_1_wled_cortinero_oficina_1",
    kind: "strip",
    pos: [-7.25, 2.5, -5.75],
    strip: { length: 2.4, axis: "x" },
  },
  { entity: "light.persiana_oficina_2_luz_techo", kind: "ceiling", pos: [-3.75, 2.55, -3] },
  { entity: "light.oficina_2_lampara_pro_mi_1", kind: "lamp", pos: [-4.7, 1.15, -4.6] },
  { entity: "light.oficina_2_lampara_pro_mi_2_mijia_desk_lamp_sw", kind: "lamp", pos: [-2.8, 1.15, -4.6] },
  {
    entity: "light.oficina_2_wled_cortinero_oficina_2",
    kind: "strip",
    pos: [-3.75, 2.5, -5.75],
    strip: { length: 2.4, axis: "x" },
  },
  /* Baños */
  { entity: "light.bano_2_esp_bano_2_luz_techo_bano_2", kind: "ceiling", pos: [-1, 2.55, -3] },
  {
    entity: "light.bano_2_esp_bano_2_luz_espejo_bano_2",
    kind: "strip",
    pos: [-1, 1.8, -5.75],
    strip: { length: 0.9, axis: "x" },
  },
  { entity: "light.bano_2_esp_bano_2_luz_hornacina_bano_2", kind: "lamp", pos: [-1.85, 1.2, -1.8] },
  { entity: "light.bano_1_bano_1_luz_techo_bano_1", kind: "ceiling", pos: [3.5, 2.55, -3] },
  {
    entity: "light.bano_1_bano_1_luz_espejo_bano_1",
    kind: "strip",
    pos: [3.5, 1.8, -5.75],
    strip: { length: 0.9, axis: "x" },
  },
  { entity: "light.bano_1_bano_1_luz_hornacina_bano_1", kind: "lamp", pos: [2.65, 1.2, -1.8] },
  /* Distribuidor */
  { entity: "light.bano_2_esp_bano_2_luz_techo_pasillo", kind: "ceiling", pos: [5.25, 2.55, -3] },
  { entity: "light.bano_2_esp_bano_2_luz_aplique_pasillo", kind: "lamp", pos: [4.62, 1.9, -1.2] },
  /* Dormitorio 1 y vestidor */
  {
    entity: "light.dormitorio_1_persiana_dormitorio_1_luz_techo_dormitorio_1",
    kind: "ceiling",
    pos: [7, 2.55, 4.2],
  },
  { entity: "light.luz_mesita_noche_dorm_1", kind: "lamp", pos: [8.55, 0.75, 2.6] },
  { entity: "light.enchufe_luz_nube_infantil", kind: "lamp", pos: [4.4, 1.3, 5.5] },
  {
    entity: "light.dormitorio_1_persiana_dormitorio_1_luz_techo_vestidor",
    kind: "ceiling",
    pos: [5, 2.55, 2.4],
  },
  {
    entity: "light.luz_armarios_altos",
    kind: "strip",
    pos: [4.15, 2.2, 2.4],
    strip: { length: 1.6, axis: "z" },
  },
  {
    entity: "light.luz_armarios_bajos",
    kind: "strip",
    pos: [4.15, 0.35, 2.4],
    strip: { length: 1.6, axis: "z" },
  },
  { entity: "light.luz_cajones", kind: "strip", pos: [5, 0.8, 3.15], strip: { length: 1.2, axis: "x" } },
  /* Dormitorios 2 y 3 */
  { entity: "light.dormitorio_2_persiana_dormitorio_2_luz_techo", kind: "ceiling", pos: [7.5, 2.55, -4.5] },
  { entity: "light.luz_wifi_mesita_noche_dorm_2", kind: "lamp", pos: [8.55, 0.75, -5.5] },
  { entity: "light.dormitorio_3_persiana_dormitorio_3_luz_techo_2", kind: "ceiling", pos: [7.5, 2.55, -1.5] },
  { entity: "light.dormitorio_3_persiana_dormitorio_3_luz_mesita", kind: "lamp", pos: [8.55, 0.75, -2.6] },
  { entity: "light.dormitorio_3_persiana_dormitorio_3_luz_mesita_2", kind: "lamp", pos: [8.55, 0.75, -0.4] },
];

export const FURNITURE: Furniture[] = [
  // Salón: sofá en L, mesa baja, mueble TV, mesa de comedor
  { at: [-6.5, 4.6], size: [3.2, 0.8, 0.9], tone: "dark" },
  { at: [-8.3, 3.6], size: [0.9, 0.8, 2.2], tone: "dark" },
  { at: [-6.3, 3.3], size: [1.2, 0.4, 0.7], tone: "light" },
  { at: [-7.9, 1.8], size: [1.8, 0.5, 0.4], tone: "dark" },
  { at: [-2.2, 3.6], size: [2.0, 0.75, 1.0], tone: "light" },
  // Cocina: isla y encimera
  { at: [2, 4], size: [2.2, 0.92, 0.9], tone: "accent" },
  { at: [2, 5.6], size: [3.6, 0.9, 0.6], tone: "light" },
  { at: [3.65, 3.2], size: [0.6, 2.1, 2.6], tone: "light" },
  // Dormitorio 1
  { at: [7.9, 4.0], size: [2.0, 0.55, 1.8], tone: "light" },
  { at: [5.0, 5.5], size: [1.2, 0.6, 0.6], tone: "accent" },
  // Vestidor
  { at: [4.35, 2.4], size: [0.6, 2.3, 1.6], tone: "dark" },
  // Oficinas: mesas y sillas
  { at: [-7.25, -4.9], size: [2.0, 0.75, 0.8], tone: "light" },
  { at: [-3.75, -4.9], size: [2.6, 0.75, 0.8], tone: "light" },
  { at: [-8.55, -1.2], size: [0.6, 1.0, 1.6], tone: "dark" },
  // Baños
  { at: [-1, -5.5], size: [1.2, 0.85, 0.5], tone: "light" },
  { at: [3.5, -5.5], size: [1.2, 0.85, 0.5], tone: "light" },
  { at: [-1.4, -2.0], size: [0.9, 0.5, 1.6], tone: "light" },
  { at: [3.9, -2.0], size: [0.9, 0.5, 1.6], tone: "light" },
  // Dormitorios 2 y 3
  { at: [8.0, -4.5], size: [1.9, 0.5, 1.4], tone: "light" },
  { at: [8.0, -1.5], size: [1.9, 0.5, 1.4], tone: "light" },
];
