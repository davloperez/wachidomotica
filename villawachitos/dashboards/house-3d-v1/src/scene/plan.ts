/**
 * Plano de la vivienda y la parcela (una planta). Unidades en metros.
 *
 * Medido sobre el plano a escala de la parcela (C7-4, 163,30 m² construidos). Ejes del plano:
 * X → derecha del plano, Z → abajo del plano (hacia la piscina), Y → arriba. El origen está en el
 * centro de la casa. La fachada a la calle queda arriba (Z negativo) y la piscina abajo.
 * El norte geográfico está girado `NORTH_ANGLE` grados en sentido horario respecto a "arriba".
 *
 * Para retocar la casa basta con editar este archivo: estancias, muros con sus huecos
 * (puertas y ventanas), persianas, luces vinculadas a entidades y exteriores.
 */

export const WALL_HEIGHT = 2.7;
export const EXTERIOR_THICKNESS = 0.3;
export const INTERIOR_THICKNESS = 0.12;

/** Norte real respecto al "arriba" del plano (grados, horario). Según la rosa del plano. */
export const NORTH_ANGLE = 26;

/** Tipo de suelo (de momento todos beige y sin reaccionar a la luz; se mantiene por si cambia). */
export type FloorKind = "wood" | "tile" | "stone";
export type Rect = [x1: number, z1: number, x2: number, z2: number];
export type Point = [x: number, z: number];

export interface Room {
  /** Nombre visible; vacío para trozos de una estancia que ya tiene etiqueta. */
  name: string;
  /** Esquina superior izquierda (x1, z1) e inferior derecha (x2, z2) */
  rect: Rect;
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
  from: Point;
  to: Point;
  exterior?: boolean;
  openings?: Opening[];
}

export type LampKind = "ceiling" | "downlights" | "pendant" | "lamp" | "strip" | "wall" | "pool";

export interface Lamp {
  entity: string;
  kind: LampKind;
  pos: [x: number, y: number, z: number];
  /** Longitud de las tiras LED (en el eje indicado) */
  strip?: { length: number; axis: "x" | "z" };
  /** Downlights empotrados que forman la misma luz (se encienden juntos) */
  spots?: Point[];
}

/** 4 downlights repartidos 2 × 2 por el techo de una estancia, como luz de techo. */
function downlights(entity: string, [x1, z1, x2, z2]: Rect): Lamp {
  const xs = [x1 + (x2 - x1) / 4, x1 + ((x2 - x1) * 3) / 4];
  const zs = [z1 + (z2 - z1) / 4, z1 + ((z2 - z1) * 3) / 4];
  return {
    entity,
    kind: "downlights",
    pos: [(x1 + x2) / 2, 2.62, (z1 + z2) / 2],
    spots: xs.flatMap((x) => zs.map((z): Point => [x, z])),
  };
}

export type FurnitureTone =
  | "dark"
  | "light"
  | "accent"
  | "white"
  | "wood"
  | "darkwood"
  | "beige"
  | "sofa"
  | "screen"
  | "steel"
  | "glass";

export interface Furniture {
  /** Centro en planta, tamaño [ancho X, alto Y, fondo Z] */
  at: Point;
  size: [w: number, h: number, d: number];
  tone?: FurnitureTone;
  /** Encimera o tapa de otro color (4 cm) */
  top?: FurnitureTone;
  /** Altura de la base sobre el suelo (para objetos colgados, como la TV) */
  lift?: number;
}

/* ------------------------------------------------------------------ */
/* Estancias                                                           */
/* ------------------------------------------------------------------ */

export const ROOMS: Room[] = [
  { name: "Oficina 1", rect: [-3.85, -5.7, -1.33, -2.41], floor: "wood" },
  { name: "Oficina 2", rect: [-1.33, -5.7, 1.09, -2.41], floor: "wood" },
  { name: "Baño 2", rect: [1.09, -5.7, 2.88, -2.41], floor: "tile" },
  { name: "Dormitorio 3", rect: [2.88, -5.7, 7.7, -2.41], floor: "wood" },
  { name: "Entrada", rect: [-5.76, -4.04, -3.85, -2.41], floor: "stone" },
  { name: "Lavadero", rect: [-7.68, -4.04, -5.76, 0.79], floor: "tile" },
  { name: "Cocina", rect: [-5.76, -2.41, -3.05, 4.48], floor: "wood" },
  { name: "", rect: [-6.54, -0.13, -5.76, 4.48], floor: "wood" },
  { name: "Salón", rect: [-3.05, -2.41, 1.25, 4.48], floor: "wood" },
  { name: "Pasillo", rect: [1.25, -2.41, 4.57, -1.22], floor: "stone" },
  { name: "Vestidor", rect: [1.25, -1.22, 4.57, 2.18], floor: "wood" },
  { name: "Dormitorio 2", rect: [4.57, -2.41, 7.7, 2.18], floor: "wood" },
  { name: "Dormitorio 1", rect: [1.15, 2.18, 5.92, 5.7], floor: "wood" },
  { name: "Baño 1", rect: [5.92, 2.18, 7.7, 5.7], floor: "tile" },
];

