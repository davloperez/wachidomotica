import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Clock,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RepeatWrapping,
  Path,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

import type { HassEntity, HomeAssistant } from "../types";
import { sunLight, sunPosition } from "../lib/solar";
import {
  FENCE_HEIGHT,
  FOOTPRINT,
  FURNITURE,
  GATES,
  INTERIOR_THICKNESS,
  EXTERIOR_THICKNESS,
  LAMPS,
  NORTH_ANGLE,
  PAVING,
  PLOT,
  POOL,
  POOL_DECK,
  ROOMS,
  WALLS,
  WALL_HEIGHT,
  type Gate,
  type Lamp,
  type Opening,
  type Point,
  type Rect,
  type Wall,
} from "./plan";
import { MATERIAL_COLORS, PALETTES, type Palette } from "./palette";

/** Máximo de luces puntuales con sombra a la vez (cada una usa un cubemap: coste alto en tablets). */
const MAX_SHADOW_LIGHTS = 6;
/** Velocidad visual de las persianas (fracción de recorrido por segundo). */
const SHUTTER_SPEED = 0.35;
/** Tras este tiempo sin tocar la pantalla, la cámara vuelve a la vista inicial. */
const IDLE_RETURN_MS = 90_000;

/** Si el usuario ha movido la vista hace menos de esto, la cámara no salta a lo que se acciona. */
const FOCUS_IDLE_MS = 20_000;
/** Cambios que llegan con menos de esta separación se enfocan juntos (escenas, grupos de luces). */
const FOCUS_GATHER_MS = 400;
/** Tiempo que la cámara se queda mirando lo accionado tras el último cambio, antes de volver. */
const FOCUS_HOLD_MS = 6_000;

const HOME_CAMERA = new Vector3(-0.4, 31, 19.5);
const HOME_TARGET = new Vector3(-0.4, 0, 2.4);
/** Centro de la parcela: hacia aquí apunta el sol y alrededor se calcula su sombra. */
const PLOT_CENTER = new Vector3(-0.4, 0, 2.6);
/** Cada cuánto se recalcula la posición del sol aunque Home Assistant no cambie. */
const SUN_REFRESH_MS = 30_000;
const WARM_WHITE = new Color(255 / 255, 196 / 255, 137 / 255);

/* Intensidad máxima (candelas) por tipo de luminaria, con unidades físicas de three.js */
const LAMP_POWER: Record<Lamp["kind"], number> = {
  ceiling: 26,
  pendant: 14,
  lamp: 4,
  strip: 6,
  wall: 7,
  pool: 22,
};
const LAMP_RANGE: Record<Lamp["kind"], number> = {
  ceiling: 12,
  pendant: 7,
  lamp: 7,
  strip: 7,
  wall: 9,
  pool: 7,
};

export interface SceneOptions {
  maxPixelRatio?: number;
  latitude: number;
  longitude: number;
}

export interface SunInfo {
  azimuth: number;
  elevation: number;
  /** Irradiancia directa estimada (W/m²) */
  directNormal: number;
  cloudCoverage?: number;
}

interface LampRuntime {
  def: Lamp;
  light: PointLight;
  bulb: Mesh<BufferGeometry, MeshStandardMaterial>;
  glow: Sprite;
  on: boolean;
  level: number;
}

interface GateRuntime {
  def: Gate;
  mesh: Mesh;
  /** Posición cerrada y dirección de apertura */
  closed: Vector3;
  dir: Vector3;
  /** Fracción abierta actual y objetivo */
  current: number;
  target: number;
}

/** Velocidad visual de las puertas correderas (fracción de recorrido por segundo). */
const GATE_SPEED = 0.3;

/** Enfoque momentáneo de la cámara sobre lo que acaba de cambiar en Home Assistant. */
interface FocusRuntime {
  /** Elementos que han cambiado y cuándo (los antiguos caducan para no acumular sin fin) */
  points: { at: Vector3; time: number }[];
  lastEvent: number;
  /** Vista previa a la que se vuelve al terminar */
  restorePos: Vector3;
  restoreTarget: Vector3;
  /** Destino actual de la cámara (undefined mientras se agrupan cambios) */
  goalPos?: Vector3;
  goalTarget?: Vector3;
  returning: boolean;
}

interface ShutterRuntime {
  entity: string;
  opening: Opening;
  mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
  /** Fracción cubierta actual y objetivo (0 = abierta, 1 = cerrada) */
  current: number;
  target: number;
}

/** Elemento accionable que se ha tocado en el plano. */
export interface ScenePick {
  kind: "light" | "cover";
  entity: string;
}

/** Un toque es un clic si el dedo apenas se mueve y se levanta pronto (si no, es un giro). */
const TAP_MAX_MOVE = 10;
const TAP_MAX_MS = 600;

export interface SceneStats {
  lightsOn: number;
  lightsTotal: number;
  coversOpenAvg: number | undefined;
  coversTotal: number;
  sun: SunInfo;
}

