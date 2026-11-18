/**
 * Plano 2D de la casa, calculado una sola vez a partir del plano compartido con House 3D v1
 * (`../house-3d-v1/src/scene/plan.ts`). Todo se dibuja en "píxeles de mundo": 1 m = `PX` px,
 * con el origen en la esquina noroeste de la parcela. El zoom y el desplazamiento los pone
 * después `fv2-plan` con un único `transform` sobre todo el dibujo.
 */
import {
  FURNITURE,
  GATES,
  PAVING,
  PEDESTRIAN_GATE,
  PLOT,
  POOL,
  POOL_DECK,
  PORCH,
  PUMP,
  ROOMS,
  SOFA,
  TV,
  WALLS,
  YARD_FENCE,
  EXTERIOR_THICKNESS,
  INTERIOR_THICKNESS,
  type Point,
  type Rect,
} from "../../../house-3d-v1/src/scene/plan";
import { ROOMS_DEF, type RoomDef } from "../house/rooms";

/** Píxeles de mundo por metro */
export const PX = 24;

const MARGIN = 0.6;
const MIN_X = Math.min(...PLOT.map((p) => p[0])) - MARGIN;
const MIN_Z = Math.min(...PLOT.map((p) => p[1])) - MARGIN;
const MAX_X = Math.max(...PLOT.map((p) => p[0])) + MARGIN;
const MAX_Z = Math.max(...PLOT.map((p) => p[1])) + MARGIN;

export const WORLD_W = Math.round((MAX_X - MIN_X) * PX);
export const WORLD_H = Math.round((MAX_Z - MIN_Z) * PX);

/** Caja en píxeles de mundo */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Punto del plano (metros) → píxeles de mundo. */
export const wx = (x: number) => (x - MIN_X) * PX;
export const wz = (z: number) => (z - MIN_Z) * PX;
export const toWorld = (x: number, z: number): [number, number] => [wx(x), wz(z)];
/** Píxeles de mundo → metros del plano (inversa de `toWorld`). */
export const fromWorld = (px: number, py: number): [number, number] => [px / PX + MIN_X, py / PX + MIN_Z];

const f = (n: number) => n.toFixed(1);

export function boxOfRects(rects: Rect[], pad = 0): Box {
  const x1 = Math.min(...rects.map((r) => Math.min(r[0], r[2]))) - pad;
  const z1 = Math.min(...rects.map((r) => Math.min(r[1], r[3]))) - pad;
  const x2 = Math.max(...rects.map((r) => Math.max(r[0], r[2]))) + pad;
  const z2 = Math.max(...rects.map((r) => Math.max(r[1], r[3]))) + pad;
  return { x: wx(x1), y: wz(z1), w: (x2 - x1) * PX, h: (z2 - z1) * PX };
}

/** Casa y piscina: el encuadre de la vista general. */
export const HOME_BOX = boxOfRects([[-7.9, -5.9, 7.9, 5.9], POOL_DECK], 0.5);

/** Toda la parcela: el encuadre del exterior. */
export const PLOT_BOX: Box = {
  x: wx(MIN_X + MARGIN),
  y: wz(MIN_Z + MARGIN),
  w: (MAX_X - MIN_X - 2 * MARGIN) * PX,
  h: (MAX_Z - MIN_Z - 2 * MARGIN) * PX,
};

/** Caja de una estancia (exterior = parcela entera). */
export function roomBox(room: RoomDef): Box {
  return room.rects.length ? boxOfRects(room.rects, 1) : PLOT_BOX;
}

