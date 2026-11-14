/**
 * Maqueta isométrica de la casa (imagen provisional hasta tener las fotos/renders reales).
 *
 * Se genera una sola vez como SVG a partir del plano compartido con House 3D v1: parcela,
 * piscina, suelos, muros cortados a media altura (efecto "casa de muñecas"), muebles y árboles.
 * Los colores salen de variables CSS (`--iso-*`, `--t-*`), así que cambia con el tema sin
 * regenerarse. Cada estancia lleva un polígono de "brillo" cuya opacidad se controla con
 * `--glow-<id>` para que las estancias con luces encendidas se iluminen en la vista general.
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
const TREES: [x: number, z: number, r: number][] = [
  [-10.2, 1.8, 1.25],
  [-9.6, 7.6, 1.05],
  [9.2, 8.4, 1.3],
  [9.6, 12.6, 0.95],
  [5.8, 13.3, 0.85],
  [-8.6, 12.4, 1.0],
  [9.4, -6.6, 1.1],
  [-10.6, -2.6, 0.8],
  [4.6, 8.6, 0.7],
];
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

function furnitureItems(): Item[] {
  const items: Item[] = [];
  for (const f of FURNITURE) {
    const [cx, cz] = f.at;
    const [w, h, d] = f.size;
    const lift = f.lift ?? 0;
    if (lift >= CUT) continue; // lo colgado por encima del corte no se ve
    const y1 = Math.min(lift + h, CUT + 0.15);
    const tone = TONE_CLASS[f.tone ?? "light"];
    // Camas: base clara con colchón blanco
    const top = f.top ? TONE_CLASS[f.top] : h <= 0.55 && w > 1.3 && d > 1.3 ? "t-bed" : tone;
    items.push(box(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, lift, y1, tone, top));
  }
  // Sofá en U abierto hacia la TV (este)
  const [sx1, sz1, sx2, sz2] = SOFA.rect;
  const dd = SOFA.depth;
  items.push(box(sx1, sz1, sx1 + dd, sz2, 0, 0.75, "t-sofa"));
  items.push(box(sx1 + dd, sz1, sx2, sz1 + dd, 0, 0.75, "t-sofa"));
  items.push(box(sx1 + dd, sz2 - dd, sx2, sz2, 0, 0.75, "t-sofa"));
  // Mesa de centro
  items.push(box(sx1 + dd + 0.35, sz1 + dd + 0.6, sx2 - 0.25, sz2 - dd - 0.6, 0, 0.38, "t-wood"));
  // Frigorífico, baterías y TV (fina, en la pared este)
  const [fx, fz] = FRIDGE.at;
  items.push(box(fx - 0.3, fz - 0.3, fx + 0.3, fz + 0.3, 0, CUT + 0.15, "t-wood"));
  const [bx, bz] = ENERGY.battery.at;
  const [bw, bh, bd] = ENERGY.battery.size;
  items.push(box(bx - bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2, 0, Math.min(bh, CUT), "t-white"));
  const [tx, tz] = TV.at;
  items.push(box(tx - 0.03, tz - TV.width / 2, tx + 0.03, tz + TV.width / 2, 0.55, CUT + 0.1, "t-screen"));
  // Caseta de la depuradora
  const [px1, pz1, px2, pz2] = PUMP.rect;
  items.push(box(px1, pz1, px2, pz2, 0, PUMP.height, "grass2", "grass2"));
  return items;
}

function treeItems(): Item[] {
  return TREES.map(([x, z, r]) => {
    const [gx, gy] = project(x, 0, z);
    const [tx, ty] = project(x, TREE_H, z);
    const R = r * S;
    const svg =
      `<ellipse class="shadow" cx="${(gx + R * 0.35).toFixed(1)}" cy="${(gy + R * 0.15).toFixed(1)}" rx="${(R * 0.95).toFixed(1)}" ry="${(R * 0.95 * sinP).toFixed(1)}"/>` +
      `<rect class="trunk" x="${(gx - 3).toFixed(1)}" y="${ty.toFixed(1)}" width="6" height="${(gy - ty).toFixed(1)}" rx="3"/>` +
      `<circle class="tree" cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${R.toFixed(1)}"/>` +
      `<circle class="tree-hi" cx="${(tx - R * 0.28).toFixed(1)}" cy="${(ty - R * 0.3).toFixed(1)}" r="${(R * 0.55).toFixed(1)}"/>`;
    return { d: depth(x, z), svg };
  });
}

let cached: string | undefined;

/** SVG completo de la maqueta (contenido interior, sin la etiqueta <svg>). */
export function isoSvg(): string {
  if (cached) return cached;
  const out: string[] = [];
  out.push(
    `<defs>
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
  out.push(
    poly(
      PLOT.map(([x, z]) => project(x, 0, z)),
      "grass",
    ),
  );
  for (const r of PAVING) out.push(poly(rectCorners(r, 0), "paving"));
  out.push(poly(rectCorners(PORCH, 0), "porch"));
  // Sombra de la casa (sol del noroeste)
  for (const [x1, z1, x2, z2] of FOOTPRINT)
    out.push(poly(rectCorners([x1 + 0.7, z1 + 0.6, x2 + 0.7, z2 + 0.6], 0), "shadow"));
  // Piscina
  out.push(poly(rectCorners(POOL_DECK, 0), "porch"));
  out.push(poly(rectCorners(POOL.rect, 0), "water", ` fill="url(#fv1-water)"`));
  const [wx1, wz1, wx2, wz2] = POOL.rect;
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
  for (const room of ROOMS_DEF) {
    for (const r of room.rects)
      out.push(poly(rectCorners(r, 0.01), "glow", ` style="opacity:var(--glow-${room.id},0)"`));
  }
  // Muros, muebles y árboles, de atrás hacia delante
  const items = [...wallItems(), ...furnitureItems(), ...treeItems()].sort((a, b) => a.d - b.d);
  for (const it of items) out.push(it.svg);
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
      `.iso .${c}{fill:var(${v})}.iso .${c}.w{fill:color-mix(in srgb,var(${v}) 84%,#3a2a1a)}.iso .${c}.s{fill:color-mix(in srgb,var(${v}) 72%,#3a2a1a)}`,
  );
  return `
    .iso .grass{fill:var(--iso-grass)}
    .iso .paving{fill:var(--iso-paving)}
    .iso .porch{fill:var(--iso-porch)}
    .iso .shadow{fill:var(--iso-shadow)}
    .iso .water-wall{fill:var(--iso-water-2);opacity:.8}
    .iso .pool-glow{fill:url(#fv1-glow);transition:opacity 1.2s ease}
    .iso .fence{fill:none;stroke:var(--iso-fence);stroke-width:2.5;stroke-linejoin:round}
    .iso .floor-wood{fill:var(--iso-wood)}
    .iso .floor-tile{fill:var(--iso-tile)}
    .iso .floor-stone{fill:var(--iso-stone)}
    .iso .glow{fill:url(#fv1-glow);transition:opacity 1.2s ease;mix-blend-mode:normal}
    .iso .cap.t{fill:var(--iso-wall-cap)}
    .iso .glass{fill:var(--iso-glass)}
    .iso .glass.t{fill:var(--iso-glass)}
    .iso .tree{fill:var(--iso-tree)}
    .iso .tree-hi{fill:#fff;opacity:.12}
    .iso .trunk{fill:var(--t-darkwood)}
    ${rules.join("")}
  `;
}