/** Huella de la casa (exterior de los muros) para el tejado invisible que da sombra. */
export const FOOTPRINT: Rect[] = [
  [-4.0, -5.85, 7.85, -4.0],
  [-7.83, -4.19, -6.54, 0.94],
  [-6.69, -4.19, 7.85, 4.63],
  [1.0, 4.48, 7.85, 5.85],
];

/* ------------------------------------------------------------------ */
/* Muros                                                               */
/* ------------------------------------------------------------------ */

const door = (at: number, width = 0.82, height = 2.1): Opening => ({
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
    // Fachada a la calle: oficinas (puertas correderas hasta el suelo), baño 2 y dormitorio 3
    from: [-3.85, -5.7],
    to: [7.7, -5.7],
    exterior: true,
    openings: [
      win(1.33, 1.45, 0, 2.2, "cover.persiana_oficina_1_persiana"),
      win(3.66, 1.45, 0, 2.2, "cover.persiana_oficina_2_persiana"),
      // Baño 2: ventana estrecha de suelo a techo (50 cm × 2,2 m)
      win(6.21, 0.5, 0, 2.2),
    ],
  },
  {
    // Lateral derecho: correderas de los dormitorios 3 y 2 y puerta de la ducha del baño 1
    from: [7.7, -5.7],
    to: [7.7, 5.7],
    exterior: true,
    openings: [
      win(1.82, 1.5, 0, 2.2, "cover.persiana_dormitorio_3_persiana"),
      win(4.89, 1.45, 0, 2.2, "cover.persiana_dormitorio_2_persiana"),
      door(8.4, 0.75, 2.1),
    ],
  },
  {
    // Fachada a la piscina del dormitorio 1 y el baño 1
    from: [1.15, 5.7],
    to: [7.7, 5.7],
    exterior: true,
    openings: [win(3.04, 1.95, 0, 2.2, "cover.persiana_dormitorio_1_persiana"), win(5.89, 0.9, 1.5, 0.7)],
  },
  { from: [1.15, 4.48], to: [1.15, 5.7], exterior: true },
  {
    // Fachada a la piscina del salón: tres balconeras
    from: [-6.54, 4.48],
    to: [1.15, 4.48],
    exterior: true,
    openings: [
      // Las balconeras 1 y 2 van pegadas, sin pilar: solo las separa el perfil negro de sus marcos.
      win(1.8275, 2.195, 0, 2.2, "cover.persiana_salon_1_persiana"),
      win(4.0225, 2.195, 0, 2.2, "cover.persiana_salon_2_persiana"),
      win(6.47, 1.95, 0, 2.2, "cover.persiana_salon_3_persiana"),
    ],
  },
  {
    // Lateral izquierdo de la cocina: ventana de 1,8 m sobre la encimera del fregadero
    from: [-6.54, 0.79],
    to: [-6.54, 4.48],
    exterior: true,
    openings: [win(1.33, 1.8, 1.05, 1.0)],
  },
  { from: [-7.68, 0.79], to: [-6.54, 0.79], exterior: true },
  {
    // Lateral izquierdo del lavadero, con puerta al jardín
    from: [-7.68, -4.04],
    to: [-7.68, 0.79],
    exterior: true,
    openings: [door(3.53, 0.82)],
  },
  {
    // Fachada a la calle del lavadero y la entrada: puerta principal (el fijo de vidrio del plano no existe)
    from: [-7.68, -4.04],
    to: [-3.85, -4.04],
    exterior: true,
    openings: [door(2.49, 0.95, 2.2)],
  },
  { from: [-3.85, -5.7], to: [-3.85, -4.04], exterior: true },

  /* ---------- Interiores ---------- */
  // Lavadero
  { from: [-5.76, -4.04], to: [-5.76, -0.13], openings: [door(3.53, 0.75)] },
  { from: [-6.54, -0.13], to: [-5.76, -0.13] },
  { from: [-6.54, -0.13], to: [-6.54, 0.79] },
  // Entrada / despacho 1
  { from: [-3.85, -4.04], to: [-3.85, -2.41] },
  // Frente de despachos, baño 2 y dormitorio 2
  {
    from: [-3.85, -2.41],
    to: [7.7, -2.41],
    openings: [door(1.62), door(3.96), door(6.22, 0.75), door(7.87, 0.85)],
  },
  { from: [-1.33, -5.7], to: [-1.33, -2.41] },
  { from: [1.09, -5.7], to: [1.09, -2.41] },
  { from: [2.88, -5.7], to: [2.88, -2.41] },
  // Dormitorio 2
  { from: [4.57, -2.41], to: [4.57, 2.18], openings: [door(0.51)] },
  { from: [2.88, 2.18], to: [7.7, 2.18] },
  // Vestidor: entrada desde el pasillo y abierto a la suite
  { from: [1.25, -1.22], to: [4.57, -1.22], openings: [door(1.12, 0.75)] },
  // Salón / vestidor y suite (puerta de la suite al fondo)
  { from: [1.25, -1.49], to: [1.25, 4.48], openings: [door(5.33)] },
  // Dormitorio 1 / baño 1
  { from: [5.92, 2.18], to: [5.92, 5.7], openings: [door(2.42, 0.75)] },
];

