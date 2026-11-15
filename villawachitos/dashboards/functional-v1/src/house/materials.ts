/**
 * Materiales de la maqueta isométrica: tarima, baldosa, piedra, adoquín, césped segado,
 * agua con cáusticas en movimiento, veta de madera en los muebles y grano fotográfico.
 *
 * Los patrones se dibujan en metros sobre el plano y se proyectan con la misma matriz que la
 * maqueta (`patternTransform`), así que las tablas y juntas siguen los ejes de la casa.
 * Los colores salen de las variables del tema mediante clases, de modo que el modo claro y
 * oscuro siguen funcionando sin regenerar el SVG.
 */

/** Matriz SVG que lleva un punto del plano (x, z) en metros al punto de la maqueta. */
export type PlanMatrix = [a: number, b: number, c: number, d: number, e: number, f: number];

const f3 = (n: number) => +n.toFixed(4);

/** Tablas, juntas y vetas del parqué (tablas de 1,2 × 0,2 m al tresbolillo). */
function woodTile(): string {
  const out: string[] = [];
  const offsets = [0, 0.6, 0.3, 0.9];
  const tones = [
    ["mw-a", "mw-b"],
    ["mw-c", "mw-a"],
    ["mw-b", "mw-c"],
    ["mw-a", "mw-c"],
  ];
  offsets.forEach((o, k) => {
    const y = k * 0.2;
    for (let i = 0; i < 3; i++) {
      const x = o - 1.2 + i * 1.2;
      out.push(`<rect class="${tones[k][i % 2]}" x="${f3(x)}" y="${f3(y)}" width="1.2" height="0.2"/>`);
      // Vetas finas a lo largo de la tabla
      const g = (k * 3 + (i % 2)) % 3;
      for (let j = 0; j < 2; j++) {
        const gy = y + 0.05 + j * 0.08 + g * 0.012;
        out.push(
          `<path class="mw-grain" d="M${f3(x + 0.05)} ${f3(gy)} C${f3(x + 0.4)} ${f3(gy - 0.02)} ${f3(x + 0.7)} ${f3(gy + 0.025)} ${f3(x + 1.15)} ${f3(gy)}"/>`,
        );
      }
      out.push(`<line class="mw-joint" x1="${f3(x)}" y1="${f3(y)}" x2="${f3(x)}" y2="${f3(y + 0.2)}"/>`);
    }
    out.push(`<line class="mw-joint" x1="0" y1="${f3(y)}" x2="2.4" y2="${f3(y)}"/>`);
  });
  return out.join("");
}

/** Losas al tresbolillo (piedra del porche, adoquín del aparcamiento). */
function slabTile(w: number, h: number, cls: string): string {
  const out: string[] = [];
  const tones = [`${cls}-a`, `${cls}-b`, `${cls}-c`];
  // Fila 0: dos losas; fila 1: desplazada media losa (la primera y la última son la misma al repetir)
  out.push(`<rect class="${tones[0]}" x="0" y="0" width="${w}" height="${h}"/>`);
  out.push(`<rect class="${tones[1]}" x="${w}" y="0" width="${w}" height="${h}"/>`);
  out.push(`<rect class="${tones[2]}" x="${-w / 2}" y="${h}" width="${w}" height="${h}"/>`);
  out.push(`<rect class="${tones[0]}" x="${w / 2}" y="${h}" width="${w}" height="${h}"/>`);
  out.push(`<rect class="${tones[2]}" x="${(3 * w) / 2}" y="${h}" width="${w}" height="${h}"/>`);
  const j = `${cls}-joint`;
  out.push(`<line class="${j}" x1="0" y1="0" x2="${2 * w}" y2="0"/>`);
  out.push(`<line class="${j}" x1="0" y1="${h}" x2="${2 * w}" y2="${h}"/>`);
  for (const x of [0, w]) out.push(`<line class="${j}" x1="${x}" y1="0" x2="${x}" y2="${h}"/>`);
  for (const x of [w / 2, (3 * w) / 2])
    out.push(`<line class="${j}" x1="${x}" y1="${h}" x2="${x}" y2="${2 * h}"/>`);
  return out.join("");
}

