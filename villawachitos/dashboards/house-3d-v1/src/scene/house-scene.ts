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
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

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
  PORCH,
  PUMP,
  ENERGY,
  PEDESTRIAN_GATE,
  TV,
  SOFA,
  FRIDGE,
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

/** Ondas de luz que salen de cada luz encendida: periodo (s), ondas simultáneas y fps máximos de la animación. */
const WAVE_PERIOD = 2.6;
const WAVES_PER_EMITTER = 2;
const ANIMATION_FPS = 30;
const PUMP_ON_COLOR = new Color(0x3dffa8);

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
  downlights: 30,
  pendant: 14,
  lamp: 4,
  strip: 6,
  wall: 7,
  pool: 22,
};
const LAMP_RANGE: Record<Lamp["kind"], number> = {
  ceiling: 12,
  downlights: 12,
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
  /** Material compartido por todas las piezas de la luminaria (varios downlights = una luz) */
  bulbMaterial: MeshStandardMaterial;
  glowMaterial: SpriteMaterial;
  glows: Sprite[];
  waves: WaveEmitter[];
  /** Centro de la luminaria (para el enfoque de la cámara) */
  center: Vector3;
  on: boolean;
  level: number;
}

/** Ondas que se expanden y desvanecen en bucle mientras el elemento está encendido. */
interface WaveEmitter {
  sprites: Sprite[];
  /** Tamaño máximo de la onda [ancho, alto] */
  size: [number, number];
  active: boolean;
  strength: number;
  /** Desfase para que no latan todas a la vez */
  offset: number;
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
  kind: "light" | "cover" | "switch" | "media";
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
  private outdoorMaterials: Record<"lawn" | "paving" | "water" | "basin" | "stone", MeshStandardMaterial> =
    {} as never;
  private waveTexture = makeRingTexture();
  private emitters: WaveEmitter[] = [];
  private lastAnimationFrame = 0;
  private energy!: {
    socBar: Mesh<BoxGeometry, MeshStandardMaterial>;
    socHeight: number;
    socBase: number;
    led: MeshStandardMaterial;
    waves: WaveEmitter;
    label: HTMLDivElement;
    html: string;
    producing: boolean | undefined;
  };
  private fridge!: {
    led: MeshStandardMaterial;
    waves: WaveEmitter;
    label: HTMLDivElement;
    html: string;
    open: boolean | undefined;
  };
  private tv!: {
    on: boolean | undefined;
    screen: Mesh<PlaneGeometry, Material>;
    offMaterial: MeshStandardMaterial;
    onMaterial: MeshBasicMaterial;
    ctx: CanvasRenderingContext2D;
    texture: CanvasTexture;
    light: PointLight;
    title: string;
    lastDraw: number;
  };
  private pump!: {
    on: boolean | undefined;
    edge: MeshStandardMaterial;
    waves: WaveEmitter;
    label: HTMLDivElement;
    point: Vector3;
  };
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
      const material = tone === "glass" ? this.glassMaterial : this.furnitureMaterials[tone];
      const mesh = new Mesh(new BoxGeometry(w, h, d), material);
      mesh.position.set(x, y0 + h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      s.add(mesh);
    };
    for (const f of FURNITURE) {
      const [w, h, d] = f.size;
      const top = f.top ? 0.04 : 0;
      const base = 0.02 + (f.lift ?? 0);
      block(f.at[0], f.at[1], base, [w, h - top, d], f.tone ?? "light");
      if (f.top) block(f.at[0], f.at[1], base + h - top, [w + 0.03, top, d + 0.03], f.top);
    }

    this.buildEnergy();
    this.buildTv();
    this.buildSofa();
    this.buildFridge();

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
    // Mismo acabado que el suelo de la casa, pero iluminado (de noche se oscurece como el resto del exterior)
    o.stone = new MeshStandardMaterial({ roughness: 0.8 });

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

    // Coronación de la piscina (con el hueco del vaso), porche y resto de pavimentos
    const deck = rectShape(POOL_DECK);
    deck.holes.push(rectPath(POOL.rect));
    flat(deck, o.stone, 0.03);
    flat(rectShape(PORCH), o.stone, 0.012);
    for (const r of PAVING) flat(rectShape(r), o.paving, 0.01);