/* ------------------------------------------------------------------ */
/* Luces                                                               */
/* ------------------------------------------------------------------ */

export const LAMPS: Lamp[] = [
  /* Salón */
  { entity: "light.salon_persiana_salon_3_luz_techo_salon", kind: "ceiling", pos: [-1.9, 2.55, 1.6] },
  { entity: "light.salon_persiana_salon_3_luz_pasillo_salon", kind: "ceiling", pos: [-0.6, 2.55, -1.9] },
  { entity: "light.salon_persiana_salon_3_luz_aplique_pasillo_salon", kind: "lamp", pos: [-1.33, 1.9, -2.3] },
  {
    // Cortinero de la pared sur, encima de las tres balconeras
    entity: "light.wled_gledopto",
    kind: "strip",
    pos: [-2.47, 2.4, 4.33],
    strip: { length: 6.8, axis: "x" },
  },
  /* Entrada y lavadero */
  { entity: "light.salon_esp_entrada_luz_techo_entrada", kind: "ceiling", pos: [-4.8, 2.55, -3.2] },
  { entity: "light.salon_esp_entrada_luz_cuadro_entrada", kind: "lamp", pos: [-3.95, 1.8, -3.2] },
  { entity: "light.salon_esp_entrada_luz_techo_lavadero", kind: "ceiling", pos: [-6.7, 2.55, -2.0] },
  /* Cocina */
  { entity: "light.cocina_esp_cocina_luz_techo_cocina", kind: "ceiling", pos: [-5.2, 2.55, 0.4] },
  { entity: "light.cocina_esp_cocina_luz_isla_cocina", kind: "pendant", pos: [-4.21, 1.9, 1.77] },
  {
    entity: "light.led_barra_isla",
    kind: "strip",
    pos: [-3.7, 0.95, 1.77],
    strip: { length: 2.9, axis: "z" },
  },
  { entity: "light.luz_fregadero_cocina", kind: "lamp", pos: [-6.05, 2.0, 2.1] },
  /* Oficina 1 */
  downlights("light.oficina_1_persiana_oficina_1_luz_techo", [-3.85, -5.7, -1.33, -2.41]),
  { entity: "light.oficina_1_lampara_mueble_oficina_1", kind: "lamp", pos: [-3.5, 1.1, -2.85] },
  {
    entity: "light.oficina_1_wled_cortinero_oficina_1",
    kind: "strip",
    pos: [-2.52, 2.5, -5.45],
    strip: { length: 1.9, axis: "x" },
  },
  /* Oficina 2 */
  downlights("light.persiana_oficina_2_luz_techo", [-1.33, -5.7, 1.09, -2.41]),
  { entity: "light.oficina_2_lampara_pro_mi_1", kind: "lamp", pos: [-1.0, 1.15, -5.0] },
  { entity: "light.oficina_2_lampara_pro_mi_2_mijia_desk_lamp_sw", kind: "lamp", pos: [-1.0, 1.15, -3.4] },
  {
    entity: "light.oficina_2_wled_cortinero_oficina_2",
    kind: "strip",
    pos: [-0.19, 2.5, -5.45],
    strip: { length: 1.9, axis: "x" },
  },
  /* Baño 2 */
  { entity: "light.bano_2_esp_bano_2_luz_techo_bano_2", kind: "ceiling", pos: [1.98, 2.55, -4.0] },
  {
    entity: "light.bano_2_esp_bano_2_luz_espejo_bano_2",
    kind: "strip",
    pos: [1.2, 1.7, -2.95],
    strip: { length: 0.8, axis: "z" },
  },
  { entity: "light.bano_2_esp_bano_2_luz_hornacina_bano_2", kind: "lamp", pos: [2.4, 1.2, -5.45] },
  /* Pasillo */
  { entity: "light.bano_2_esp_bano_2_luz_techo_pasillo", kind: "ceiling", pos: [2.9, 2.55, -1.8] },
  { entity: "light.bano_2_esp_bano_2_luz_aplique_pasillo", kind: "lamp", pos: [3.6, 1.9, -2.33] },
  /* Dormitorio 3 (esquina de la calle) */
  downlights("light.dormitorio_3_persiana_dormitorio_3_luz_techo", [2.88, -5.7, 7.7, -2.41]),
  {
    entity: "light.dormitorio_3_persiana_dormitorio_3_luz_techo_2",
    kind: "ceiling",
    pos: [5.3, 2.55, -4.05],
  },
  { entity: "light.dormitorio_3_persiana_dormitorio_3_luz_mesita", kind: "lamp", pos: [4.1, 0.75, -5.3] },
  { entity: "light.dormitorio_3_persiana_dormitorio_3_luz_mesita_2", kind: "lamp", pos: [6.05, 0.75, -5.3] },
  /* Dormitorio 2 */
  downlights("light.dormitorio_2_persiana_dormitorio_2_luz_techo", [4.57, -2.41, 7.7, 2.18]),
  { entity: "light.luz_wifi_mesita_noche_dorm_2", kind: "lamp", pos: [4.85, 0.75, -0.95] },
  /* Vestidor */
  downlights("light.dormitorio_1_persiana_dormitorio_1_luz_techo_vestidor", [1.25, -1.22, 4.57, 2.18]),
  // Tiras de los armarios: todas en el frente de los armarios de la pared oeste
  {
    entity: "light.luz_armarios_altos",
    kind: "strip",
    pos: [1.86, 2.15, 0.48],
    strip: { length: 3.2, axis: "z" },
  },
  {
    entity: "light.luz_armarios_bajos",
    kind: "strip",
    pos: [1.86, 0.3, 0.48],
    strip: { length: 3.2, axis: "z" },
  },
  { entity: "light.luz_cajones", kind: "strip", pos: [1.86, 0.85, 0.48], strip: { length: 3.2, axis: "z" } },
  /* Dormitorio 1 */
  downlights("light.dormitorio_1_persiana_dormitorio_1_luz_techo_dormitorio_1", [1.15, 2.18, 5.92, 5.7]),
  { entity: "light.luz_mesita_noche_dorm_1", kind: "lamp", pos: [2.95, 0.75, 2.5] },
  { entity: "light.enchufe_luz_nube_infantil", kind: "lamp", pos: [5.5, 1.3, 2.5] },
  /* Baño 1 */
  { entity: "light.bano_1_bano_1_luz_techo_bano_1", kind: "ceiling", pos: [6.8, 2.55, 3.9] },
  {
    entity: "light.bano_1_bano_1_luz_espejo_bano_1",
    kind: "strip",
    pos: [7.5, 1.7, 3.9],
    strip: { length: 1.3, axis: "z" },
  },
  { entity: "light.bano_1_bano_1_luz_hornacina_bano_1", kind: "lamp", pos: [6.5, 1.2, 5.4] },

  /* Exteriores */
  { entity: "light.salon_esp_entrada_luz_mamposteria_entrada", kind: "wall", pos: [-5.9, 1.9, -4.3] },
  { entity: "light.luz_exterior_oficinas", kind: "wall", pos: [-1.33, 2.2, -5.95] },
  { entity: "light.bano_2_esp_bano_2_luz_exterior_bano_2", kind: "wall", pos: [3.6, 2.2, -5.95] },
  {
    entity: "light.dormitorio_3_persiana_dormitorio_3_luz_exterior_dormitorio_3",
    kind: "wall",
    pos: [7.95, 2.2, -2.4],
  },
  {
    entity: "light.dormitorio_3_persiana_dormitorio_3_luz_exterior_dormitorio_2",
    kind: "wall",
    pos: [7.95, 2.2, 0.9],
  },
  { entity: "light.salon_esp_entrada_luz_exterior_lavadero", kind: "wall", pos: [-7.93, 2.0, -1.2] },
  { entity: "light.salon_esp_entrada_luz_exterior_barbacoa", kind: "wall", pos: [-6.79, 2.0, 3.6] },
  { entity: "light.lampara_blanca_exterior", kind: "lamp", pos: [-7.8, 1.5, 7.6] },
  { entity: "light.luz_piscina", kind: "pool", pos: [-1.25, -0.7, 12.5] },
];

