/**
 * Maqueta isométrica de la casa (imagen provisional hasta tener las fotos/renders reales).
 *
 * Se genera una sola vez como SVG a partir del plano compartido con House 3D v1: parcela,
 * piscina, suelos, muros cortados a media altura (efecto "casa de muñecas"), muebles y árboles.
 * Los colores salen de variables CSS (`--iso-*`, `--t-*`), así que cambia con el tema sin
 * regenerarse. Cada estancia lleva un polígono de "brillo" cuya opacidad se controla con
 * `--glow-<id>` para que las estancias con luces encendidas se iluminen en la vista general.
 * Los materiales (tarima, baldosa, piedra, césped, veta…) y las sombras salen de `materials.ts`.
 */
import {
  EXTERIOR_THICKNESS,
  FOOTPRINT,
  FRIDGE,
  FURNITURE,
  INTERIOR_THICKNESS,
  PAVING,
  PLOT,
  POOL,
  POOL_DECK,
  PORCH,
  PUMP,
  ROOMS,
  SOFA,
  TV,
  ENERGY,
  WALLS,
  type FurnitureTone,
  type Rect,
} from "../../../house-3d-v1/src/scene/plan";
import { ROOMS_DEF } from "./rooms";
import { materialCss, materialDefs, type PlanMatrix } from "./materials";

/** Unidades SVG por metro */
const S = 42;
/** Giro de la cámara en planta y elevación (grados) */
const THETA = (24 * Math.PI) / 180;
const PHI = (54 * Math.PI) / 180;
/** Altura a la que se "cortan" los muros para ver el interior */
export const CUT = 1.15;

const cosT = Math.cos(THETA);
const sinT = Math.sin(THETA);
const sinP = Math.sin(PHI);
const cosP = Math.cos(PHI);

type P2 = [number, number];

const rawProject = (x: number, y: number, z: number): P2 => {
  const u = x * cosT + z * sinT;
  const v = -x * sinT + z * cosT;
  return [u * S, (v * sinP - y * cosP) * S];
};
/** Profundidad (mayor = más cerca del observador) */
const depth = (x: number, z: number) => -x * sinT + z * cosT;

/* ---------- Encuadre de la imagen ---------- */

const MARGIN = 30;
/** Árboles del jardín (de momento no hay ninguno plantado). */
export const TREES: [x: number, z: number, r: number][] = [];
const TREE_H = 2.3;

const extentPts: P2[] = [
  ...PLOT.map(([x, z]) => rawProject(x, 0, z)),
  ...TREES.map(([x, z, r]) => {
    const [px, py] = rawProject(x, TREE_H, z);
    return [px, py - r * S] as P2;
  }),
];
const minX = Math.min(...extentPts.map((p) => p[0])) - MARGIN;
const minY = Math.min(...extentPts.map((p) => p[1])) - MARGIN;
const maxX = Math.max(...extentPts.map((p) => p[0])) + MARGIN;
const maxY = Math.max(...extentPts.map((p) => p[1])) + MARGIN;

export const ISO_WIDTH = Math.ceil(maxX - minX);
export const ISO_HEIGHT = Math.ceil(maxY - minY);

/** Matriz que proyecta el suelo del plano (x, z en metros) sobre la maqueta: base de los materiales. */
const PLAN_MATRIX: PlanMatrix = [S * cosT, -S * sinT * sinP, S * sinT, S * cosT * sinP, -minX, -minY];

/**
 * Colocación de la capa de agua: un rectángulo de `width` × `height` px (1 px = 1 cm) y la matriz
 * CSS que lo lleva sobre el vaso de la piscina en la maqueta.
 */
export function poolLayer(): { width: number; height: number; matrix: string } {
  const [x1, z1, x2, z2] = POOL.rect;
  const [a, b, c, d, e, f] = PLAN_MATRIX;
  const k = 0.01;
  const m = [a * k, b * k, c * k, d * k, e + a * x1 + c * z1, f + b * x1 + d * z1];
  return {
    width: Math.round((x2 - x1) * 100),
    height: Math.round((z2 - z1) * 100),
    matrix: `matrix(${m.map((n) => n.toFixed(5)).join(",")})`,
  };
}