export class HouseScene {
  readonly renderer: WebGLRenderer;
  private readonly labels: CSS2DRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(38, 1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly clock = new Clock();
  private readonly resizeObserver: ResizeObserver;

  private palette: Palette = PALETTES.dark;
  private sun!: DirectionalLight;
  private hemi!: HemisphereLight;
  private sunDisc!: Sprite;
  private sunInfo: SunInfo = { azimuth: 0, elevation: 0, directNormal: 0 };
  private cloudCoverage: number | undefined;
  private timeOverride: Date | undefined;
  private sunTimer = 0;
  private outdoorMaterials: Record<"lawn" | "paving" | "water" | "basin", MeshStandardMaterial> = {} as never;
  private ground!: Mesh<ShapeGeometry, MeshStandardMaterial>;
  private grid!: LineSegments<BufferGeometry, LineBasicMaterial>;
  private wallMaterial!: MeshStandardMaterial;
  private wallLines!: LineSegments<BufferGeometry, LineBasicMaterial>;
  /** Suelos sin iluminación: siempre del mismo beige, enciendas o no las luces. */
  private floorMaterial!: MeshBasicMaterial;
  private furnitureMaterials: Record<string, MeshStandardMaterial> = {};
  private glassMaterial!: MeshStandardMaterial;
  private shutterMaterial!: MeshStandardMaterial;
  private frameMaterial!: MeshStandardMaterial;

  private lamps: LampRuntime[] = [];
  private gates: GateRuntime[] = [];
  private fenceMaterial!: MeshStandardMaterial;
  private fenceClones: MeshStandardMaterial[] = [];
  private ambient!: AmbientLight;
  private water!: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private shutters: ShutterRuntime[] = [];
  private raf = 0;
  private dirty = true;
  private lastInteraction = performance.now();
  /** Último gesto real del usuario sobre la vista (no cuenta el movimiento automático). */
  private lastUserInteraction = -Infinity;
  private returningHome = false;
  private focus: FocusRuntime | undefined;
  /** El primer estado de Home Assistant es la carga inicial, no un cambio que enfocar. */
  private primed = false;

  /** Zonas táctiles invisibles de luces y persianas (más grandes que el objeto que representan). */
  private hitTargets: Mesh[] = [];
  private hitMaterial = new MeshBasicMaterial({ visible: false });
  private highlightMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    toneMapped: false,
  });
  private selected: string | undefined;
  private readonly raycaster = new Raycaster();
  private pointerStart: { x: number; y: number; t: number; id: number } | undefined;
  private activePointers = 0;
  /** Se llama al tocar una luz o persiana (o con `null` al tocar una zona vacía). */
  onPick?: (pick: ScenePick | null) => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: SceneOptions,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.maxPixelRatio ?? 1.5));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.classList.add("webgl");
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.classList.add("labels");
    container.appendChild(this.labels.domElement);

    this.camera.position.copy(HOME_CAMERA);

    // Gestos habituales: 1 dedo gira, 2 dedos pellizcan (zoom) y desplazan.
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(HOME_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.screenSpacePanning = false;
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    this.controls.addEventListener("start", () => {
      this.lastInteraction = this.lastUserInteraction = performance.now();
      this.returningHome = false;
      // El usuario toma el control: se cancela el enfoque automático y se queda donde lo deje.
      this.focus = undefined;
    });
    this.controls.addEventListener("end", () => {
      this.lastUserInteraction = performance.now();
    });
    this.controls.addEventListener("change", () => {
      this.lastInteraction = performance.now();
      // Mantener el centro de giro dentro de la casa.
      this.controls.target.x = Math.max(-12, Math.min(11, this.controls.target.x));
      this.controls.target.z = Math.max(-10, Math.min(15, this.controls.target.z));
      this.controls.target.y = 0;
      this.dirty = true;
    });
    this.controls.update();

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("pointermove", this.onPointerMove);

    this.build();
    this.applyPalette();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.updateSun();
    this.sunTimer = window.setInterval(() => this.updateSun(), SUN_REFRESH_MS);
    this.tick();
  }

  /* ================================================================== */
  /* Construcción                                                        */
  /* ================================================================== */

  private build(): void {
    const s = this.scene;

    // Iluminación ambiental y sol
    this.hemi = new HemisphereLight(0xdfe8ff, 0x3a3326, 0.8);
    s.add(this.hemi);
    // Luz general suave: deja ver la casa y la parcela de noche y rellena las sombras de día.
    this.ambient = new AmbientLight(0xc9d6ff, 0.45);
    s.add(this.ambient);

    this.sun = new DirectionalLight(0xfff2dd, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 18;
    this.sun.shadow.camera.bottom = -18;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 120;
    this.sun.target.position.copy(PLOT_CENTER);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    s.add(this.sun, this.sun.target);

    // Disco solar visible en el cielo, en la dirección real del sol.
    this.sunDisc = new Sprite(
      new SpriteMaterial({
        map: makeGlowTexture(),
        color: 0xfff1c9,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sunDisc.scale.set(9, 9, 1);
    s.add(this.sunDisc);

    // Terreno fuera de la parcela (con hueco para ella)
    const outside = rectShape([-80, -80, 80, 80]);
    outside.holes.push(polygonPath(PLOT));
    this.ground = new Mesh(groundGeometry(outside), new MeshStandardMaterial({ roughness: 1 }));
    this.ground.receiveShadow = true;
    s.add(this.ground);

    this.grid = makeGrid(80, PLOT);
    this.grid.position.y = 0.002;
    s.add(this.grid);

    // Suelos de cada estancia
    this.floorMaterial = new MeshBasicMaterial({ toneMapped: false });
    ROOMS.forEach((room, i) => {
      const [x1, z1, x2, z2] = room.rect;
      const floor = new Mesh(new PlaneGeometry(x2 - x1, z2 - z1), this.floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((x1 + x2) / 2, 0.02 + i * 0.002, (z1 + z2) / 2);
      floor.receiveShadow = true;
      s.add(floor);
      if (!room.name) return;

      const el = document.createElement("div");
      el.className = "room-label";
      el.textContent = room.name;
      const label = new CSS2DObject(el);
      label.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
      s.add(label);
    });

    // Muros, ventanas y persianas
    this.wallMaterial = new MeshStandardMaterial({ roughness: 0.9 });
    this.glassMaterial = new MeshStandardMaterial({
      color: 0x9fd8ff,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.shutterMaterial = new MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 });
    this.frameMaterial = new MeshStandardMaterial({
      color: MATERIAL_COLORS.frame,
      roughness: 0.45,
      metalness: 0.3,
    });
    const walls = new Group();
    const lineVerts: number[] = [];
    for (const wall of WALLS) this.buildWall(wall, walls, lineVerts);
    s.add(walls);

    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute("position", new Float32BufferAttribute(lineVerts, 3));
    this.wallLines = new LineSegments(lineGeo, new LineBasicMaterial({ transparent: true }));
    s.add(this.wallLines);

    // Tejado invisible: solo proyecta sombra, para que el sol entre únicamente por las ventanas.
    const roofMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    for (const [x1, z1, x2, z2] of FOOTPRINT) {
      const roof = new Mesh(new BoxGeometry(x2 - x1, 0.2, z2 - z1), roofMaterial);
      roof.position.set((x1 + x2) / 2, WALL_HEIGHT + 0.1, (z1 + z2) / 2);
      roof.castShadow = true;
      s.add(roof);
    }

    this.buildOutdoors();

    // Mobiliario (bloques sencillos para dar escala y sombras)
    for (const tone of ["dark", "light", "accent"]) {
      this.furnitureMaterials[tone] = new MeshStandardMaterial({ roughness: 0.7 });
    }
    for (const [tone, color] of Object.entries(MATERIAL_COLORS)) {
      this.furnitureMaterials[tone] = new MeshStandardMaterial({
        color,
        roughness: tone === "sofa" ? 0.95 : 0.6,
      });
    }
    const block = (x: number, z: number, y0: number, [w, h, d]: [number, number, number], tone: string) => {
      const mesh = new Mesh(new BoxGeometry(w, h, d), this.furnitureMaterials[tone]);
      mesh.position.set(x, y0 + h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      s.add(mesh);
    };
    for (const f of FURNITURE) {
      const [w, h, d] = f.size;
      const top = f.top ? 0.04 : 0;
      block(f.at[0], f.at[1], 0.02, [w, h - top, d], f.tone ?? "light");
      if (f.top) block(f.at[0], f.at[1], 0.02 + h - top, [w + 0.03, top, d + 0.03], f.top);
    }

    // Luminarias
    const glowTexture = makeGlowTexture();
    for (const def of LAMPS) this.lamps.push(this.buildLamp(def, glowTexture));
  }

  /** Césped, pavimentos, piscina y cerramiento de la parcela. */
  private buildOutdoors(): void {
    const s = this.scene;
    const o = this.outdoorMaterials;
    o.lawn = new MeshStandardMaterial({ roughness: 1 });
    o.paving = new MeshStandardMaterial({ roughness: 0.85 });
    o.water = new MeshStandardMaterial({
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    o.basin = new MeshStandardMaterial({ roughness: 0.5, side: BackSide });

    const flat = (shape: Shape, material: MeshStandardMaterial, y: number) => {
      const mesh = new Mesh(groundGeometry(shape), material);
      mesh.position.y = y;
      mesh.receiveShadow = true;
      s.add(mesh);
      return mesh;
    };

    // Césped en toda la parcela salvo la playa de la piscina
    const lawn = polygonShape(PLOT);
    lawn.holes.push(rectPath(POOL_DECK));
    flat(lawn, o.lawn, 0.004);

    // Playa de la piscina (con el hueco del vaso) y resto de pavimentos
    const deck = rectShape(POOL_DECK);
    deck.holes.push(rectPath(POOL.rect));
    flat(deck, o.paving, 0.008);
    for (const r of PAVING) flat(rectShape(r), o.paving, 0.01);

    // Vaso de la piscina: caja vista desde dentro (paredes y fondo) y lámina de agua
    const [px1, pz1, px2, pz2] = POOL.rect;
    const basin = new Mesh(new BoxGeometry(px2 - px1, POOL.depth, pz2 - pz1), o.basin);
    basin.position.set((px1 + px2) / 2, -POOL.depth / 2, (pz1 + pz2) / 2);
    basin.receiveShadow = true;
    s.add(basin);
    const water = new Mesh(new PlaneGeometry(px2 - px1, pz2 - pz1), o.water);
    this.water = water;
    water.rotation.x = -Math.PI / 2;
    water.position.set((px1 + px2) / 2, -0.12, (pz1 + pz2) / 2);
    s.add(water);

    // Valla negra de 2 m; en la calle empieza tras las puertas de los vehículos
    this.fenceMaterial = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.35 });
    const barTexture = makeBarTexture();
    const panel = (from: Point, to: Point, thickness: number) => {
      const dx = to[0] - from[0];
      const dz = to[1] - from[1];
      const length = Math.hypot(dx, dz);
      const material = this.fenceMaterial.clone();
      material.map = barTexture.clone();
      material.map.repeat.set(length * 9, 1);
      material.map.needsUpdate = true;
      this.fenceClones.push(material);
      const mesh = new Mesh(new BoxGeometry(length, FENCE_HEIGHT, thickness), material);
      mesh.position.set((from[0] + to[0]) / 2, FENCE_HEIGHT / 2, (from[1] + to[1]) / 2);
      mesh.rotation.y = -Math.atan2(dz, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      s.add(mesh);
      return mesh;
    };
    const lastGate = GATES[GATES.length - 1];
    panel(lastGate.to, PLOT[1], 0.08);
    for (let i = 1; i < PLOT.length; i++) panel(PLOT[i], PLOT[(i + 1) % PLOT.length], 0.08);

    // Puertas correderas: cada una en su carril, desplazado hacia dentro de la parcela
    for (const def of GATES) {
      const dx = def.to[0] - def.from[0];
      const dz = def.to[1] - def.from[1];
      const length = Math.hypot(dx, dz);
      const dir = new Vector3(dx / length, 0, dz / length);
      const inward = new Vector3(-dir.z, 0, dir.x);
      const mesh = panel(def.from, def.to, 0.05);
      const closed = mesh.position.clone().addScaledVector(inward, def.track);
      mesh.position.copy(closed);
      this.gates.push({ def, mesh, closed, dir, current: 0, target: 0 });
    }

    // Rosa de los vientos: etiqueta "N" en la dirección del norte real
    const north = (NORTH_ANGLE * Math.PI) / 180;
    const el = document.createElement("div");
    el.className = "compass";
    el.textContent = "N";
    const label = new CSS2DObject(el);
    label.position.set(PLOT_CENTER.x + Math.sin(north) * 14.5, 0.1, PLOT_CENTER.z - Math.cos(north) * 14.5);
    s.add(label);
  }

  private buildWall(wall: Wall, group: Group, lineVerts: number[]): void {
    const [x1, z1] = wall.from;
    const [x2, z2] = wall.to;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const ux = dx / length;
    const uz = dz / length;
    const angle = Math.atan2(dz, dx);
    const t = wall.exterior ? EXTERIOR_THICKNESS : INTERIOR_THICKNESS;
    // Los muros exteriores se prolongan media anchura para cerrar las esquinas.
    const ext = wall.exterior ? t / 2 : 0;

    // Normal hacia el exterior de la casa (para colocar las persianas por fuera del vidrio).
    let nx = -uz;
    let nz = ux;
    const mx = (x1 + x2) / 2;
    const mz = (z1 + z2) / 2;
    if (nx * mx + nz * mz < 0) {
      nx = -nx;
      nz = -nz;
    }

    const piece = (u0: number, u1: number, y0: number, y1: number) => {
      if (u1 - u0 < 0.001 || y1 - y0 < 0.001) return;
      const mesh = new Mesh(new BoxGeometry(u1 - u0, y1 - y0, t), this.wallMaterial);
      const uc = (u0 + u1) / 2;
      mesh.position.set(x1 + ux * uc, (y0 + y1) / 2, z1 + uz * uc);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };

    const openings = [...(wall.openings ?? [])].sort((a, b) => a.at - b.at);
    let cursor = -ext;
    for (const o of openings) {
      const a = o.at - o.width / 2;
      const b = o.at + o.width / 2;
      piece(cursor, a, 0, WALL_HEIGHT);
      piece(a, b, 0, o.sill);
      piece(a, b, o.sill + o.height, WALL_HEIGHT);
      cursor = b;
      if (wall.exterior) this.buildFrame(o, x1 + ux * o.at, z1 + uz * o.at, angle, t, group);

      if (o.kind === "window") {
        const cx = x1 + ux * o.at;
        const cz = z1 + uz * o.at;
        const glass = new Mesh(new BoxGeometry(o.width, o.height, 0.02), this.glassMaterial);
        glass.position.set(cx, o.sill + o.height / 2, cz);
        glass.rotation.y = -angle;
        group.add(glass);

        if (o.cover) {
          const shutter = new Mesh(new BoxGeometry(o.width, 1, 0.035), this.shutterMaterial.clone());
          shutter.material.map = makeSlatTexture();
          const off = t * 0.32;
          shutter.position.set(cx + nx * off, 0, cz + nz * off);
          shutter.rotation.y = -angle;
          shutter.castShadow = true;
          shutter.receiveShadow = true;
          shutter.visible = false;
          group.add(shutter);
          this.shutters.push({ entity: o.cover, opening: o, mesh: shutter, current: 0, target: 0 });
          this.placeShutter(this.shutters[this.shutters.length - 1]);

          const hit = this.addHitTarget(new BoxGeometry(o.width, o.height, t + 0.16), "cover", o.cover);
          hit.position.set(cx, o.sill + o.height / 2, cz);
          hit.rotation.y = -angle;
        }
      }
    }
    piece(cursor, length + ext, 0, WALL_HEIGHT);

    // Línea luminosa en la coronación del muro
    const y = WALL_HEIGHT + 0.004;
    lineVerts.push(x1 - ux * ext, y, z1 - uz * ext, x2 + ux * ext, y, z2 + uz * ext);
  }

  /** Marco negro de 5 cm alrededor de las ventanas y puertas exteriores. */
  private buildFrame(o: Opening, cx: number, cz: number, angle: number, t: number, group: Group): void {
    const f = 0.05;
    const depth = t * 0.55;
    const bar = (w: number, h: number, along: number, y: number) => {
      const mesh = new Mesh(new BoxGeometry(w, h, depth), this.frameMaterial);
      mesh.position.set(cx + Math.cos(angle) * along, y, cz + Math.sin(angle) * along);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      group.add(mesh);
    };
    const top = o.sill + o.height;
    bar(o.width, f, 0, top - f / 2);
    if (o.sill > 0) bar(o.width, f, 0, o.sill + f / 2);
    bar(f, o.height, -o.width / 2 + f / 2, o.sill + o.height / 2);
    bar(f, o.height, o.width / 2 - f / 2, o.sill + o.height / 2);
    // Montante central en ventanas anchas y balconeras
    if (o.kind === "window" && o.width > 1.2) bar(f * 0.8, o.height, 0, o.sill + o.height / 2);
  }

  private buildLamp(def: Lamp, glowTexture: CanvasTexture): LampRuntime {
    const [x, y, z] = def.pos;
    const light = new PointLight(WARM_WHITE, 0, LAMP_RANGE[def.kind], 2);
    light.position.set(x, def.kind === "ceiling" ? y - 0.15 : y, z);
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.1;
    light.shadow.bias = -0.003;
    light.shadow.radius = 4;
    light.visible = false;
    this.scene.add(light);

    let geometry: BufferGeometry;
    if (def.kind === "strip" && def.strip) {
      geometry =
        def.strip.axis === "x"
          ? new BoxGeometry(def.strip.length, 0.03, 0.03)
          : new BoxGeometry(0.03, 0.03, def.strip.length);
    } else if (def.kind === "ceiling") {
      geometry = new CylinderGeometry(0.22, 0.22, 0.04, 24);
    } else if (def.kind === "wall") {
      geometry = new BoxGeometry(0.16, 0.16, 0.16);
    } else {
      geometry = new SphereGeometry(def.kind === "pendant" ? 0.14 : 0.08, 16, 12);
    }
    const bulb = new Mesh(geometry, new MeshStandardMaterial({ color: 0x222831, roughness: 0.4 }));
    bulb.position.set(x, y, z);
    this.scene.add(bulb);

    const glow = new Sprite(
      new SpriteMaterial({
        map: glowTexture,
        color: WARM_WHITE,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    glow.position.copy(bulb.position);
    const size =
      def.kind === "ceiling" || def.kind === "pool"
        ? 1.6
        : def.kind === "strip"
          ? (def.strip?.length ?? 1) * 0.9
          : 0.9;
    glow.scale.set(size, def.kind === "strip" ? 0.6 : size, 1);
    glow.visible = false;
    this.scene.add(glow);

    // Zona táctil: esfera generosa (o caja a lo largo de la tira) para acertar con el dedo.
    const hitGeometry =
      def.kind === "strip" && def.strip
        ? def.strip.axis === "x"
          ? new BoxGeometry(def.strip.length, 0.45, 0.45)
          : new BoxGeometry(0.45, 0.45, def.strip.length)
        : new SphereGeometry(def.kind === "ceiling" ? 0.5 : 0.4, 16, 12);
    const hit = this.addHitTarget(hitGeometry, "light", def.entity);
    hit.position.set(x, y, z);
    if (def.kind === "pool") {
      // La luz de la piscina se acciona tocando cualquier punto del agua.
      const [px1, pz1, px2, pz2] = POOL.rect;
      hit.geometry.dispose();
      hit.geometry = new BoxGeometry(px2 - px1, 0.3, pz2 - pz1);
      hit.position.set((px1 + px2) / 2, -0.05, (pz1 + pz2) / 2);
    }

    return { def, light, bulb, glow, on: false, level: 0 };
  }

  private placeShutter(sh: ShutterRuntime): void {
    const { sill, height, width } = sh.opening;
    const covered = Math.max(0.0001, sh.current * height);
    sh.mesh.scale.y = covered;
    sh.mesh.position.y = sill + height - covered / 2;
    sh.mesh.visible = sh.current > 0.005;
    const map = sh.mesh.material.map;
    if (map) map.repeat.set(Math.max(1, width), covered * 22);
  }

  /* ================================================================== */
  /* Estado de Home Assistant                                            */
  /* ================================================================== */

  update(hass: HomeAssistant, weatherEntity?: string): SceneStats {
    const changed: Vector3[] = [];
    let lightsOn = 0;
    let lightsTotal = 0;
    for (const lamp of this.lamps) {
      const st = hass.states[lamp.def.entity];
      if (st && st.state !== "unavailable") lightsTotal++;
      const on = st?.state === "on";
      const level = on ? brightness(st) : 0;
      if (on) lightsOn++;
      const color = on ? lightColor(st) : WARM_WHITE;
      if (on !== lamp.on || level !== lamp.level || !lamp.light.color.equals(color)) {
        lamp.on = on;
        lamp.level = level;
        lamp.light.color.copy(color);
        lamp.light.intensity = LAMP_POWER[lamp.def.kind] * level;
        if (lamp.def.kind === "pool") this.tintPool(on, color, level);
        lamp.light.visible = on;
        lamp.glow.visible = on;
        lamp.glow.material.color.copy(color);
        lamp.glow.material.opacity = 0.35 + 0.65 * level;
        const m = lamp.bulb.material;
        m.emissive.copy(on ? color : new Color(0x000000));
        m.emissiveIntensity = on ? 1.5 + 2 * level : 0;
        m.color.set(on ? 0xffffff : this.palette.fixture);
        this.dirty = true;
        changed.push(lamp.bulb.position.clone());
      }
    }
    this.assignShadows();

    let openSum = 0;
    let openCount = 0;
    for (const sh of this.shutters) {
      const st = hass.states[sh.entity];
      const pos = coverPosition(st);
      if (pos === undefined) continue;
      openSum += pos;
      openCount++;
      const target = 1 - pos / 100;
      if (target !== sh.target) {
        sh.target = target;
        this.dirty = true;
        const { sill, height } = sh.opening;
        changed.push(new Vector3(sh.mesh.position.x, sill + height / 2, sh.mesh.position.z));
      }
    }

    for (const g of this.gates) {
      const st = hass.states[g.def.entity];
      if (!st || st.state === "unavailable" || st.state === "unknown") continue;
      const target = st.state === "on" ? 1 : 0;
      if (target !== g.target) {
        g.target = target;
        this.dirty = true;
        changed.push(g.closed.clone());
      }
    }

    if (this.primed) this.noteActivity(changed);
    this.primed = true;

    const clouds = weatherEntity ? hass.states[weatherEntity]?.attributes.cloud_coverage : undefined;
    this.cloudCoverage = typeof clouds === "number" ? clouds : undefined;
    this.updateSun();

    return {
      lightsOn,
      lightsTotal,
      coversOpenAvg: openCount ? openSum / openCount : undefined,
      coversTotal: this.shutters.length,
      sun: this.sunInfo,
    };
  }

  /** El agua y el vaso brillan con el color real de la luz de la piscina. */
  private tintPool(on: boolean, color: Color, level: number): void {
    const water = this.water.material;
    const basin = this.outdoorMaterials.basin;
    water.emissive.copy(on ? color : new Color(0x000000));
    water.emissiveIntensity = on ? 0.35 + 0.65 * level : 0;
    basin.emissive.copy(on ? color : new Color(0x000000));
    basin.emissiveIntensity = on ? 0.6 * level : 0;
  }

  /** Las luces de techo encendidas más intensas proyectan sombra; el resto no (límite de la GPU). */
  private assignShadows(): void {
    const candidates = this.lamps
      .filter((l) => l.on && (l.def.kind === "ceiling" || l.def.kind === "pendant"))
      .sort((a, b) => b.level - a.level)
      .slice(0, MAX_SHADOW_LIGHTS);
    for (const l of this.lamps) {
      const cast = candidates.includes(l);
      if (l.light.castShadow !== cast) {
        l.light.castShadow = cast;
        this.dirty = true;
      }
    }
  }

  /** Fija una hora simulada (desarrollo) o vuelve a la hora real con `undefined`. */
  setTime(date: Date | undefined): SunInfo {
    this.timeOverride = date;
    this.updateSun();
    return this.sunInfo;
  }

  get sunState(): SunInfo {
    return this.sunInfo;
  }

  /**
   * Sol real calculado para la ubicación y la hora: posición (azimut/elevación sobre el plano,
   * girado según el norte del plano) y luminosidad (masa de aire + nubosidad de la previsión).
   */
  private updateSun(): void {
    const now = this.timeOverride ?? new Date();
    const { azimuth, elevation } = sunPosition(now, this.opts.latitude, this.opts.longitude);
    const { directNormal, sky } = sunLight(elevation, this.cloudCoverage);
    this.sunInfo = { azimuth, elevation, directNormal, cloudCoverage: this.cloudCoverage };

    // Azimut de brújula → ángulo en el plano (desde "arriba", horario); arriba del plano es -Z.
    const theta = ((azimuth + NORTH_ANGLE) * Math.PI) / 180;
    const direction = (elevationDeg: number) => {
      const el = (elevationDeg * Math.PI) / 180;
      return new Vector3(Math.sin(theta) * Math.cos(el), Math.sin(el), -Math.cos(theta) * Math.cos(el));
    };

    // La luz direccional nunca baja de 2° para que las sombras no se estiren hasta el infinito.
    const nextPos = direction(Math.max(elevation, 2)).multiplyScalar(60).add(PLOT_CENTER);
    const intensity = 5.2 * (directNormal / 1000);
    const day = smoothstep(-6, 12, elevation);
    if (!this.sun.position.equals(nextPos) || Math.abs(this.sun.intensity - intensity) > 0.002) {
      this.sun.position.copy(nextPos);
      this.sun.intensity = intensity;
      this.sun.visible = intensity > 0.01;
      // Más cálido y rojizo cuanto más bajo está el sol (más atmósfera que atravesar).
      this.sun.color.setHSL(0.085, 0.9, 0.6 + 0.32 * smoothstep(0, 35, elevation));
      this.hemi.intensity = 0.12 + 1.35 * sky;
      this.ambient.intensity = 0.45 + 0.25 * sky;
      this.ambient.color.set(day > 0.5 ? 0xfff6ea : 0xc9d6ff);
      this.hemi.color.set(day > 0.5 ? 0xdfe8ff : 0x8fa6ff);
      this.renderer.toneMappingExposure = 0.95 + 0.25 * (1 - day);

      this.sunDisc.position.copy(direction(elevation).multiplyScalar(90).add(PLOT_CENTER));
      this.sunDisc.visible = elevation > -1.5;
      this.sunDisc.material.color.setHSL(0.11, 1, 0.55 + 0.35 * smoothstep(0, 30, elevation));
      this.sunDisc.material.opacity = 0.35 + 0.65 * Math.max(0.15, 1 - (this.cloudCoverage ?? 0) / 110);
      this.dirty = true;
    }
  }

  /* ================================================================== */
  /* Tema, cámara y bucle                                                */
  /* ================================================================== */

  setTheme(theme: "light" | "dark"): void {
    this.palette = PALETTES[theme];
    this.applyPalette();
  }

  private applyPalette(): void {
    const p = this.palette;
    this.scene.background = new Color(p.background);
    this.scene.fog = new Fog(p.background, 55, 140);
    this.ground.material.color.set(p.ground);
    this.grid.material.color.set(p.grid);
    this.grid.material.opacity = p.gridOpacity;
    this.wallMaterial.color.set(p.wall);
    this.wallLines.material.color.set(p.wallLine);
    this.wallLines.material.opacity = p.wallLineOpacity;
    this.floorMaterial.color.set(p.floor);
    this.furnitureMaterials.dark.color.set(p.furnitureDark);
    this.furnitureMaterials.light.color.set(p.furnitureLight);
    this.furnitureMaterials.accent.color.set(p.accent);
    this.highlightMaterial.color.set(p.wallLine);
    this.outdoorMaterials.lawn.color.set(p.lawn);
    this.outdoorMaterials.paving.color.set(p.paving);
    this.outdoorMaterials.water.color.set(p.water);
    this.outdoorMaterials.basin.color.set(p.basin);
    for (const m of this.fenceClones) m.color.set(p.fence);
    for (const sh of this.shutters) sh.mesh.material.color.set(p.shutter);
    for (const l of this.lamps) if (!l.on) l.bulb.material.color.set(p.fixture);
    this.dirty = true;
  }

  resetView(): void {
    this.focus = undefined;
    this.returningHome = true;
  }

  /**
   * Algo ha cambiado en Home Assistant: si nadie está usando la vista (ni hay un panel abierto),
   * la cámara se acerca un momento a lo accionado; con varios cambios, al punto medio entre ellos.
   */
  private noteActivity(points: Vector3[]): void {
    if (!points.length || this.selected) return;
    const now = performance.now();
    if (!this.focus) {
      if (now - this.lastUserInteraction < FOCUS_IDLE_MS) return;
      const home = this.returningHome;
      this.returningHome = false;
      this.focus = {
        points: [],
        lastEvent: now,
        restorePos: home ? HOME_CAMERA.clone() : this.camera.position.clone(),
        restoreTarget: home ? HOME_TARGET.clone() : this.controls.target.clone(),
        returning: false,
      };
    }
    const f = this.focus;
    f.points = f.points.filter(
      (q) => now - q.time < FOCUS_HOLD_MS && !points.some((p) => p.distanceToSquared(q.at) < 0.01),
    );
    for (const p of points) f.points.push({ at: p, time: now });
    f.lastEvent = now;
    f.returning = false;
    // Si ya estaba enfocando, recalcular el encuadre con los nuevos puntos.
    if (f.goalPos) this.aimFocus(f);
  }

  private aimFocus(f: FocusRuntime): void {
    const center = new Vector3();
    for (const { at } of f.points) center.add(at);
    center.divideScalar(f.points.length);
    center.y = 0;
    let spread = 0;
    for (const { at } of f.points) spread = Math.max(spread, Math.hypot(at.x - center.x, at.z - center.z));
    // Encuadre: cerca para un solo elemento, más lejos cuanto más separados estén.
    const distance = Math.min(42, Math.max(18, 18 + spread * 1.9));
    const dir = HOME_CAMERA.clone().sub(HOME_TARGET).normalize();
    f.goalTarget = center;
    f.goalPos = center.clone().addScaledVector(dir, distance);
  }

  /** Avanza el enfoque automático; devuelve true mientras controla la cámara. */
  private stepFocus(dt: number): boolean {
    const f = this.focus;
    if (!f) return false;
    const now = performance.now();
    if (!f.goalPos) {
      if (now - f.lastEvent < FOCUS_GATHER_MS) return true;
      this.aimFocus(f);
    }
    if (!f.returning && now - f.lastEvent > FOCUS_HOLD_MS) {
      f.returning = true;
      f.goalPos = f.restorePos;
      f.goalTarget = f.restoreTarget;
    }
    const k = 1 - Math.pow(0.04, dt);
    this.camera.position.lerp(f.goalPos!, k);
    this.controls.target.lerp(f.goalTarget!, k);
    this.dirty = true;
    if (
      f.returning &&
      this.camera.position.distanceTo(f.goalPos!) < 0.02 &&
      this.controls.target.distanceTo(f.goalTarget!) < 0.02
    ) {
      this.focus = undefined;
    }
    return true;
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    // En pantallas estrechas, alejar la cámara para que quepa la casa entera.
    this.camera.fov = w / h < 1.2 ? 52 : 38;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private tick = (): void => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);

    const focusing = this.stepFocus(dt);
    if (focusing) this.lastInteraction = performance.now();
    if (!focusing && !this.returningHome && performance.now() - this.lastInteraction > IDLE_RETURN_MS) {
      const d = this.camera.position.distanceTo(HOME_CAMERA) + this.controls.target.distanceTo(HOME_TARGET);
      if (d > 0.05) this.returningHome = true;
    }
    if (this.returningHome) {
      const k = 1 - Math.pow(0.02, dt);
      this.camera.position.lerp(HOME_CAMERA, k);
      this.controls.target.lerp(HOME_TARGET, k);
      if (
        this.camera.position.distanceTo(HOME_CAMERA) < 0.02 &&
        this.controls.target.distanceTo(HOME_TARGET) < 0.02
      ) {
        this.returningHome = false;
        this.lastInteraction = performance.now();
      }
      this.dirty = true;
    }

    if (this.controls.update(dt)) this.dirty = true;

    for (const g of this.gates) {
      if (Math.abs(g.current - g.target) > 0.001) {
        const step = GATE_SPEED * dt;
        g.current += Math.max(-step, Math.min(step, g.target - g.current));
        g.mesh.position.copy(g.closed).addScaledVector(g.dir, g.current * g.def.slide);
        this.dirty = true;
      }
    }

    for (const sh of this.shutters) {
      if (Math.abs(sh.current - sh.target) > 0.001) {
        const step = SHUTTER_SPEED * dt;
        sh.current += Math.max(-step, Math.min(step, sh.target - sh.current));
        this.placeShutter(sh);
        this.dirty = true;
      }
    }

    // Solo se dibuja cuando algo ha cambiado: ahorra batería y GPU en el wallpanel.
    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      // Las etiquetas HTML no quedan ocultas por los muros: se desvanecen con la cámara baja.
      const labelOpacity = (1 - smoothstep(0.75, 1.05, this.controls.getPolarAngle())).toFixed(2);
      if (this.labels.domElement.style.opacity !== labelOpacity)
        this.labels.domElement.style.opacity = labelOpacity;
    }
  };

  /* ================================================================== */
  /* Interacción: tocar luces y persianas                                */
  /* ================================================================== */

  private addHitTarget(geometry: BufferGeometry, kind: ScenePick["kind"], entity: string): Mesh {
    const mesh = new Mesh(geometry, this.hitMaterial);
    mesh.userData = { kind, entity } satisfies ScenePick;
    mesh.renderOrder = 10;
    this.scene.add(mesh);
    this.hitTargets.push(mesh);
    return mesh;
  }

  /** Resalta la luz o persiana seleccionada (todas sus piezas si comparte entidad). */
  select(entity: string | undefined): void {
    if (entity === this.selected) return;
    this.selected = entity;
    for (const m of this.hitTargets) {
      m.material = (m.userData as ScenePick).entity === entity ? this.highlightMaterial : this.hitMaterial;
    }
    this.dirty = true;
  }

  private pick(clientX: number, clientY: number): ScenePick | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitTargets, false);
    if (!hits.length) return null;
    // Entre zonas solapadas gana la de centro más cercano al rayo (una lámpara junto a una ventana).
    const ray = this.raycaster.ray;
    const best = hits
      .slice(0, 4)
      .map((h) => ({ h, d: ray.distanceToPoint(h.object.getWorldPosition(new Vector3())) }))
      .sort((a, b) => a.d - b.d)[0].h;
    return { ...(best.object.userData as ScenePick) };
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.activePointers++;
    this.pointerStart =
      this.activePointers === 1
        ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
        : undefined;
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.activePointers = Math.max(0, this.activePointers - 1);
    const start = this.pointerStart;
    this.pointerStart = undefined;
    if (!start || start.id !== e.pointerId || e.button > 0) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > TAP_MAX_MOVE || performance.now() - start.t > TAP_MAX_MS) return;
    this.onPick?.(this.pick(e.clientX, e.clientY));
  };

  private onPointerCancel = (): void => {
    this.activePointers = Math.max(0, this.activePointers - 1);
    this.pointerStart = undefined;
  };

  /** Con ratón, el cursor indica qué se puede accionar. */
  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse" || e.buttons) return;
    this.renderer.domElement.style.cursor = this.pick(e.clientX, e.clientY) ? "pointer" : "";
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerCancel);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    window.clearInterval(this.sunTimer);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mat = m.material as Material | Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}

/* ==================================================================== */

function brightness(st: HassEntity | undefined): number {
  const b = st?.attributes.brightness;
  return typeof b === "number" ? Math.max(0.08, b / 255) : 1;
}

function lightColor(st: HassEntity | undefined): Color {
  const rgb = st?.attributes.rgb_color;
  if (Array.isArray(rgb) && rgb.length === 3) {
    const c = new Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    // Los colores de HA están en sRGB; three trabaja en espacio lineal.
    return c.convertSRGBToLinear();
  }
  return WARM_WHITE.clone();
}

function coverPosition(st: HassEntity | undefined): number | undefined {
  if (!st || st.state === "unavailable" || st.state === "unknown") return undefined;
  const p = st.attributes.current_position;
  if (typeof p === "number") return p;
  return st.state === "closed" ? 0 : 100;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Rejilla de 1 m alrededor de la parcela (sin entrar en ella, para no verse a través del agua). */
function makeGrid(half: number, plot: Point[]): LineSegments<BufferGeometry, LineBasicMaterial> {
  const xs = plot.map((p) => p[0]);
  const zs = plot.map((p) => p[1]);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const v: number[] = [];
  const line = (a: number, b: number, k: number, alongX: boolean) => {
    if (b - a <= 0) return;
    if (alongX) v.push(a, 0, k, b, 0, k);
    else v.push(k, 0, a, k, 0, b);
  };
  for (let k = -half; k <= half; k++) {
    // Líneas paralelas a Z (x = k) y a X (z = k), cortadas en el rectángulo de la parcela
    if (k > minX && k < maxX) {
      line(-half, minZ, k, false);
      line(maxZ, half, k, false);
    } else line(-half, half, k, false);
    if (k > minZ && k < maxZ) {
      line(-half, minX, k, true);
      line(maxX, half, k, true);
    } else line(-half, half, k, true);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(v, 3));
  return new LineSegments(g, new LineBasicMaterial({ transparent: true }));
}

/* Formas en planta: ShapeGeometry trabaja en XY; al tumbarla, Y del dibujo pasa a ser -Z. */
function polygonShape(points: Point[]): Shape {
  return new Shape(points.map(([x, z]) => new Vector2(x, -z)));
}
function polygonPath(points: Point[]): Path {
  return new Path(points.map(([x, z]) => new Vector2(x, -z)));
}
const rectPoints = ([x1, z1, x2, z2]: Rect): Point[] => [
  [x1, z1],
  [x2, z1],
  [x2, z2],
  [x1, z2],
];
const rectShape = (r: Rect) => polygonShape(rectPoints(r));
const rectPath = (r: Rect) => polygonPath(rectPoints(r));
function groundGeometry(shape: Shape): ShapeGeometry {
  const g = new ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  return g;
}

function makeGlowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/** Textura de lamas verticales para la valla y las puertas. */
function makeBarTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 4;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 16, 4);
  g.fillStyle = "#6a6a6a";
  g.fillRect(12, 0, 4, 4);
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Textura de lamas horizontales para las persianas. */
function makeSlatTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 8, 32);
  const grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, "rgba(0,0,0,0.0)");
  grad.addColorStop(0.75, "rgba(0,0,0,0.18)");
  grad.addColorStop(0.92, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0.0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 32);
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