/* ------------------------------------------------------------------ */
/* Mobiliario                                                          */
/* ------------------------------------------------------------------ */

export const FURNITURE: Furniture[] = [
  // Cocina, pared oeste: encimera con fregadero solo bajo la ventana (1,8 m); el resto, columnas
  // de suelo a techo (con el frigorífico integrado al sur de la ventana, en `FRIDGE`), e isla
  { at: [-6.1, 2.12], size: [0.6, 0.9, 1.8], tone: "wood", top: "beige" },
  { at: [-6.12, 2.12], size: [0.42, 0.03, 0.62], tone: "steel", lift: 0.9 },
  { at: [-6.33, 2.12], size: [0.04, 0.32, 0.04], tone: "steel", lift: 0.92 },
  { at: [-6.1, 0.56], size: [0.6, 2.6, 1.32], tone: "wood" },
  { at: [-6.1, 4.01], size: [0.6, 2.6, 0.78], tone: "wood" },
  { at: [-6.21, 2.12], size: [0.35, 0.55, 1.8], tone: "wood", lift: 2.05 },
  { at: [-4.21, 1.77], size: [0.98, 0.92, 2.98], tone: "wood", top: "beige" },
  // Salón: mueble bajo de la TV (el sofá, en `SOFA`; la TV, en `TV`)
  { at: [1.03, 1.15], size: [0.3, 0.5, 4.4], tone: "dark" },
  // Lavadero (las baterías y el inversor, en la parte norte, van en `ENERGY`)
  { at: [-6.35, -2.35], size: [0.6, 0.9, 1.6], tone: "light" },
  // Oficina 1: escritorio contra la pared oeste con su pantalla, armario de madera oscura
  { at: [-3.44, -4.2], size: [0.7, 0.75, 1.6], tone: "light" },
  { at: [-3.66, -4.2], size: [0.04, 0.42, 0.72], tone: "screen", lift: 0.86 },
  { at: [-3.64, -4.2], size: [0.06, 0.12, 0.06], tone: "screen", lift: 0.75 },
  { at: [-1.6, -4.05], size: [0.45, 2.2, 3.2], tone: "darkwood" },
  // Oficina 2: escritorio contra la pared oeste con su pantalla, armario blanco
  { at: [-0.92, -4.2], size: [0.7, 0.75, 2.0], tone: "light" },
  { at: [-1.14, -4.2], size: [0.04, 0.42, 0.72], tone: "screen", lift: 0.86 },
  { at: [-1.12, -4.2], size: [0.06, 0.12, 0.06], tone: "screen", lift: 0.75 },
  { at: [0.73, -4.05], size: [0.38, 2.2, 3.2], tone: "white" },
  // Baño 2
  { at: [1.5, -2.95], size: [0.6, 0.85, 0.9], tone: "light" },
  { at: [1.45, -4.1], size: [0.4, 0.45, 0.6], tone: "light" },
  // Dormitorio 3
  { at: [5.08, -4.62], size: [1.4, 0.5, 1.9], tone: "light" },
  { at: [3.2, -4.05], size: [0.55, 2.2, 3.2], tone: "dark" },
  { at: [7.1, -3.3], size: [0.8, 0.75, 1.3], tone: "light" },
  // Dormitorio 2
  { at: [5.57, 0], size: [1.9, 0.5, 1.36], tone: "light" },
  { at: [6.1, 1.85], size: [3.0, 2.2, 0.55], tone: "dark" },
  // Vestidor: armarios en U y frente de cajones
  { at: [4.25, 0.5], size: [0.45, 2.2, 3.2], tone: "white" },
  { at: [3.4, -0.95], size: [1.8, 2.2, 0.45], tone: "white" },
  { at: [3.3, 1.9], size: [1.7, 2.2, 0.4], tone: "white" },
  { at: [1.57, 1.1], size: [0.5, 2.2, 4.4], tone: "white" },
  // Dormitorio 1
  { at: [4.16, 3.13], size: [1.8, 0.5, 1.85], tone: "light" },
  { at: [4.16, 2.36], size: [2.5, 0.9, 0.3], tone: "dark" },
  // Baño 1: ducha al norte (plato y mampara) con salida al exterior, lavabo en la pared este, WC al sur
  { at: [6.81, 2.7], size: [1.7, 0.05, 0.95], tone: "white" },
  { at: [6.5, 3.18], size: [1.1, 2.0, 0.02], tone: "glass" },
  { at: [7.35, 4.0], size: [0.45, 0.85, 1.4], tone: "light" },
  { at: [6.55, 5.35], size: [0.4, 0.45, 0.6], tone: "white" },
];