/** Baldosa de 60 × 60 con ligeras variaciones de tono y llaga clara. */
function tileTile(): string {
  return (
    `<rect class="mt-a" x="0" y="0" width="0.6" height="0.6"/>` +
    `<rect class="mt-b" x="0.6" y="0" width="0.6" height="0.6"/>` +
    `<rect class="mt-b" x="0" y="0.6" width="0.6" height="0.6"/>` +
    `<rect class="mt-a" x="0.6" y="0.6" width="0.6" height="0.6"/>` +
    `<path class="mt-joint" d="M0 0H1.2M0 0.6H1.2M0 0V1.2M0.6 0V1.2"/>`
  );
}

/** Red de cáusticas (líneas onduladas que se cruzan), repetible en `size` metros. */
function causticTile(size: number, seed: number): string {
  const out: string[] = [];
  const n = 4;
  const step = size / n;
  for (let i = 0; i < n; i++) {
    const o = step * i + ((seed * 0.37 + i * 0.21) % 1) * step * 0.5;
    const a = step * 0.35;
    // Horizontales y verticales con onda: periodo = tamaño del patrón, así repiten sin corte
    out.push(
      `<path d="M0 ${f3(o)} C${f3(size * 0.25)} ${f3(o - a)} ${f3(size * 0.25)} ${f3(o + a)} ${f3(size * 0.5)} ${f3(o)} S${f3(size * 0.75)} ${f3(o - a)} ${f3(size)} ${f3(o)}"/>`,
      `<path d="M${f3(o)} 0 C${f3(o + a)} ${f3(size * 0.25)} ${f3(o - a)} ${f3(size * 0.25)} ${f3(o)} ${f3(size * 0.5)} S${f3(o + a)} ${f3(size * 0.75)} ${f3(o)} ${f3(size)}"/>`,
    );
  }
  return out.join("");
}

/* ---------- Ruido (textura de césped y grano) ---------- */