/** Proyección del plano (metros) a coordenadas de la imagen SVG. */
export function project(x: number, y: number, z: number): P2 {
  const [px, py] = rawProject(x, y, z);
  return [px - minX, py - minY];
}

export interface Box2 {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boundsOf(points: P2[]): Box2 {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const rectCorners = ([x1, z1, x2, z2]: Rect, y: number): P2[] => [
  project(x1, y, z1),
  project(x2, y, z1),
  project(x2, y, z2),
  project(x1, y, z2),
];

/** Encuadre de la vista general: la casa y la piscina. */
export function homeBounds(): Box2 {
  return boundsOf([
    ...FOOTPRINT.flatMap((r) => [...rectCorners(r, 0), ...rectCorners(r, CUT)]),
    ...rectCorners(POOL_DECK, 0),
  ]);
}

/** Encuadre de una estancia (o de la piscina y el porche para el exterior). */
export function roomBounds(id: string): Box2 {
  const room = ROOMS_DEF.find((r) => r.id === id);
  if (!room || room.rects.length === 0) {
    return boundsOf([...rectCorners(PORCH, 0), ...rectCorners(POOL_DECK, 0), ...rectCorners(PUMP.rect, 0)]);
  }
  return boundsOf(room.rects.flatMap((r) => [...rectCorners(r, 0), ...rectCorners(r, CUT)]));
}

/** Punto de acceso de cada estancia sobre la maqueta (centro del suelo, algo elevado). */
export function roomAnchor(id: string): P2 {
  const room = ROOMS_DEF.find((r) => r.id === id);
  if (!room || room.rects.length === 0) {
    const [x1, z1, x2, z2] = POOL.rect;
    return project((x1 + x2) / 2, 0.3, (z1 + z2) / 2);
  }
  // El rectángulo más grande manda (la cocina tiene un trozo junto al lavadero)
  const [x1, z1, x2, z2] = [...room.rects].sort((a, b) => area(b) - area(a))[0];
  return project((x1 + x2) / 2, 0.5, (z1 + z2) / 2);
}

const area = ([x1, z1, x2, z2]: Rect) => Math.abs((x2 - x1) * (z2 - z1));

/** Posición de una luminaria sobre la maqueta (las de techo flotan justo sobre el corte del muro). */
export function lampPoint(pos: [number, number, number]): P2 {
  const [x, y, z] = pos;
  return project(x, Math.min(y, CUT + 0.35), z);
}

/* ---------- Generación del SVG ---------- */

const poly = (pts: P2[], cls: string, extra = "") =>
  `<polygon class="${cls}" points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}"${extra}/>`;

interface Item {
  d: number;
  svg: string;
}

/** Dirección de las sombras sobre el suelo por metro de altura (sol del noroeste). */
const SUN: [dx: number, dz: number] = [0.5, 0.4];
let shadows: string[] = [];

/** Sombra arrojada al suelo por una caja del plano entre las alturas `y0` y `y1`. */
function castShadow(x1: number, z1: number, x2: number, z2: number, y0: number, y1: number): void {
  const [dx, dz] = SUN;
  const a = (x: number, z: number) => project(x + dx * y0, 0, z + dz * y0);
  const b = (x: number, z: number) => project(x + dx * y1, 0, z + dz * y1);
  shadows.push(poly([a(x1, z1), a(x2, z1), b(x2, z1), b(x2, z2), b(x1, z2), a(x1, z2)], ""));
}

/** Caja alineada con los ejes del plano: tapa y las dos caras visibles (oeste y sur). */
function box(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y0: number,
  y1: number,
  tone: string,
  top = tone,
): Item {
  const faces = [
    poly([project(x1, y0, z1), project(x1, y0, z2), project(x1, y1, z2), project(x1, y1, z1)], `${tone} w`),
    poly([project(x1, y0, z2), project(x2, y0, z2), project(x2, y1, z2), project(x1, y1, z2)], `${tone} s`),
    poly(rectCorners([x1, z1, x2, z2], y1), `${top} t`),
  ];
  return { d: depth((x1 + x2) / 2, (z1 + z2) / 2), svg: faces.join("") };
}

/** Trozos de muro (cortados a `CUT`) con los huecos de puertas y ventanas. */
function wallItems(): Item[] {
  const items: Item[] = [];
  for (const wall of WALLS) {
    const [ax, az] = wall.from;
    const [bx, bz] = wall.to;
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const t = wall.exterior ? EXTERIOR_THICKNESS : INTERIOR_THICKNESS;
    const ext = wall.exterior ? t / 2 : 0;

    const piece = (u0: number, u1: number, y0: number, y1: number, cls: string) => {
      if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
      // Trozos cortos para que el orden de pintado sea correcto
      const n = Math.max(1, Math.ceil((u1 - u0) / 0.45));
      for (let i = 0; i < n; i++) {
        const a = u0 + ((u1 - u0) * i) / n;
        const b = u0 + ((u1 - u0) * (i + 1)) / n;
        const p = [ax + ux * a, az + uz * a, ax + ux * b, az + uz * b];
        const horizontal = Math.abs(uz) < 0.5;
        const r: Rect = horizontal
          ? [Math.min(p[0], p[2]), p[1] - t / 2, Math.max(p[0], p[2]), p[1] + t / 2]
          : [p[0] - t / 2, Math.min(p[1], p[3]), p[0] + t / 2, Math.max(p[1], p[3])];
        items.push(box(r[0], r[1], r[2], r[3], y0, y1, cls, cls === "glass" ? "glass" : "cap"));
        if (cls === "wall") castShadow(r[0], r[1], r[2], r[3], y0, y1);
      }
    };

    const openings = [...(wall.openings ?? [])].sort((a, b) => a.at - b.at);
    let cursor = -ext;
    for (const o of openings) {
      const a = o.at - o.width / 2;
      const b = o.at + o.width / 2;
      piece(cursor, a, 0, CUT, "wall");
      if (o.kind === "window") {
        piece(a, b, 0, Math.min(o.sill, CUT), "wall");
        if (o.sill < CUT) piece(a, b, o.sill, CUT, "glass");
      }
      cursor = b;
    }
    piece(cursor, len + ext, 0, CUT, "wall");
  }
  return items;
}

const TONE_CLASS: Record<FurnitureTone, string> = {
  dark: "t-dark",
  light: "t-light",
  accent: "t-accent",
  white: "t-white",
  wood: "t-wood",
  darkwood: "t-darkwood",
  beige: "t-beige",
  sofa: "t-sofa",
  screen: "t-screen",
  steel: "t-steel",
  glass: "t-glass",
};

/**
 * Cama: base, colchón, edredón (hacia los pies) y dos almohadas. El cabecero va en el lado de
 * la cama más pegado a una pared de su estancia.
 */
function bedItems([x1, z1, x2, z2]: Rect, top: number, tone: string): Item[] {
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  const room = ROOMS.find(({ rect: [a, b, c, d] }) => cx > a && cx < c && cz > b && cz < d)?.rect;
  const gaps = room
    ? { n: z1 - room[1], s: room[3] - z2, w: x1 - room[0], e: room[2] - x2 }
    : { n: 0, s: 1, w: 1, e: 1 };
  const head = (Object.entries(gaps) as [keyof typeof gaps, number][]).sort((a, b) => a[1] - b[1])[0][0];
  const base = top - 0.22;
  const out: Item[] = [box(x1, z1, x2, z2, 0, base, tone), box(x1, z1, x2, z2, base, top, "t-bed")];
  // Edredón: 70 % de la cama desde los pies, un poco más alto que el colchón
  const k = 0.32;
  const duvet: Rect =
    head === "n"
      ? [x1, z1 + (z2 - z1) * k, x2, z2]
      : head === "s"
        ? [x1, z1, x2, z2 - (z2 - z1) * k]
        : head === "w"
          ? [x1 + (x2 - x1) * k, z1, x2, z2]
          : [x1, z1, x2 - (x2 - x1) * k, z2];
  out.push(box(duvet[0] - 0.02, duvet[1] - 0.02, duvet[2] + 0.02, duvet[3] + 0.02, base, top + 0.05, "duvet"));
  // Almohadas
  const along = head === "n" || head === "s";
  const span = along ? x2 - x1 : z2 - z1;
  const pw = Math.min(0.7, span / 2 - 0.08);
  for (const side of [-1, 1]) {
    const c = (along ? cx : cz) + side * (pw / 2 + 0.04);
    const p0 = c - pw / 2;
    const p1 = c + pw / 2;
    const d0 = 0.08;
    const d1 = 0.42;
    const r: Rect =
      head === "n"
        ? [p0, z1 + d0, p1, z1 + d1]
        : head === "s"
          ? [p0, z2 - d1, p1, z2 - d0]
          : head === "w"
            ? [x1 + d0, p0, x1 + d1, p1]
            : [x2 - d1, p0, x2 - d0, p1];
    out.push(box(r[0], r[1], r[2], r[3], top, top + 0.12, "pillow"));
  }
  return out;
}

function furnitureItems(): Item[] {
  const items: Item[] = [];
  for (const f of FURNITURE) {
    const [cx, cz] = f.at;
    const [w, h, d] = f.size;
    const lift = f.lift ?? 0;
    if (lift >= CUT) continue; // lo colgado por encima del corte no se ve
    const y1 = Math.min(lift + h, CUT + 0.15);
    const tone = TONE_CLASS[f.tone ?? "light"];
    const r: Rect = [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2];
    if (f.tone !== "glass" && f.tone !== "screen") castShadow(r[0], r[1], r[2], r[3], lift, y1);
    if (!f.top && h <= 0.55 && w > 1.3 && d > 1.3) {
      items.push(...bedItems(r, y1, tone));
      continue;
    }
    items.push(box(r[0], r[1], r[2], r[3], lift, y1, tone, f.top ? TONE_CLASS[f.top] : tone));
  }
  // Sofá en U abierto hacia la TV (este)
  const [sx1, sz1, sx2, sz2] = SOFA.rect;
  const dd = SOFA.depth;
  const back = 0.2;
  castShadow(sx1, sz1, sx1 + dd, sz2, 0, 0.75);
  castShadow(sx1 + dd, sz1, sx2, sz1 + dd, 0, 0.75);
  castShadow(sx1 + dd, sz2 - dd, sx2, sz2, 0, 0.75);
  // Respaldos por el lado exterior de la U
  items.push(box(sx1, sz1, sx1 + back, sz2, 0, 0.78, "t-sofa"));
  items.push(box(sx1 + back, sz1, sx2, sz1 + back, 0, 0.78, "t-sofa"));
  items.push(box(sx1 + back, sz2 - back, sx2, sz2, 0, 0.78, "t-sofa"));
  // Asientos con cojines (unos 0,9 m cada uno)
  const seat = (x1: number, z1: number, x2: number, z2: number, alongX: boolean) => {
    const len = alongX ? x2 - x1 : z2 - z1;
    const n = Math.max(1, Math.round(len / 0.9));
    for (let i = 0; i < n; i++) {
      const a = (len * i) / n + 0.02;
      const b = (len * (i + 1)) / n - 0.02;
      items.push(
        alongX
          ? box(x1 + a, z1, x1 + b, z2, 0, 0.44, "cushion")
          : box(x1, z1 + a, x2, z1 + b, 0, 0.44, "cushion"),
      );
    }
  };
  seat(sx1 + back, sz1 + back, sx1 + dd, sz2 - back, false);
  seat(sx1 + dd, sz1 + back, sx2, sz1 + dd, true);
  seat(sx1 + dd, sz2 - dd, sx2, sz2 - back, true);
  // Mesa de centro
  items.push(box(sx1 + dd + 0.35, sz1 + dd + 0.6, sx2 - 0.25, sz2 - dd - 0.6, 0, 0.38, "t-wood"));
  castShadow(sx1 + dd + 0.35, sz1 + dd + 0.6, sx2 - 0.25, sz2 - dd - 0.6, 0, 0.38);
  // Frigorífico, baterías y TV (fina, en la pared este)
  const [fx, fz] = FRIDGE.at;
  items.push(box(fx - 0.3, fz - 0.3, fx + 0.3, fz + 0.3, 0, CUT + 0.15, "t-wood"));
  castShadow(fx - 0.3, fz - 0.3, fx + 0.3, fz + 0.3, 0, CUT + 0.15);
  const [bx, bz] = ENERGY.battery.at;
  const [bw, bh, bd] = ENERGY.battery.size;
  items.push(box(bx - bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2, 0, Math.min(bh, CUT), "t-white"));
  castShadow(bx - bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2, 0, Math.min(bh, CUT));
  const [tx, tz] = TV.at;
  items.push(box(tx - 0.03, tz - TV.width / 2, tx + 0.03, tz + TV.width / 2, 0.55, CUT + 0.1, "t-screen"));
  // Caseta de la depuradora
  const [px1, pz1, px2, pz2] = PUMP.rect;
  items.push(box(px1, pz1, px2, pz2, 0, PUMP.height, "grass2", "grass2"));
  castShadow(px1, pz1, px2, pz2, 0, PUMP.height);
  return items;
}

function treeItems(): Item[] {
  return TREES.map(([x, z, r]) => {
    const [gx, gy] = project(x, 0, z);
    const [tx, ty] = project(x, TREE_H, z);
    const R = r * S;
    // Sombra de la copa en el suelo, desplazada como el resto de sombras
    const [sx, sy] = project(x + SUN[0] * TREE_H, 0, z + SUN[1] * TREE_H);
    shadows.push(
      `<ellipse cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" rx="${(R * 0.95).toFixed(1)}" ry="${(R * 0.95 * sinP).toFixed(1)}"/>`,
    );
    // Copa en varios grupos de hojas, con luz desde arriba a la izquierda
    const clumps: [dx: number, dy: number, k: number][] = [
      [0, 0, 1],
      [-0.42, 0.18, 0.62],
      [0.45, 0.12, 0.6],
      [0.05, -0.42, 0.58],
      [-0.2, -0.25, 0.5],
    ];
    const svg =
      `<rect class="trunk" x="${(gx - 3).toFixed(1)}" y="${ty.toFixed(1)}" width="6" height="${(gy - ty).toFixed(1)}" rx="3"/>` +
      clumps
        .map(
          ([dx, dy, k]) =>
            `<circle class="tree" cx="${(tx + dx * R).toFixed(1)}" cy="${(ty + dy * R).toFixed(1)}" r="${(R * k).toFixed(1)}"/>`,
        )
        .join("");
    return { d: depth(x, z), svg };
  });
}

let cached: string | undefined;

/** SVG completo de la maqueta (contenido interior, sin la etiqueta <svg>). */
export function isoSvg(): string {
  if (cached) return cached;
  shadows = [];
  const out: string[] = [];
  out.push(
    `<defs>${materialDefs(PLAN_MATRIX)}
      <linearGradient id="fv1-water" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--iso-water)"/><stop offset="1" stop-color="var(--iso-water-2)"/>
      </linearGradient>
      <radialGradient id="fv1-glow">
        <stop offset="0" stop-color="var(--iso-light)" stop-opacity="0.95"/>
        <stop offset="1" stop-color="var(--iso-light)" stop-opacity="0.25"/>
      </radialGradient>
    </defs>`,
  );
  // Terreno
  const plot = PLOT.map(([x, z]) => project(x, 0, z));
  out.push(poly(plot, "grass"), poly(plot, "noise"));
  for (const r of PAVING) out.push(poly(rectCorners(r, 0), "paving"));
  out.push(poly(rectCorners(PORCH, 0), "porch"));
  // Piscina
  out.push(poly(rectCorners(POOL_DECK, 0), "porch"));
  out.push(poly(rectCorners(POOL.rect, 0), "water", ` fill="url(#fv1-water)"`));
  const [wx1, wz1, wx2, wz2] = POOL.rect;
  // Algo más de profundidad junto a los bordes del norte y del oeste (las cáusticas van aparte)
  out.push(poly(rectCorners([wx1, wz1, wx2, wz1 + 0.35], 0), "water-edge"));
  out.push(poly(rectCorners([wx1, wz1 + 0.35, wx1 + 0.3, wz2], 0), "water-edge"));
  out.push(
    poly(
      [project(wx1, 0, wz1), project(wx2, 0, wz1), project(wx2, -0.5, wz1), project(wx1, -0.5, wz1)],
      "water-wall",
    ),
  );
  out.push(
    poly(
      rectCorners([wx1 + 0.4, wz1 + 0.3, wx2 - 0.4, wz2 - 0.3], 0),
      "pool-glow",
      ` style="opacity:var(--glow-pool,0)"`,
    ),
  );
  // Valla baja (solo la línea, para no tapar el jardín)
  out.push(
    `<polygon class="fence" points="${PLOT.map(([x, z]) =>
      project(x, 0, z)
        .map((n) => n.toFixed(1))
        .join(","),
    ).join(" ")}"/>`,
  );
  // Suelos y brillo de las estancias
  for (const r of ROOMS) out.push(poly(rectCorners(r.rect, 0), `floor-${r.floor}`));
  // Muros, muebles y árboles (se calculan antes para tener sus sombras)
  const items = [...wallItems(), ...furnitureItems(), ...treeItems()].sort((a, b) => a.d - b.d);
  // Sombras suaves de una sola capa (sin oscurecerse donde se solapan) y oclusión en los rincones
  const ao = ROOMS.map((r) => poly(rectCorners(r.rect, 0), "ao")).join("");
  out.push(`<g class="cast" filter="url(#fv1-m-soft)">${ao}${shadows.join("")}</g>`);
  for (const room of ROOMS_DEF) {
    for (const r of room.rects)
      out.push(poly(rectCorners(r, 0.01), "glow", ` style="opacity:var(--glow-${room.id},0)"`));
  }
  // Muros, muebles y árboles, de atrás hacia delante
  for (const it of items) out.push(it.svg);
  // Grano fino por encima de todo para que la maqueta parezca menos "plana"
  out.push(poly(plot, "grain"));
  cached = out.join("");
  return cached;
}

/** Estilos de la maqueta (los tonos con sus caras laterales sombreadas). */
export function isoCss(): string {
  const tones: [cls: string, v: string][] = [
    ["wall", "--iso-wall"],
    ["grass2", "--iso-grass-2"],
    ...Object.values(TONE_CLASS).map((c): [string, string] => [c, `--${c}`]),
    ["t-bed", "--t-bed"],
  ];
  const rules = tones.map(
    ([c, v]) =>
      `.iso .${c}{fill:var(${v});stroke:var(${v})}.iso .${c}.w{fill:color-mix(in srgb,var(${v}) 84%,#3a2a1a);stroke:color-mix(in srgb,var(${v}) 84%,#3a2a1a)}.iso .${c}.s{fill:color-mix(in srgb,var(${v}) 72%,#3a2a1a);stroke:color-mix(in srgb,var(${v}) 72%,#3a2a1a)}`,
  );
  return `
    .iso .shadow{fill:var(--iso-shadow)}
    .iso .water-wall{fill:var(--iso-water-2);opacity:.8}
    .iso .pool-glow{fill:url(#fv1-glow);transition:opacity 1.2s ease}
    .iso .fence{fill:none;stroke:var(--iso-fence);stroke-width:2.5;stroke-linejoin:round}
    .iso .glow{fill:url(#fv1-glow);transition:opacity 1.2s ease;mix-blend-mode:var(--iso-glow-blend)}
    .iso .cap.t{fill:var(--iso-wall-cap);stroke:var(--iso-wall-cap)}
    .iso .w,.iso .s,.iso .t{stroke-width:.7;stroke-linejoin:round}
    .iso .glass{stroke:none}
    .iso .glass{fill:var(--iso-glass)}
    .iso .glass.t{fill:var(--iso-glass)}
    .iso .trunk{fill:var(--t-darkwood)}
    ${rules.join("")}
    ${materialCss()}
  `;
}