/* ------------------------------------------------------------------ */
/* Parcela y exteriores                                                */
/* ------------------------------------------------------------------ */

/** Linde de la parcela (sentido horario, empezando por la esquina de la calle a la izquierda). */
export const PLOT: Point[] = [
  [-11.85, -9.53],
  [10.76, -8.66],
  [10.76, 14.82],
  [-9.35, 13.73],
];
/** Valla negra perimetral */
export const FENCE_HEIGHT = 2.0;

/** Punto de la linde de la calle (primer lado de `PLOT`) a la altura `x`. */
export function streetAt(x: number): Point {
  const [[x1, z1], [x2, z2]] = PLOT;
  return [x, z1 + ((x - x1) / (x2 - x1)) * (z2 - z1)];
}

export interface Gate {
  /** `binary_sensor.*` de contacto: `on` = abierta */
  entity: string;
  /** Hueco que cierra la puerta (sobre la linde de la calle) */
  from: Point;
  to: Point;
  /** Recorrido al abrir, en metros a lo largo de la valla (positivo = hacia la derecha del plano) */
  slide: number;
  /** Separación del carril respecto a la valla hacia dentro de la parcela (las puertas van una sobre otra) */
  track: number;
}

/**
 * Puertas correderas de los vehículos, una por coche. Ambas corren hacia la derecha por carriles
 * paralelos: la 1 (la más al oeste) va por el carril de dentro y pasa por detrás del hueco de la 2;
 * la 2 corre por el de fuera y se esconde junto a la valla.
 */