/** Ruido de valor periódico (se repite sin costuras), en escala de grises alrededor de 128. */
function noiseDataUrl(size: number, octaves: [cell: number, amp: number][], seed: number, grain: number): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const field = new Float32Array(size * size);
  for (const [cell, amp] of octaves) {
    const g = Math.max(1, Math.round(size / cell));
    const lattice = Array.from({ length: g * g }, () => rnd() * 2 - 1);
    const at = (i: number, j: number) => lattice[((j + g) % g) * g + ((i + g) % g)];
    const smooth = (t: number) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * g;
        const fy = (y / size) * g;
        const i = Math.floor(fx);
        const j = Math.floor(fy);
        const tx = smooth(fx - i);
        const ty = smooth(fy - j);
        const top = at(i, j) * (1 - tx) + at(i + 1, j) * tx;
        const bot = at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx;
        field[y * size + x] += (top * (1 - ty) + bot * ty) * amp;
      }
  }
  // Claro = blanco translúcido, oscuro = negro translúcido: se pinta encima sin modos de fusión
  const img = ctx.createImageData(size, size);
  for (let p = 0; p < size * size; p++) {
    const v = Math.max(-1, Math.min(1, field[p] + ((rnd() * 2 - 1) * grain) / 128));
    const c = v > 0 ? 255 : 0;
    img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = c;
    img.data[p * 4 + 3] = Math.round(Math.abs(v) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Baldosa de cáusticas como imagen (1 px = 1 cm del plano). Va en una capa HTML propia sobre la
 * piscina que se anima solo con `transform`, para que la maqueta no se repinte en cada fotograma.
 */
export function causticUrl(size: number, seed: number, width: number): string {
  const px = size * 100;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${size} ${size}">` +
    `<g fill="none" stroke="#fff" stroke-width="${width}" stroke-linecap="round">${causticTile(size, seed)}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** `<defs>` con todos los materiales, proyectados con la matriz del plano `m`. */
export function materialDefs(m: PlanMatrix): string {
  const pt = `matrix(${m.map((n) => f3(n)).join(" ")})`;
  const plan = (id: string, w: number, h: number, body: string, extra = "") =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}" patternTransform="${pt}">${body}${extra}</pattern>`;

  const coarse = noiseDataUrl(
    192,
    [
      [48, 0.55],
      [16, 0.35],
      [6, 0.2],
    ],
    7,
    26,
  );
  const fine = noiseDataUrl(160, [[4, 0.25]], 11, 60);

  return `
    ${plan("fv1-m-wood", 2.4, 0.8, woodTile())}
    ${plan("fv1-m-tile", 1.2, 1.2, tileTile())}
    ${plan("fv1-m-stone", 1.8, 1.2, slabTile(0.9, 0.6, "ms"))}
    ${plan("fv1-m-paving", 0.8, 0.4, slabTile(0.4, 0.2, "mp"))}
    ${plan("fv1-m-grass", 1, 3, `<rect class="mg-a" width="1" height="1.5"/><rect class="mg-b" y="1.5" width="1" height="1.5"/>`)}
    ${plan("fv1-m-furn", 0.9, 0.3, `<rect class="mf-a" width="0.9" height="0.3"/><path class="mf-grain" d="M0 0.07H0.9M0 0.16C0.3 0.15 0.6 0.18 0.9 0.16M0 0.24H0.9"/>`)}
    ${plan("fv1-m-furn-dark", 0.9, 0.3, `<rect class="mfd-a" width="0.9" height="0.3"/><path class="mfd-grain" d="M0 0.07H0.9M0 0.16C0.3 0.15 0.6 0.18 0.9 0.16M0 0.24H0.9"/>`)}
    ${
      coarse
        ? `<pattern id="fv1-m-noise" patternUnits="userSpaceOnUse" width="192" height="192"><image href="${coarse}" width="192" height="192"/></pattern>`
        : ""
    }
    ${
      fine
        ? `<pattern id="fv1-m-grain" patternUnits="userSpaceOnUse" width="160" height="160"><image href="${fine}" width="160" height="160"/></pattern>`
        : ""
    }
    <radialGradient id="fv1-m-canopy" cx="0.42" cy="0.4" r="0.62" fx="0.32" fy="0.28">
      <stop offset="0" class="mtree-0"/><stop offset="0.55" class="mtree-1"/><stop offset="1" class="mtree-2"/>
    </radialGradient>
    <linearGradient id="fv1-m-glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" class="mglass-0"/><stop offset="0.45" class="mglass-1"/><stop offset="1" class="mglass-0"/>
    </linearGradient>
    <filter id="fv1-m-soft" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="2.2"/>
    </filter>
  `;
}

/** Colores de los materiales (derivados de las variables del tema). */
export function materialCss(): string {
  const mix = (v: string, pct: number, to: string) => `color-mix(in srgb,var(${v}) ${pct}%,${to})`;
  return `
    .iso .floor-wood{fill:url(#fv1-m-wood)}
    .iso .floor-tile{fill:url(#fv1-m-tile)}
    .iso .floor-stone,.iso .porch{fill:url(#fv1-m-stone)}
    .iso .paving{fill:url(#fv1-m-paving)}
    .iso .grass{fill:url(#fv1-m-grass)}
    .iso .noise{fill:url(#fv1-m-noise);opacity:var(--iso-noise-op);pointer-events:none}
    .iso .grain{fill:url(#fv1-m-grain);opacity:var(--iso-grain-op);pointer-events:none}

    .iso .mw-a{fill:var(--iso-wood)}
    .iso .mw-b{fill:${mix("--iso-wood", 90, "#6b4423")}}
    .iso .mw-c{fill:${mix("--iso-wood", 88, "#fff6e6")}}
    .iso .mw-grain{fill:none;stroke:${mix("--iso-wood", 78, "#5a3a1e")};stroke-width:.008;opacity:.55}
    .iso .mw-joint{stroke:${mix("--iso-wood", 62, "#3a2614")};stroke-width:.014}

    .iso .mt-a{fill:var(--iso-tile)}
    .iso .mt-b{fill:${mix("--iso-tile", 94, "#7a6a5a")}}
    .iso .mt-joint{fill:none;stroke:${mix("--iso-tile", 80, "#fff")};stroke-width:.02}

    .iso .ms-a{fill:var(--iso-porch)}
    .iso .ms-b{fill:${mix("--iso-porch", 93, "#8a7457")}}
    .iso .ms-c{fill:${mix("--iso-porch", 90, "#fffaf0")}}
    .iso .ms-joint{stroke:${mix("--iso-porch", 74, "#4a3a2a")};stroke-width:.016}

    .iso .mp-a{fill:var(--iso-paving)}
    .iso .mp-b{fill:${mix("--iso-paving", 92, "#5a5048")}}
    .iso .mp-c{fill:${mix("--iso-paving", 90, "#fff")}}
    .iso .mp-joint{stroke:${mix("--iso-paving", 72, "#3a3028")};stroke-width:.014}

    .iso .mg-a{fill:var(--iso-grass)}
    .iso .mg-b{fill:${mix("--iso-grass", 93, "#2f4a1c")}}

    .iso .mf-a{fill:var(--t-wood)}
    .iso .mf-grain{fill:none;stroke:${mix("--t-wood", 80, "#4a2e16")};stroke-width:.008;opacity:.6}
    .iso .mfd-a{fill:var(--t-darkwood)}
    .iso .mfd-grain{fill:none;stroke:${mix("--t-darkwood", 75, "#1e140c")};stroke-width:.008;opacity:.6}
    .iso .t-wood.t{fill:url(#fv1-m-furn)}
    .iso .t-darkwood.t{fill:url(#fv1-m-furn-dark)}

    .iso .water-edge{fill:var(--iso-water-2);opacity:.45}

    .iso .cast{opacity:var(--iso-cast-op)}
    .iso .cast polygon,.iso .cast ellipse{fill:var(--iso-cast)}
    .iso .cast .ao{fill:none;stroke:var(--iso-cast);stroke-width:9;stroke-linejoin:round;opacity:.55}

    .iso .mtree-0{stop-color:${mix("--iso-tree", 70, "#f4f0d0")}}
    .iso .mtree-1{stop-color:var(--iso-tree)}
    .iso .mtree-2{stop-color:${mix("--iso-tree-2", 80, "#16200f")}}
    .iso .tree{fill:url(#fv1-m-canopy)}
    .iso .mglass-0{stop-color:var(--iso-glass)}
    .iso .mglass-1{stop-color:rgba(255,255,255,.75)}
    .iso .glass.t,.iso .glass.s{fill:url(#fv1-m-glass)}

    .iso .t-bed.t{fill:var(--t-bed)}
    .iso .duvet{fill:${mix("--t-bed", 78, "var(--sage)")}}
    .iso .duvet.w{fill:${mix("--t-bed", 66, "var(--sage)")}}
    .iso .duvet.s{fill:${mix("--t-bed", 58, "var(--sage)")}}
    .iso .pillow{fill:${mix("--t-bed", 90, "#fff")}}
    .iso .pillow.w,.iso .pillow.s{fill:${mix("--t-bed", 85, "#6a5a4a")}}
    .iso .cushion{fill:${mix("--t-sofa", 92, "#fff")}}
    .iso .cushion.w,.iso .cushion.s{fill:${mix("--t-sofa", 80, "#4a3a2a")}}
  `;
}