/** Une varias cajas (para encuadrar una capa con todos sus marcadores). */
export function unionBox(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

const area = ([x1, z1, x2, z2]: Rect) => Math.abs((x2 - x1) * (z2 - z1));

/** Punto del acceso de una estancia en píxeles de mundo (su `anchor` o el centro del rectángulo mayor). */
export function roomAnchor(room: RoomDef): [number, number] {
  if (room.anchor) return toWorld(room.anchor[0], room.anchor[1]);
  if (!room.rects.length) {
    // Exterior: en el césped, entre la casa y la piscina
    const [x1, , x2] = POOL.rect;
    return toWorld((x1 + x2) / 2, POOL.rect[1] - 2.3);
  }
  const [x1, z1, x2, z2] = [...room.rects].sort((a, b) => area(b) - area(a))[0];
  return toWorld((x1 + x2) / 2, (z1 + z2) / 2);
}

/* ------------------------------------------------------------------ */
/* Suelos de las estancias (son la parte dinámica: luz encendida, selección) */
/* ------------------------------------------------------------------ */

export interface Floor {
  room: string;
  rect: Rect;
  kind: "wood" | "tile" | "stone";
}

const same = (a: Rect, b: Rect) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

export const FLOORS: Floor[] = ROOMS_DEF.flatMap((r) =>
  r.rects.map((rect) => ({
    room: r.id,
    rect,
    kind: ROOMS.find((p) => same(p.rect, rect))?.floor ?? "stone",
  })),
);

/* ------------------------------------------------------------------ */
/* Dibujo estático (se genera una vez como cadena SVG)                 */
/* ------------------------------------------------------------------ */

const rect = ([x1, z1, x2, z2]: Rect, cls: string, extra = "") =>
  `<rect class="${cls}" x="${f(wx(Math.min(x1, x2)))}" y="${f(wz(Math.min(z1, z2)))}" width="${f(Math.abs(x2 - x1) * PX)}" height="${f(Math.abs(z2 - z1) * PX)}" ${extra}/>`;

const line = (a: Point, b: Point, cls: string, w?: number) =>
  `<line class="${cls}" x1="${f(wx(a[0]))}" y1="${f(wz(a[1]))}" x2="${f(wx(b[0]))}" y2="${f(wz(b[1]))}"${
    w ? ` stroke-width="${f(w * PX)}"` : ""
  }/>`;

/** Fondo: parcela, pavimentos, porche y piscina (debajo de los suelos). */
export function groundSvg(): string {
  const plot = PLOT.map((p) => `${f(wx(p[0]))},${f(wz(p[1]))}`).join(" ");
  return [
    `<polygon class="p-grass" points="${plot}"/>`,
    ...PAVING.map((r) => rect(r, "p-paving")),
    rect(PORCH, "p-deck"),
    rect(POOL_DECK, "p-deck", 'rx="4"'),
    rect(PUMP.rect, "p-furniture"),
  ].join("");
}

/** Muros (partidos en los huecos), ventanas, muebles, valla y portones (encima de los suelos). */
export function structureSvg(): string {
  const out: string[] = [];

  // Muebles (solo lo que se ve en planta: lo más bajo de 10 cm no se dibuja)
  for (const fu of FURNITURE) {
    const [w, , d] = fu.size;
    if (Math.min(w, d) < 0.1 || fu.lift) continue;
    out.push(
      rect([fu.at[0] - w / 2, fu.at[1] - d / 2, fu.at[0] + w / 2, fu.at[1] + d / 2], "p-furniture", 'rx="2"'),
    );
  }
  // Sofá en U: tres piezas alrededor de la zona de estar, abierto hacia la TV (este)
  {
    const [x1, z1, x2, z2] = SOFA.rect;
    const d = SOFA.depth;
    out.push(rect([x1, z1, x2, z1 + d], "p-furniture", 'rx="3"'));
    out.push(rect([x1, z2 - d, x2, z2], "p-furniture", 'rx="3"'));
    out.push(rect([x1, z1 + d, x1 + d, z2 - d], "p-furniture", 'rx="3"'));
  }
  // TV: una línea oscura contra la pared
  out.push(line([TV.at[0], TV.at[1] - TV.width / 2], [TV.at[0], TV.at[1] + TV.width / 2], "p-tv", 0.08));

  // Muros: cada uno se parte en los huecos de puertas y ventanas
  for (const w of WALLS) {
    const dx = w.to[0] - w.from[0];
    const dz = w.to[1] - w.from[1];
    const len = Math.hypot(dx, dz) || 1;
    const at = (t: number): Point => [w.from[0] + (dx / len) * t, w.from[1] + (dz / len) * t];
    const thick = w.exterior ? EXTERIOR_THICKNESS : INTERIOR_THICKNESS;
    const ops = [...(w.openings ?? [])].sort((a, b) => a.at - b.at);
    let t = 0;
    for (const o of ops) {
      const a = o.at - o.width / 2;
      const b = o.at + o.width / 2;
      if (a > t) out.push(line(at(t), at(a), "p-wall", thick));
      // Ventanas: línea fina azulada; puertas: hueco libre
      if (o.kind === "window") out.push(line(at(a), at(b), "p-window", Math.max(0.06, thick * 0.35)));
      t = b;
    }
    if (t < len) out.push(line(at(t), at(len), "p-wall", thick));
  }

  // Valla de la parcela y del patio del lavadero
  const pts = [...PLOT, PLOT[0]];
  for (let i = 0; i < PLOT.length; i++) out.push(line(pts[i], pts[i + 1], "p-fence", 0.08));
  out.push(line(YARD_FENCE.from, YARD_FENCE.to, "p-fence", 0.08));
  for (const g of GATES) out.push(line(g.from, g.to, "p-gate", 0.16));
  out.push(line(PEDESTRIAN_GATE.from, PEDESTRIAN_GATE.to, "p-gate", 0.16));
  return out.join("");
}

/** Rosa de los vientos: el norte real está girado respecto al "arriba" del plano. */
export { NORTH_ANGLE } from "../../../house-3d-v1/src/scene/plan";