export const GATES: Gate[] = [
  {
    entity: "binary_sensor.sensor_puerta_garaje_1_contact",
    from: streetAt(-11.75),
    to: streetAt(-8.8),
    slide: 2.95,
    track: 0.26,
  },
  {
    entity: "binary_sensor.sensor_puerta_garaje_2_contact",
    from: streetAt(-8.8),
    to: streetAt(-5.95),
    slide: 2.85,
    track: 0.12,
  },
];

/** Puerta peatonal, 1 m al este de las de los vehículos (todavía sin sensor). */
export const PEDESTRIAN_GATE: { from: Point; to: Point } = {
  from: streetAt(-4.95),
  to: streetAt(-3.95),
};

/** Lámina de agua de la piscina (8 × 3 m) y su profundidad */
export const POOL: { rect: Rect; depth: number } = { rect: [-5.24, 9.77, 2.74, 12.79], depth: 1.4 };
/** Coronación de la piscina: 35 cm alrededor del vaso, del mismo material que el suelo de la casa */
export const POOL_COPING = 0.35;
export const POOL_DECK: Rect = [
  POOL.rect[0] - POOL_COPING,
  POOL.rect[1] - POOL_COPING,
  POOL.rect[2] + POOL_COPING,
  POOL.rect[3] + POOL_COPING,
];

/** Porche del salón: mismo suelo que la casa, llega hasta ~1 m de la piscina */
export const PORCH: Rect = [-6.69, 4.63, 1.0, POOL_DECK[1] - 1.0];