    this.buildPump();

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
    // Tras las puertas de los vehículos: valla, puerta peatonal y valla hasta la esquina
    const lastGate = GATES[GATES.length - 1];
    panel(lastGate.to, PEDESTRIAN_GATE.from, 0.08);
    panel(PEDESTRIAN_GATE.to, PLOT[1], 0.08);
    this.buildPedestrianGate(panel);
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
  }

  /** Puerta peatonal: hoja de lamas entre dos postes, con tirador (sin sensor por ahora). */
  private buildPedestrianGate(panel: (from: Point, to: Point, thickness: number) => Mesh): void {
    const { from, to } = PEDESTRIAN_GATE;
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    const ux = dx / length;
    const uz = dz / length;
    // La hoja deja 5 cm a cada lado para los postes
    const leaf = panel(
      [from[0] + ux * 0.05, from[1] + uz * 0.05],
      [to[0] - ux * 0.05, to[1] - uz * 0.05],
      0.05,
    );
    leaf.scale.y = 0.97;
    leaf.position.y = (FENCE_HEIGHT * 0.97) / 2;
    const post = (p: Point) => {
      const m = new Mesh(new BoxGeometry(0.08, FENCE_HEIGHT + 0.08, 0.08), this.frameMaterial);
      m.position.set(p[0], (FENCE_HEIGHT + 0.08) / 2, p[1]);
      m.rotation.y = -Math.atan2(dz, dx);
      m.castShadow = true;
      this.scene.add(m);
    };
    post(from);
    post(to);
    // Tirador hacia dentro de la parcela
    const handle = new Mesh(
      new BoxGeometry(0.03, 0.18, 0.05),
      new MeshStandardMaterial({ color: 0xa7adb5, metalness: 0.7, roughness: 0.3 }),
    );
    handle.position.set(to[0] - ux * 0.15 - uz * 0.06, 1.05, to[1] - uz * 0.15 + ux * 0.06);
    handle.rotation.y = -Math.atan2(dz, dx);
    this.scene.add(handle);
  }

  /**
   * Sofá en U con forma reconocible: zócalo, cojines de asiento separados, respaldos con cojines
   * y brazos en los extremos abiertos. Piezas redondeadas en el color beige del sofá.
   */
  private buildSofa(): void {
    const [x1, z1, x2, z2] = SOFA.rect;
    const d = SOFA.depth;
    const fabric = this.furnitureMaterials.sofa;
    const base = new MeshStandardMaterial({ color: 0xb9ab92, roughness: 0.9 });
    const back = 0.2;
    const seatTop = 0.44;
    const add = (
      cx: number,
      cz: number,
      y0: number,
      w: number,
      h: number,
      dd: number,
      mat: Material,
      r = 0.05,
    ) => {
      const m = new Mesh(new RoundedBoxGeometry(w, h, dd, 3, Math.min(r, w / 2, h / 2, dd / 2)), mat);
      m.position.set(cx, y0 + h / 2, cz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    // Zócalo bajo todo el sofá (algo metido hacia dentro)
    const plinth = (ax: number, az: number, bx: number, bz: number) =>
      add((ax + bx) / 2, (az + bz) / 2, 0.02, bx - ax - 0.06, 0.1, bz - az - 0.06, base, 0.02);
    plinth(x1, z1, x1 + d, z2);
    plinth(x1 + d, z1, x2, z1 + d);
    plinth(x1 + d, z2 - d, x2, z2);

    // Respaldos por el exterior de la U
    add(x1 + back / 2, (z1 + z2) / 2, 0.12, back, 0.7, z2 - z1, fabric, 0.06);
    add((x1 + x2) / 2, z1 + back / 2, 0.12, x2 - x1, 0.7, back, fabric, 0.06);
    add((x1 + x2) / 2, z2 - back / 2, 0.12, x2 - x1, 0.7, back, fabric, 0.06);

    // Brazos en los extremos abiertos (hacia la TV)
    const arm = 0.2;
    add(x2 - arm / 2, z1 + d / 2, 0.12, arm, 0.5, d, fabric, 0.06);
    add(x2 - arm / 2, z2 - d / 2, 0.12, arm, 0.5, d, fabric, 0.06);

    // Cojines de asiento con una pequeña separación entre ellos
    const gap = 0.025;
    const seatH = seatTop - 0.12;
    const cushionsAlong = (ax: number, az: number, bx: number, bz: number, n: number, alongX: boolean) => {
      for (let i = 0; i < n; i++) {
        if (alongX) {
          const len = (bx - ax) / n;
          add(ax + len * (i + 0.5), (az + bz) / 2, 0.12, len - gap, seatH, bz - az - gap, fabric, 0.07);
        } else {
          const len = (bz - az) / n;
          add((ax + bx) / 2, az + len * (i + 0.5), 0.12, bx - ax - gap, seatH, len - gap, fabric, 0.07);
        }
      }
    };
    cushionsAlong(x1 + back, z1 + back, x1 + d, z2 - back, 4, false);
    cushionsAlong(x1 + d, z1 + back, x2 - arm, z1 + d, 2, true);
    cushionsAlong(x1 + d, z2 - d, x2 - arm, z2 - back, 2, true);

    // Cojines de respaldo apoyados (un poco inclinados hacia el asiento)
    const backCushion = (cx: number, cz: number, w: number, dd: number, tiltX: number, tiltZ: number) => {
      const m = new Mesh(new RoundedBoxGeometry(w, 0.38, dd, 3, 0.07), fabric);
      m.position.set(cx, seatTop + 0.19, cz);
      m.rotation.set(tiltZ, 0, tiltX);
      m.castShadow = true;
      this.scene.add(m);
    };
    const westLen = (z2 - z1 - 2 * back) / 4;
    for (let i = 0; i < 4; i++)
      backCushion(x1 + back + 0.08, z1 + back + westLen * (i + 0.5), 0.16, westLen - gap, -0.18, 0);
    const armLen = (x2 - arm - (x1 + d)) / 2;
    for (let i = 0; i < 2; i++) {
      const cx = x1 + d + armLen * (i + 0.5);
      backCushion(cx, z1 + back + 0.08, armLen - gap, 0.16, 0, 0.18);
      backCushion(cx, z2 - back - 0.08, armLen - gap, 0.16, 0, -0.18);
    }
    // Un par de cojines decorativos en las esquinas
    const pillow = new MeshStandardMaterial({ color: 0x9c8466, roughness: 0.95 });
    add(x1 + back + 0.25, z1 + back + 0.25, seatTop, 0.42, 0.36, 0.14, pillow, 0.06);
    add(x1 + back + 0.25, z2 - back - 0.25, seatTop, 0.42, 0.36, 0.14, pillow, 0.06);
  }

  /** Frigorífico integrado: columna con frente de madera, tirador y piloto de puerta, más sus datos. */
  private buildFridge(): void {
    const [fx, fz] = FRIDGE.at;
    const [w, h, d] = FRIDGE.size;
    const body = new Mesh(new BoxGeometry(w, h, d - 0.02), this.furnitureMaterials.wood);
    body.position.set(fx, 0.02 + h / 2, fz);
    body.castShadow = true;
    body.receiveShadow = true;
    this.scene.add(body);
    // Juntas del frente (frigorífico arriba, congelador abajo) y tiradores, mirando a la cocina (+X)
    const front = fx + w / 2 + 0.006;
    const seam = new Mesh(new BoxGeometry(0.01, 0.012, d - 0.04), this.frameMaterial);
    seam.position.set(front, 0.86, fz);
    this.scene.add(seam);
    const steel = this.furnitureMaterials.steel;
    for (const [y, len] of [
      [1.45, 0.6],
      [0.6, 0.35],
    ]) {
      const handle = new Mesh(new BoxGeometry(0.03, len, 0.025), steel);
      handle.position.set(front + 0.01, y, fz + d / 2 - 0.08);
      this.scene.add(handle);
    }
    // Piloto: verde con la puerta cerrada, rojo si está abierta
    const led = new MeshStandardMaterial({ color: 0x000000, emissive: 0x3dffa8, emissiveIntensity: 1.2 });
    const ledMesh = new Mesh(new BoxGeometry(0.01, 0.03, 0.12), led);
    ledMesh.position.set(front + 0.004, 1.95, fz);
    this.scene.add(ledMesh);
    const waves = this.makeEmitter(new Vector3(front + 0.2, 1.4, fz), [1.6, 1.6], 0.83);

    const label = document.createElement("div");
    label.className = "fridge-label";
    const tag = new CSS2DObject(label);
    // Fuera del muro oeste, como el resto de indicadores, para no tapar la cocina
    tag.position.set(-8.4, 0.2, fz);
    this.scene.add(tag);
    this.fridge = { led, waves, label, html: "", open: undefined };
  }

  private updateFridge(hass: HomeAssistant, changed: Vector3[]): void {
    const S = FRIDGE.sensors;
    const num = (id: string) => {
      const v = Number(hass.states[id]?.state);
      return Number.isFinite(v) ? v : undefined;
    };
    const deg = (v: number | undefined) => (v === undefined ? "—" : `${Math.round(v)} °C`);
    const fridge = num(S.fridge);
    const freezer = num(S.freezer);
    const fridgeTarget = num(S.fridgeTarget);
    const freezerTarget = num(S.freezerTarget);
    const open = hass.states[S.door]?.state === "on";
    const f = this.fridge;
    if (open !== f.open) {
      if (f.open !== undefined) changed.push(new Vector3(FRIDGE.at[0], 1.4, FRIDGE.at[1]));
      f.open = open;
      f.led.emissive.set(open ? 0xff5c7a : 0x3dffa8);
      this.setEmitter(f.waves, open, new Color(0xff5c7a), 0.9);
      this.dirty = true;
    }
    const target = (v: number | undefined) => (v === undefined ? "" : `<span>obj. ${Math.round(v)}°</span>`);
    const html =
      `<div class="row"><i class="cold"></i>Frigorífico<b>${deg(fridge)}</b>${target(fridgeTarget)}</div>` +
      `<div class="row"><i class="ice"></i>Congelador<b>${deg(freezer)}</b>${target(freezerTarget)}</div>` +
      `<div class="row door ${open ? "open" : ""}"><i></i>Puerta<b>${open ? "ABIERTA" : "cerrada"}</b></div>`;
    if (html !== f.html) {
      f.html = html;
      f.label.innerHTML = html;
      f.label.classList.toggle("alert", open);
    }
  }

  /** TV de 85" en la pared este del salón: pantalla animada cuando está encendida y accionable. */
  private buildTv(): void {
    const { width: w, height: h, lift } = TV;
    const [x, z] = TV.at;
    const y = lift + h / 2;
    const body = new Mesh(new BoxGeometry(0.04, h + 0.03, w + 0.03), this.frameMaterial);
    body.position.set(x, y, z);
    body.castShadow = true;
    this.scene.add(body);

    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 216;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const offMaterial = new MeshStandardMaterial({ color: 0x06070a, roughness: 0.15, metalness: 0.6 });
    const onMaterial = new MeshBasicMaterial({ map: texture, toneMapped: false });
    const screen = new Mesh<PlaneGeometry, Material>(new PlaneGeometry(w, h), offMaterial);
    // El plano mira a +Z; girado -90° mira al oeste, hacia el sofá.
    screen.rotation.y = -Math.PI / 2;
    screen.position.set(x - 0.022, y, z);
    this.scene.add(screen);

    // Reflejo de la pantalla en el salón
    const light = new PointLight(0x8fb4ff, 0, 5.5, 2);
    light.position.set(x - 0.6, y, z);
    light.visible = false;
    this.scene.add(light);

    this.tv = {
      on: undefined,
      screen,
      offMaterial,
      onMaterial,
      ctx: canvas.getContext("2d")!,
      texture,
      light,
      title: "",
      lastDraw: 0,
    };
    const hit = this.addHitTarget(new BoxGeometry(0.3, h + 0.2, w + 0.2), "media", TV.entity);
    hit.position.set(x - 0.1, y, z);
  }

  /** Imagen esquemática en pantalla: fondo de color en movimiento, ondas, ecualizador y título. */
  private drawTv(time: number): void {
    const { ctx, title } = this.tv;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const hue = (time * 18) % 360;
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, `hsl(${hue} 70% 22%)`);
    bg.addColorStop(1, `hsl(${(hue + 70) % 360} 75% 12%)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Ondas
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const yy = H * 0.5 + Math.sin(x / (38 + k * 14) + time * (1.4 + k * 0.5)) * (16 + k * 9);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = `hsla(${(hue + 40 * k + 180) % 360} 90% 70% / ${0.55 - k * 0.12})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // Ecualizador
    const bars = 24;
    const bw = W / bars;
    for (let i = 0; i < bars; i++) {
      const v = 0.25 + 0.75 * Math.abs(Math.sin(time * 3.1 + i * 0.7) * Math.cos(time * 1.7 + i * 0.31));
      ctx.fillStyle = `hsla(${(hue + i * 6) % 360} 95% 65% / 0.75)`;
      ctx.fillRect(i * bw + 2, H - v * H * 0.28 - 8, bw - 4, v * H * 0.28);
    }
    // Título del contenido o fuente
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(`▶ ${title}`.slice(0, 34), 12, 17);
    this.tv.texture.needsUpdate = true;
  }

  private updateTv(hass: HomeAssistant, changed: Vector3[]): void {
    const st = hass.states[TV.entity];
    const on = !!st && !["off", "unavailable", "unknown", "standby"].includes(st.state);
    const a = st?.attributes ?? {};
    this.tv.title = String(a.media_title ?? a.app_name ?? a.source ?? "TV");
    if (on === this.tv.on) return;
    if (this.tv.on !== undefined) changed.push(new Vector3(TV.at[0], TV.lift + TV.height / 2, TV.at[1]));
    this.tv.on = on;
    this.tv.screen.material = on ? this.tv.onMaterial : this.tv.offMaterial;
    this.tv.light.visible = on;
    this.tv.light.intensity = on ? 5 : 0;
    if (on) this.drawTv(this.clock.elapsedTime);
    this.dirty = true;
  }

  /** Baterías e inversor en el lavadero, con un indicador de nivel de carga y los datos solares. */
  private buildEnergy(): void {
    const { battery, inverter } = ENERGY;
    const casing = new MeshStandardMaterial({ color: 0xe9eaee, roughness: 0.45, metalness: 0.1 });
    const dark = new MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5 });
    const [bw, bh, bd] = battery.size;
    const [bx, bz] = battery.at;
    // Torre de módulos apilados con una junta oscura entre ellos
    const moduleH = bh / battery.modules;
    for (let i = 0; i < battery.modules; i++) {
      const m = new Mesh(new BoxGeometry(bw, moduleH - 0.02, bd), casing);
      m.position.set(bx, 0.02 + i * moduleH + (moduleH - 0.02) / 2, bz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    // Barra de nivel en el frente (hacia el sur): su altura es el % de carga
    const socHeight = bh - 0.1;
    const socBase = 0.07;
    const socBar = new Mesh(
      new BoxGeometry(0.08, 1, 0.02),
      new MeshStandardMaterial({ color: 0x000000, emissive: PUMP_ON_COLOR, emissiveIntensity: 1.1 }),
    );
    socBar.position.set(bx, socBase, bz + bd / 2 + 0.011);
    socBar.visible = false;
    this.scene.add(socBar);
    const track = new Mesh(new BoxGeometry(0.1, socHeight, 0.01), dark);
    track.position.set(bx, socBase + socHeight / 2, bz + bd / 2 + 0.004);
    this.scene.add(track);

    // Inversor en la pared, con su piloto de estado
    const [iw, ih, id] = inverter.size;
    const [ix, iz] = inverter.at;
    const inv = new Mesh(new BoxGeometry(iw, ih, id), dark);
    inv.position.set(ix, inverter.lift + ih / 2, iz);
    inv.castShadow = true;
    this.scene.add(inv);
    const led = new MeshStandardMaterial({ color: 0x555a63 });
    const ledMesh = new Mesh(new BoxGeometry(iw * 0.6, 0.03, 0.01), led);
    ledMesh.position.set(ix, inverter.lift + ih * 0.78, iz + id / 2 + 0.006);
    this.scene.add(ledMesh);
    const waves = this.makeEmitter(new Vector3(ix, inverter.lift + ih / 2, iz + 0.15), [1.6, 1.6], 0.61);

    const label = document.createElement("div");
    label.className = "energy-label";
    const tag = new CSS2DObject(label);
    // Fuera, junto al muro oeste del lavadero, para no tapar las baterías desde la vista inicial.
    tag.position.set(-9.9, 0.2, bz + 0.9);
    this.scene.add(tag);
    this.energy = { socBar, socHeight, socBase, led, waves, label, html: "", producing: undefined };
  }

  private updateEnergy(hass: HomeAssistant): void {
    const e = this.energy;
    const S = ENERGY.sensors;
    const read = (id: string) => {
      const v = Number(hass.states[id]?.state);
      return Number.isFinite(v) ? v : undefined;
    };
    const pv = read(S.pv);
    const soc = read(S.soc);
    const batt = read(S.battery);
    const load = read(S.load);
    const grid = read(S.grid);

    if (soc !== undefined) {
      const h = Math.max(0.02, (soc / 100) * e.socHeight);
      e.socBar.scale.y = h;
      e.socBar.position.y = e.socBase + h / 2;
      e.socBar.visible = true;
      // Verde con carga alta, ámbar a media, rojo cuando queda poca
      e.socBar.material.emissive.set(soc > 50 ? 0x3dffa8 : soc > 20 ? 0xffb547 : 0xff5c7a);
    } else e.socBar.visible = false;

    const producing = (pv ?? 0) > 0.05;
    if (producing !== e.producing) {
      e.producing = producing;
      const sun = new Color(0xffc23d);
      e.led.emissive.copy(producing ? sun : new Color(0x000000));
      e.led.emissiveIntensity = producing ? 2 : 0;
      e.led.color.set(producing ? 0xffffff : 0x555a63);
      this.setEmitter(e.waves, producing, sun, 0.6);
    }

    const kw = (v: number | undefined) =>
      v === undefined
        ? "—"
        : `${v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kW`;
    const battFlow =
      batt === undefined || Math.abs(batt) < 0.05
        ? ""
        : `<span class="${batt > 0 ? "in" : "out"}">${batt > 0 ? "▲" : "▼"} ${kw(Math.abs(batt))}</span>`;
    // Sigenergy: red positiva = vertiendo excedentes, negativa = comprando
    const gridFlow =
      grid === undefined || Math.abs(grid) < 0.05
        ? ""
        : `<span class="${grid > 0 ? "in" : "out"}">${grid > 0 ? "exportando" : "importando"}</span>`;
    const html =
      `<div class="row sun"><i></i>Solar<b>${kw(pv)}</b></div>` +
      `<div class="row bat"><i></i>Batería<b>${soc === undefined ? "—" : `${Math.round(soc)} %`}</b>${battFlow}</div>` +
      `<div class="row load"><i></i>Casa<b>${kw(load)}</b></div>` +
      `<div class="row grid"><i></i>Red<b>${kw(grid === undefined ? undefined : Math.abs(grid))}</b>${gridFlow}</div>`;
    if (html !== e.html) {
      e.html = html;
      e.label.innerHTML = html;
    }
    this.dirty = true;
  }

  /** Caseta enterrada de la depuradora: tapa de césped que asoma 10 cm, borde luminoso e indicador. */
  private buildPump(): void {
    const [x1, z1, x2, z2] = PUMP.rect;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const h = PUMP.height;
    const lid = new Mesh(new BoxGeometry(x2 - x1, h, z2 - z1), this.outdoorMaterials.lawn);
    lid.position.set(cx, h / 2, cz);
    lid.castShadow = true;
    lid.receiveShadow = true;
    this.scene.add(lid);
    // Borde de 3 cm alrededor de la tapa: se ilumina en verde con la depuradora en marcha.
    const edge = new MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5 });
    const frame = new Mesh(new BoxGeometry(x2 - x1 + 0.06, h - 0.02, z2 - z1 + 0.06), edge);
    frame.position.set(cx, (h - 0.02) / 2, cz);
    this.scene.add(frame);

    const waves = this.makeEmitter(new Vector3(cx, h + 0.05, cz), [3.2, 3.2], 0.37);
    const label = document.createElement("div");
    label.className = "pump-label";
    const tag = new CSS2DObject(label);
    // Etiqueta justo por encima (hacia la casa) para no tapar la caseta.
    tag.position.set(cx, 0.15, z1 - 0.45);
    this.scene.add(tag);
    this.pump = { on: undefined, edge, waves, label, point: new Vector3(cx, h, cz) };
    this.renderPumpLabel(false, undefined);

    const hit = this.addHitTarget(new BoxGeometry(x2 - x1 + 0.6, 0.6, z2 - z1 + 0.6), "switch", PUMP.entity);
    hit.position.set(cx, 0.2, cz);
  }

  private renderPumpLabel(on: boolean, watts: number | undefined, unavailable = false): void {
    const el = this.pump.label;
    el.classList.toggle("on", on);
    el.classList.toggle("unavailable", unavailable);
    const status = unavailable
      ? "sin conexión"
      : on
        ? watts !== undefined
          ? `${Math.round(watts)} W`
          : "en marcha"
        : "parada";
    el.innerHTML = `<span class="dot"></span>Depuradora <b>${status}</b>`;
  }

  /** Crea un emisor de ondas de luz (anillos que crecen y se desvanecen) en `at`. */
  private makeEmitter(at: Vector3, size: [number, number], offset: number): WaveEmitter {
    const sprites: Sprite[] = [];
    for (let i = 0; i < WAVES_PER_EMITTER; i++) {
      const sprite = new Sprite(
        new SpriteMaterial({
          map: this.waveTexture,
          blending: AdditiveBlending,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        }),
      );
      sprite.position.copy(at);
      sprite.visible = false;
      this.scene.add(sprite);
      sprites.push(sprite);
    }
    const emitter: WaveEmitter = { sprites, size, active: false, strength: 1, offset };
    this.emitters.push(emitter);
    return emitter;
  }

  private setEmitter(e: WaveEmitter, active: boolean, color: Color, strength: number): void {
    e.active = active;
    e.strength = strength;
    for (const sp of e.sprites) {
      sp.visible = active;
      sp.material.color.copy(color);
    }
  }

  /** Avanza las ondas y el "respirar" de los halos; devuelve true si hay algo animándose. */
  private animateLights(time: number): boolean {
    let any = false;
    for (const e of this.emitters) {
      if (!e.active) continue;
      any = true;
      e.sprites.forEach((sp, i) => {
        const phase = (time / WAVE_PERIOD + e.offset + i / e.sprites.length) % 1;
        const grow = 0.25 + 0.75 * phase;
        sp.scale.set(e.size[0] * grow, e.size[1] * grow, 1);
        sp.material.opacity = 0.7 * e.strength * (1 - phase) * (1 - phase);
      });
    }
    // La pantalla de la TV se redibuja a ~12 fps (suficiente para una animación esquemática)
    if (this.tv.on) {
      any = true;
      if (time - this.tv.lastDraw > 1 / 12) {
        this.tv.lastDraw = time;
        this.drawTv(time);
      }
    }
    for (const l of this.lamps) {
      if (!l.on) continue;
      const breath = 0.88 + 0.12 * Math.sin(time * 2.4 + l.waves[0].offset * Math.PI * 2);
      l.glowMaterial.opacity = (0.35 + 0.65 * l.level) * breath;
    }
    return any;
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
    const center = new Vector3(x, y, z);
    const light = new PointLight(WARM_WHITE, 0, LAMP_RANGE[def.kind], 2);
    light.position.set(x, def.kind === "ceiling" || def.kind === "downlights" ? y - 0.2 : y, z);
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
    } else if (def.kind === "downlights") {
      geometry = new CylinderGeometry(0.07, 0.07, 0.025, 20);
    } else if (def.kind === "wall") {
      geometry = new BoxGeometry(0.16, 0.16, 0.16);
    } else {
      geometry = new SphereGeometry(def.kind === "pendant" ? 0.14 : 0.08, 16, 12);
    }
    const bulbMaterial = new MeshStandardMaterial({ color: 0x222831, roughness: 0.4 });
    const glowMaterial = new SpriteMaterial({
      map: glowTexture,
      color: WARM_WHITE,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const size =
      def.kind === "ceiling" || def.kind === "pool"
        ? 1.6
        : def.kind === "downlights"
          ? 0.9
          : def.kind === "strip"
            ? (def.strip?.length ?? 1) * 0.9
            : 0.9;
    // Ondas: anillos en torno a la luz (alargados en las tiras; sobre el agua en la piscina).
    const waveSize: [number, number] =
      def.kind === "strip"
        ? [(def.strip?.length ?? 1) * 1.25, 0.9]
        : def.kind === "pool"
          ? [4.2, 4.2]
          : def.kind === "ceiling"
            ? [2.2, 2.2]
            : def.kind === "downlights"
              ? [1.2, 1.2]
              : [1.4, 1.4];
    const offset = (this.lamps.length * 0.137) % 1;

    // Una luminaria normal tiene un punto; los downlights, uno por foco (todos la misma entidad).
    const points: Vector3[] = def.spots ? def.spots.map(([sx, sz]) => new Vector3(sx, y, sz)) : [center];
    const glows: Sprite[] = [];
    const waves: WaveEmitter[] = [];
    points.forEach((p, i) => {
      const bulb = new Mesh(geometry, bulbMaterial);
      bulb.position.copy(p);
      this.scene.add(bulb);

      const glow = new Sprite(glowMaterial);
      glow.position.copy(p);
      glow.scale.set(size, def.kind === "strip" ? 0.6 : size, 1);
      glow.visible = false;
      this.scene.add(glow);
      glows.push(glow);

      // Zona táctil: esfera generosa (o caja a lo largo de la tira) para acertar con el dedo.
      const hitGeometry =
        def.kind === "strip" && def.strip
          ? def.strip.axis === "x"
            ? new BoxGeometry(def.strip.length, 0.45, 0.45)
            : new BoxGeometry(0.45, 0.45, def.strip.length)
          : new SphereGeometry(def.kind === "ceiling" ? 0.5 : 0.4, 16, 12);
      const hit = this.addHitTarget(hitGeometry, "light", def.entity);
      hit.position.copy(p);
      if (def.kind === "pool") {
        // La luz de la piscina se acciona tocando cualquier punto del agua.
        const [px1, pz1, px2, pz2] = POOL.rect;
        hit.geometry.dispose();
        hit.geometry = new BoxGeometry(px2 - px1, 0.3, pz2 - pz1);
        hit.position.set((px1 + px2) / 2, -0.05, (pz1 + pz2) / 2);
      }

      const waveAt =
        def.kind === "pool"
          ? new Vector3((POOL.rect[0] + POOL.rect[2]) / 2, 0.1, (POOL.rect[1] + POOL.rect[3]) / 2)
          : p.clone();
      waves.push(this.makeEmitter(waveAt, waveSize, (offset + i * 0.25) % 1));
    });

    return { def, light, bulbMaterial, glowMaterial, glows, waves, center, on: false, level: 0 };
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
        for (const g of lamp.glows) g.visible = on;
        lamp.glowMaterial.color.copy(color);
        lamp.glowMaterial.opacity = 0.35 + 0.65 * level;
        const m = lamp.bulbMaterial;
        m.emissive.copy(on ? color : new Color(0x000000));
        m.emissiveIntensity = on ? 1.5 + 2 * level : 0;
        m.color.set(on ? 0xffffff : this.palette.fixture);
        for (const w of lamp.waves) this.setEmitter(w, on, color, 0.45 + 0.55 * level);
        this.dirty = true;
        changed.push(lamp.center.clone());
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

    this.updateEnergy(hass);
    this.updateTv(hass, changed);
    this.updateFridge(hass, changed);

    const pumpState = hass.states[PUMP.entity];
    const pumpOn = pumpState?.state === "on";
    const watts = Number(hass.states[PUMP.power]?.state);
    if (pumpOn !== this.pump.on) {
      if (this.pump.on !== undefined) changed.push(this.pump.point.clone());
      this.pump.on = pumpOn;
      this.pump.edge.emissive.copy(pumpOn ? PUMP_ON_COLOR : new Color(0x000000));
      this.pump.edge.emissiveIntensity = pumpOn ? 2.2 : 0;
      this.pump.edge.color.set(pumpOn ? 0xffffff : 0x2a2d33);
      this.setEmitter(this.pump.waves, pumpOn, PUMP_ON_COLOR, 0.8);
      this.dirty = true;
    }
    this.renderPumpLabel(
      pumpOn,
      Number.isFinite(watts) ? watts : undefined,
      !pumpState || pumpState.state === "unavailable",
    );

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
      .filter(
        (l) => l.on && (l.def.kind === "ceiling" || l.def.kind === "downlights" || l.def.kind === "pendant"),
      )
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
    this.outdoorMaterials.stone.color.set(p.floor);
    for (const m of this.fenceClones) m.color.set(p.fence);
    for (const sh of this.shutters) sh.mesh.material.color.set(p.shutter);
    for (const l of this.lamps) if (!l.on) l.bulbMaterial.color.set(p.fixture);
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

    // Las luces encendidas se animan siempre, pero a 30 fps como mucho para no agotar la tablet.
    const now = performance.now();
    if (now - this.lastAnimationFrame >= 1000 / ANIMATION_FPS) {
      if (this.animateLights(this.clock.elapsedTime)) {
        this.lastAnimationFrame = now;
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

/** Anillo suave para las ondas de luz. */
function makeRingTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.68, "rgba(255,255,255,0)");
  grad.addColorStop(0.84, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.9, "rgba(255,255,255,0.35)");
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