/** Zonas pavimentadas (gris): aparcamiento, acceso y paso lateral */
export const PAVING: Rect[] = [
  [-11.4, -9.2, -6.0, -4.3], // aparcamiento (2 coches)
  [-6.0, -8.9, -4.4, -4.19], // acceso a la puerta principal
  [-8.6, -4.19, -7.83, 0.94], // paso junto al lavadero
];

/**
 * Caseta de la depuradora: enterrada (1 × 1 m), asoma 10 cm con césped artificial encima.
 * El indicador muestra si `entity` está encendido y la potencia que consume.
 */
export const PUMP = {
  entity: "switch.interruptor_depuradora",
  power: "sensor.interruptor_depuradora_power_a",
  rect: [-7.7, 10.8, -6.7, 11.8] as Rect,
  height: 0.1,
};

/**
 * Instalación solar en la parte norte del lavadero: baterías apiladas en el suelo e inversor colgado
 * en la pared. Muestra los datos principales de la instalación (Sigenergy en Home Assistant).
 */
export const ENERGY = {
  /** Torre de baterías (centro en planta, tamaño [ancho X, alto Y, fondo Z]) y número de módulos */
  battery: { at: [-7.25, -3.86] as Point, size: [0.7, 1.35, 0.3] as [number, number, number], modules: 3 },
  /** Inversor colgado en la pared norte */
  inverter: { at: [-6.35, -3.93] as Point, size: [0.6, 0.62, 0.2] as [number, number, number], lift: 1.25 },
  sensors: {
    /** Producción de las placas (kW) */
    pv: "sensor.david_lopez_perez_pv_power",
    /** Carga de las baterías (%) y potencia (kW, positiva = cargando) */
    soc: "sensor.david_lopez_perez_battery_state_of_charge",
    battery: "sensor.david_lopez_perez_battery_power",
    /** Consumo de la casa (kW) */
    load: "sensor.david_lopez_perez_load_power",
    /** Intercambio con la red (kW) */
    grid: "sensor.david_lopez_perez_grid_power",
  },
};

/** TV del salón (85"), colgada en la pared este mirando al oeste. */
export const TV = {
  entity: "media_player.salon_tv_samsung_salon_85",
  /** Centro en planta, junto a la pared */
  at: [1.16, 1.15] as Point,
  /** 85" en 16:9 */
  width: 1.88,
  height: 1.06,
  /** Altura del borde inferior */
  lift: 0.95,
};

/** Sofá en U del salón, abierto hacia la TV (este): huella exterior y fondo de asiento. */
export const SOFA = { rect: [-2.23, -0.46, -0.43, 3.51] as Rect, depth: 0.8 };

/** Frigorífico integrado (columna de 60 cm a la izquierda de la ventana) y sus sensores. */
export const FRIDGE = {
  at: [-6.1, 3.32] as Point,
  size: [0.6, 2.6, 0.6] as [number, number, number],
  sensors: {
    fridge: "sensor.cocina_frigo_de_60_temperatura_real_refrigerador",
    fridgeTarget: "number.cocina_frigo_de_60_temperatura_frigorifico",
    freezer: "sensor.cocina_frigo_de_60_temperatura_real_congelador",
    freezerTarget: "number.cocina_frigo_de_60_temperatura_congelador",
    door: "binary_sensor.cocina_frigo_de_60_puerta_abierta_refrigerador",
  },
};

/** Toallero eléctrico a la salida de la ducha: posición en la pared, orientación y su modo. */
export interface TowelRail {
  entity: string;
  /** `input_select` con el modo de funcionamiento (se muestra en su panel) */
  mode?: string;
  /** Centro en planta, pegado a la pared */
  at: Point;
  /** Pared en la que está colgado: el toallero queda paralelo a ella */
  axis: "x" | "z";
}

export const TOWEL_RAILS: TowelRail[] = [
  {
    // Baño 1: pared oeste, junto a la salida de la ducha
    entity: "switch.bano_1_bano_1_luz_toallero_bano_1",
    mode: "input_select.modo_de_toalleros_bano_1",
    at: [6.0, 3.65],
    axis: "z",
  },
  {
    // Baño 2: pared este
    entity: "switch.esp_bano_2_luz_toallero_bano_2",
    mode: "input_select.modo_de_toalleros_bano_2",
    at: [2.8, -3.75],
    axis: "z",
  },
];
