/**
 * Maqueta 3D "tranquila" de la casa para Functional v1.
 *
 * Parte del mismo plano que House 3D v1 (`plan.ts`) y de su escena, pero pensada como imagen
 * de fondo del panel: sin gestos (la cámara la mueve el panel al entrar en cada estancia),
 * sin etiquetas ni ondas, con muros cortados a media altura para ver el interior (casa de
 * muñecas), parcela en forma de maqueta sobre una losa de tierra y materiales reales
 * (texturas CC0 de ambientCG en `public/textures`). El fondo es transparente: se ve el fondo
 * del panel detrás.
 */
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Clock,
  Color,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  PointLight,
  RepeatWrapping,
  Path,
  Scene,
  ShadowMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import type { HassEntity, HomeAssistant } from "../types";
import { sunLight, sunPosition } from "../../../house-3d-v1/src/lib/solar";
import {
  ENERGY,
  EXTERIOR_THICKNESS,
  FENCE_HEIGHT,
  FRIDGE,
  FURNITURE,
  GATES,
  INTERIOR_THICKNESS,
  LAMPS,
  NORTH_ANGLE,
  PAINTING,
  PARKING_CONCRETE,
  PAVING,
  PEDESTRIAN_GATE,
  PRINTER,
  PLOT,
  POOL,
  POOL_DECK,
  PORCH,
  PUMP,
  ROOMS,
  SOFA,
  TOWEL_RAILS,
  TV,
  VACUUM,
  WALLS,
  WASHER,
  YARD_FENCE,
  type FurnitureTone,
  type Gate,
  type Lamp,
  type Opening,
  type Point,
  type Rect,
  type Wall,
} from "../../../house-3d-v1/src/scene/plan";

/** Altura a la que se cortan los muros (casa de muñecas). */
export const CUT3D = 1.45;
/** Grosor de la losa de tierra bajo la parcela. */
const SLAB = 0.7;
const SHUTTER_SPEED = 0.35;
const GATE_SPEED = 0.3;
const PLOT_CENTER = new Vector3(-0.4, 0, 2.6);
/** Vista de siempre: desde el sur, casi de frente, 50° de elevación (ángulos en radianes). */
export const BASE_VIEW = { yaw: Math.atan2(-0.12, 17), elev: (50 * Math.PI) / 180 };
/** Dirección desde el objetivo hacia la cámara (yaw 0 = desde el sur, π/2 = desde el este). */
const viewDir = (yaw: number, elev: number) =>
  new Vector3(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
/** Balanceo de la vista general: ±10° de giro en un ciclo de 2 min 40 s, lento y sin estorbar. */
const DRIFT_AMP = (10 * Math.PI) / 180;
const DRIFT_PERIOD = 160_000;
const DRIFT_FPS = 24;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const WARM_WHITE = new Color(255 / 255, 196 / 255, 137 / 255);
/** El agua se anima a pocos fotogramas: suficiente para que "respire" sin gastar la tablet. */
const WATER_FPS = 20;
/** Suelo marfil de toda la casa */
const IVORY = "#efe3cb";
/** Gris antracita de persianas y carpinterías */
const ANTHRACITE = "#363a3e";

const LAMP_POWER: Record<Lamp["kind"], number> = {
  ceiling: 22,
  downlights: 26,
  pendant: 12,
  lamp: 4,
  strip: 5,
  wall: 6,
  pool: 20,
};
const LAMP_RANGE: Record<Lamp["kind"], number> = {
  ceiling: 9,
  downlights: 9,
  pendant: 6,
  lamp: 6,
  strip: 6,
  wall: 8,
  pool: 7,
};

export interface CalmSceneOptions {
  latitude: number;
  longitude: number;
  /** Carpeta de las texturas (acabada en "/") */
  textures: string;
  maxPixelRatio?: number;
}

/** Zona de la pantalla (px del contenedor) donde se encuadra lo que se mira. */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Palette {
  wall: string;
  cap: string;
  slab: string;
  slabSide: string;
  furnitureLight: string;
  furnitureDark: string;
  white: string;
  bed: string;
  duvet: string;
  fence: string;
  basin: string;
  water: string;
  waterOpacity: number;
  exposure: number;
  shadow: number;
}

/** Colores de la maqueta, a juego con los tokens del panel (lino, salvia, terracota). */
const PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    wall: "#ffffff",
    cap: "#d9d6d1",
    slab: "#d9cbb5",
    slabSide: "#c7b59a",
    furnitureLight: "#ece4d8",
    furnitureDark: "#7a6e63",
    white: "#f7f4ee",
    bed: "#f6f1e8",
    duvet: "#c9d3c3",
    fence: "#1e1e1e",
    basin: "#f1e6d0",
    water: "#6cc1c6",
    waterOpacity: 0.72,
    exposure: 1.05,
    shadow: 0.16,
  },
  dark: {
    wall: "#e2dfda",
    cap: "#8e8a85",
    slab: "#4a4239",
    slabSide: "#3b342d",
    furnitureLight: "#b8ae9f",
    furnitureDark: "#4a4038",
    white: "#cfc8bc",
    bed: "#d8d0c3",
    duvet: "#93a08b",
    fence: "#141414",
    basin: "#a9a593",
    water: "#2a8c96",
    waterOpacity: 0.86,
    exposure: 0.82,
    shadow: 0.3,
  },
};

type TexName = "floor-ivory" | "concrete" | "plaster" | "grass" | "linen" | "wood-light" | "wood-dark";

/** Tamaño real (m) que cubre una repetición de cada textura. */
const TEX_SIZE: Record<TexName, number> = {
  /** 8 × 8 baldosas de 60 cm */
  "floor-ivory": 4.8,
  concrete: 3,
  plaster: 2.5,
  grass: 3.5,
  linen: 0.8,
  "wood-light": 1.2,
  "wood-dark": 1.2,
};

interface LampRuntime {
  def: Lamp;
  light: PointLight;
  glowMaterial: SpriteMaterial;
  glows: Sprite[];
  bulbMaterial?: MeshStandardMaterial;
  on: boolean;
  level: number;
}

interface ShutterRuntime {
  entity: string;
  opening: Opening;
  mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
  current: number;
  target: number;
}

interface GateRuntime {
  def: Gate;
  mesh: Mesh;
  closed: Vector3;
  dir: Vector3;
  current: number;
  target: number;
}

interface CameraPose {
  target: Vector3;
  distance: number;
  /** Desplazamiento del centro de la imagen (px) para centrar en la zona libre */
  ox: number;
  oy: number;
  /** Giro alrededor del eje vertical y elevación de la cámara (radianes) */
  yaw: number;
  elev: number;
}

/** Ángulo de cámara para `frame()` */
export interface ViewAngle {
  yaw: number;
  elev: number;
}

export class CalmScene {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.5, 260);
  private readonly clock = new Clock();
  private readonly resizeObserver: ResizeObserver;
  private readonly loader = new TextureLoader();
  private readonly textures = new Map<TexName, [Texture, Texture]>();

  private palette = PALETTES.light;
  private theme: "light" | "dark" = "light";
  private sun!: DirectionalLight;
  private hemi!: HemisphereLight;
  private ambient!: AmbientLight;
  private cloudCoverage: number | undefined;
  private timeOverride: Date | undefined;
  private sunTimer = 0;

  private m: Record<string, MeshStandardMaterial> = {};
  private capMaterial!: MeshStandardMaterial;
  private glassMaterial!: MeshStandardMaterial;
  private frameMaterial!: MeshStandardMaterial;
  private shadowCatcher!: Mesh<PlaneGeometry, ShadowMaterial>;
  private water!: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private waterNormal!: CanvasTexture;
  private lastWater = 0;
  private tv!: { screen: MeshStandardMaterial; light: PointLight; on: boolean | undefined };
  private towels: { entity: string; material: MeshStandardMaterial; on: boolean | undefined }[] = [];
  private pumpEdge!: MeshStandardMaterial;
  private robot!: Group;
  private washerDoor!: MeshStandardMaterial;
  private inverterLed!: MeshStandardMaterial;

  private lamps: LampRuntime[] = [];
  private shutters: ShutterRuntime[] = [];
  private gates: GateRuntime[] = [];

  private size = { w: 1, h: 1 };
  private pose: CameraPose = { target: PLOT_CENTER.clone(), distance: 40, ox: 0, oy: 0, ...BASE_VIEW };
  /** Peso del balanceo (0 → 1 en unos segundos al volver a la vista general) */
  private drift = 0;
  private driftOn = false;
  private lastDrift = 0;
  private walls?: Group;
  private anim?: { from: CameraPose; to: CameraPose; start: number; ms: number };
  private raf = 0;
  private dirty = true;
  private shadowsDirty = true;
  private disposed = false;

  /** Se llama tras cada fotograma en que se ha movido la cámara o cambiado el tamaño. */
  onCamera?: () => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: CalmSceneOptions,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.maxPixelRatio ?? 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // Las sombras solo se recalculan cuando algo se mueve (sol, persianas, puertas)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.classList.add("webgl");
    container.appendChild(this.renderer.domElement);

    this.build();
    this.applyPalette();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.updateSun();
    this.sunTimer = window.setInterval(() => this.updateSun(), 60_000);
    this.tick();
  }

  /* ================================================================ */
  /* Materiales                                                        */
  /* ================================================================ */

  private tex(name: TexName): [Texture, Texture] {
    let t = this.textures.get(name);
    if (t) return t;
    const load = (kind: "color" | "normal") => {
      const tx = this.loader.load(`${this.opts.textures}${name}-${kind}.jpg`, () => {
        this.dirty = true;
      });
      tx.wrapS = tx.wrapT = RepeatWrapping;
      tx.repeat.set(1 / TEX_SIZE[name], 1 / TEX_SIZE[name]);
      tx.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      if (kind === "color") tx.colorSpace = SRGBColorSpace;
      return tx;
    };
    t = [load("color"), load("normal")];
    this.textures.set(name, t);
    return t;
  }

  private textured(name: TexName, tint = "#ffffff", roughness = 0.85, normal = 0.6): MeshStandardMaterial {
    const [map, normalMap] = this.tex(name);
    return new MeshStandardMaterial({
      map,
      normalMap,
      normalScale: new Vector2(normal, normal),
      color: tint,
      roughness,
    });
  }

  private makeMaterials(): void {
    const m = this.m;
    // Todo el suelo de la casa (dentro y fuera, piscina incluida) es la misma baldosa marfil
    m.floor = this.textured("floor-ivory", IVORY, 0.45, 0.3);
    m.outdoor = this.textured("floor-ivory", IVORY, 0.7, 0.45);
    m.concrete = this.textured("concrete", "#c9c9c7", 0.95, 0.7);
    m.wall = this.textured("plaster", "#ffffff", 0.95, 0.3);
    m.lawn = this.textured("grass", "#e9f0dc", 1, 0.9);
    m.linen = this.textured("linen", "#efe4d2", 1, 0.8);
    m.wood = this.textured("wood-light", "#d7b48c", 0.6, 0.4);
    m.darkwood = this.textured("wood-dark", "#ffffff", 0.55, 0.4);
    m.light = new MeshStandardMaterial({ roughness: 0.75 });
    m.dark = new MeshStandardMaterial({ roughness: 0.7 });
    m.white = new MeshStandardMaterial({ roughness: 0.6 });
    m.accent = new MeshStandardMaterial({ color: "#c9825a", roughness: 0.7 });
    m.beige = new MeshStandardMaterial({ color: "#e4d8c1", roughness: 0.4, metalness: 0.05 });
    m.screen = new MeshStandardMaterial({ color: "#121212", roughness: 0.2, metalness: 0.5 });
    m.steel = new MeshStandardMaterial({ color: "#b4b7b8", roughness: 0.35, metalness: 0.7 });
    m.bed = this.textured("linen", "#ffffff", 1, 0.5);
    m.duvet = this.textured("linen", "#ffffff", 1, 0.9);
    m.pillow = new MeshStandardMaterial({ color: "#fbf8f2", roughness: 0.95 });
    m.slab = new MeshStandardMaterial({ roughness: 1 });
    m.slabSide = new MeshStandardMaterial({ roughness: 1 });
    m.fence = new MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 });
    m.basin = this.textured("floor-ivory", "#ffffff", 0.4, 0.3);
    m.shutter = new MeshStandardMaterial({ color: ANTHRACITE, roughness: 0.55, map: makeSlatTexture() });
    m.black = new MeshStandardMaterial({ color: "#151515", roughness: 0.45, metalness: 0.2 });
    m.device = new MeshStandardMaterial({ color: "#26272a", roughness: 0.4, metalness: 0.2 });
    m.deviceLight = new MeshStandardMaterial({ color: "#eeeeec", roughness: 0.35 });
    this.capMaterial = new MeshStandardMaterial({ roughness: 0.9 });
    this.glassMaterial = new MeshStandardMaterial({
      color: 0xbfe0ea,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.frameMaterial = new MeshStandardMaterial({ color: ANTHRACITE, roughness: 0.5, metalness: 0.3 });
  }

  /* ================================================================ */
  /* Construcción                                                      */
  /* ================================================================ */

  private build(): void {
    const s = this.scene;
    this.makeMaterials();

    this.hemi = new HemisphereLight(0xfff4e6, 0x8a7a66, 0.9);
    this.ambient = new AmbientLight(0xfff6ea, 0.5);
    this.sun = new DirectionalLight(0xfff2dd, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -19;
    sc.right = sc.top = 19;
    sc.near = 1;
    sc.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    this.sun.target.position.copy(PLOT_CENTER);
    s.add(this.hemi, this.ambient, this.sun, this.sun.target);

    // Sombra de la maqueta sobre el "fondo" (solo la sombra, el resto transparente)
    this.shadowCatcher = new Mesh(new PlaneGeometry(160, 160), new ShadowMaterial({ opacity: 0.15 }));
    this.shadowCatcher.rotation.x = -Math.PI / 2;
    this.shadowCatcher.position.set(PLOT_CENTER.x, -SLAB - 0.01, PLOT_CENTER.z);
    this.shadowCatcher.receiveShadow = true;
    s.add(this.shadowCatcher);

    this.buildGround();
    this.buildFloors();
    this.buildWalls();
    this.buildFurniture();
    this.buildSofa();
    this.buildBeds();
    this.buildKitchenAndDevices();
    for (const def of LAMPS) this.lamps.push(this.buildLamp(def));
  }

  /** Losa de tierra con la parcela encima: césped, pavimentos, porche y piscina. */
  private buildGround(): void {
    const s = this.scene;
    // Losa con el hueco de la piscina
    const plot = polygonShape(PLOT);
    plot.holes.push(rectPath(POOL.rect));
    const slabGeo = new ExtrudeGeometry(plot, { depth: SLAB, bevelEnabled: false });
    slabGeo.rotateX(-Math.PI / 2);
    slabGeo.translate(0, -SLAB, 0);
    // Grupo 0: tapas (arriba y abajo); grupo 1: laterales de tierra
    const slab = new Mesh(slabGeo, [this.m.slab, this.m.slabSide]);
    slab.receiveShadow = true;
    slab.castShadow = true;
    s.add(slab);

    const flat = (shape: Shape, material: Material, y: number) => {
      const g = new ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      planUV(g);
      const mesh = new Mesh(g, material);
      mesh.position.y = y;
      mesh.receiveShadow = true;
      s.add(mesh);
      return mesh;
    };
    const lawn = polygonShape(PLOT);
    lawn.holes.push(rectPath(POOL_DECK));
    flat(lawn, this.m.lawn, 0.004);
    const deck = rectShape(POOL_DECK);
    deck.holes.push(rectPath(POOL.rect));
    flat(deck, this.m.outdoor, 0.03);
    flat(rectShape(PORCH), this.m.outdoor, 0.014);
    for (const r of PAVING) if (r !== PARKING_CONCRETE) flat(rectShape(r), this.m.outdoor, 0.012);
    flat(rectShape(PARKING_CONCRETE), this.m.concrete, 0.018);

    // Vaso y lámina de agua con oleaje suave
    const [px1, pz1, px2, pz2] = POOL.rect;
    const basinGeo = new BoxGeometry(px2 - px1, POOL.depth, pz2 - pz1);
    boxUV(basinGeo);
    // Solo las caras interiores (se ve desde dentro)
    const basin = new Mesh(basinGeo, this.m.basin);
    this.m.basin.side = BackSide;
    basin.position.set((px1 + px2) / 2, -POOL.depth / 2, (pz1 + pz2) / 2);
    basin.receiveShadow = true;
    s.add(basin);
    this.waterNormal = makeWaterNormal();
    this.waterNormal.repeat.set((px2 - px1) / 2.2, (pz2 - pz1) / 2.2);
    const water = new Mesh(
      new PlaneGeometry(px2 - px1, pz2 - pz1),
      new MeshStandardMaterial({
        roughness: 0.08,
        metalness: 0.05,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        normalMap: this.waterNormal,
        normalScale: new Vector2(0.35, 0.35),
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set((px1 + px2) / 2, -0.1, (pz1 + pz2) / 2);
    water.receiveShadow = true;
    this.water = water;
    s.add(water);

    // Caseta de la depuradora: tapa de césped con un borde que se ilumina en marcha
    const [qx1, qz1, qx2, qz2] = PUMP.rect;
    const lidGeo = new BoxGeometry(qx2 - qx1, PUMP.height, qz2 - qz1);
    boxUV(lidGeo);
    const lid = new Mesh(lidGeo, this.m.lawn);
    lid.position.set((qx1 + qx2) / 2, PUMP.height / 2, (qz1 + qz2) / 2);
    lid.castShadow = lid.receiveShadow = true;
    s.add(lid);
    this.pumpEdge = new MeshStandardMaterial({ color: "#3b342d", roughness: 0.5 });
    const edge = new Mesh(
      new BoxGeometry(qx2 - qx1 + 0.06, PUMP.height - 0.02, qz2 - qz1 + 0.06),
      this.pumpEdge,
    );
    edge.position.set((qx1 + qx2) / 2, (PUMP.height - 0.02) / 2, (qz1 + qz2) / 2);
    s.add(edge);

    this.buildFence();
  }

  /** Valla de lamas y puertas correderas de la calle (se abren con su sensor). */
  private buildFence(): void {
    const bars = makeBarTexture();
    const panel = (from: Point, to: Point, thickness: number) => {
      const dx = to[0] - from[0];
      const dz = to[1] - from[1];
      const length = Math.hypot(dx, dz);
      const material = this.m.fence.clone();
      material.map = bars.clone();
      material.map.repeat.set(length * 9, 1);
      material.map.needsUpdate = true;
      this.fenceClones.push(material);
      const mesh = new Mesh(new BoxGeometry(length, FENCE_HEIGHT, thickness), material);
      mesh.position.set((from[0] + to[0]) / 2, FENCE_HEIGHT / 2, (from[1] + to[1]) / 2);
      mesh.rotation.y = -Math.atan2(dz, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };
    const lastGate = GATES[GATES.length - 1];
    panel(lastGate.to, PEDESTRIAN_GATE.from, 0.08);
    panel(PEDESTRIAN_GATE.to, PLOT[1], 0.08);
    panel(PEDESTRIAN_GATE.from, PEDESTRIAN_GATE.to, 0.05);
    for (let i = 1; i < PLOT.length; i++) panel(PLOT[i], PLOT[(i + 1) % PLOT.length], 0.08);
    // Valla del patio del lavadero y su puerta (cerrada, chapa lisa)
    panel(YARD_FENCE.from, YARD_FENCE.door.from, 0.08);
    const { from: d1, to: d2 } = YARD_FENCE.door;
    const leaf = new Mesh(
      new BoxGeometry(Math.hypot(d2[0] - d1[0], d2[1] - d1[1]), FENCE_HEIGHT - 0.04, 0.06),
      this.m.black,
    );
    leaf.position.set((d1[0] + d2[0]) / 2, FENCE_HEIGHT / 2, (d1[1] + d2[1]) / 2);
    leaf.rotation.y = -Math.atan2(d2[1] - d1[1], d2[0] - d1[0]);
    leaf.castShadow = leaf.receiveShadow = true;
    this.scene.add(leaf);
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
  private fenceClones: MeshStandardMaterial[] = [];

  private buildFloors(): void {
    ROOMS.forEach((room, i) => {
      const [x1, z1, x2, z2] = room.rect;
      const g = new PlaneGeometry(x2 - x1, z2 - z1);
      g.rotateX(-Math.PI / 2);
      g.translate((x1 + x2) / 2, 0.02 + i * 0.0015, (z1 + z2) / 2);
      planUV(g);
      const floor = new Mesh(g, this.m.floor);
      floor.receiveShadow = true;
      this.scene.add(floor);
    });
  }

  private buildWalls(): void {
    const group = new Group();
    for (const wall of WALLS) this.buildWall(wall, group);
    this.scene.add(group);
    this.walls = group;
  }

  private buildWall(wall: Wall, group: Group): void {
    const [x1, z1] = wall.from;
    const [x2, z2] = wall.to;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const ux = dx / length;
    const uz = dz / length;
    const angle = Math.atan2(dz, dx);
    const t = wall.exterior ? EXTERIOR_THICKNESS : INTERIOR_THICKNESS;
    const ext = wall.exterior ? t / 2 : 0;
    let nx = -uz;
    let nz = ux;
    if (nx * ((x1 + x2) / 2) + nz * ((z1 + z2) / 2) < 0) {
      nx = -nx;
      nz = -nz;
    }
    // Caras: +x, -x, +y (corte del muro), -y, +z, -z
    const mats = [this.m.wall, this.m.wall, this.capMaterial, this.m.wall, this.m.wall, this.m.wall];
    const piece = (u0: number, u1: number, y0: number, y1: number) => {
      y1 = Math.min(y1, CUT3D);
      if (u1 - u0 < 0.001 || y1 - y0 < 0.001) return;
      const g = new BoxGeometry(u1 - u0, y1 - y0, t);
      const uc = (u0 + u1) / 2;
      const mesh = new Mesh(g, mats);
      mesh.position.set(x1 + ux * uc, (y0 + y1) / 2, z1 + uz * uc);
      mesh.rotation.y = -angle;
      mesh.updateMatrixWorld();
      worldUV(g, mesh);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };

    const openings = [...(wall.openings ?? [])].sort((a, b) => a.at - b.at);
    let cursor = -ext;
    for (const o of openings) {
      const a = o.at - o.width / 2;
      const b = o.at + o.width / 2;
      piece(cursor, a, 0, CUT3D);
      piece(a, b, 0, o.sill);
      cursor = b;
      const cx = x1 + ux * o.at;
      const cz = z1 + uz * o.at;
      if (wall.exterior) this.buildFrame(o, cx, cz, angle, t, group);
      if (o.leaf) {
        const top = Math.min(o.height, CUT3D);
        const leaf = new Mesh(
          new BoxGeometry(o.width - 0.06, top, 0.05),
          new MeshStandardMaterial({ color: o.leaf, roughness: 0.45, metalness: 0.2 }),
        );
        leaf.position.set(cx, top / 2, cz);
        leaf.rotation.y = -angle;
        leaf.castShadow = leaf.receiveShadow = true;
        group.add(leaf);
      }
      if (o.kind === "window" && o.sill < CUT3D) {
        const top = Math.min(o.sill + o.height, CUT3D);
        const glass = new Mesh(new BoxGeometry(o.width, top - o.sill, 0.02), this.glassMaterial);
        glass.position.set(cx, (o.sill + top) / 2, cz);
        glass.rotation.y = -angle;
        group.add(glass);
        if (o.cover) {
          const shutter = new Mesh(new BoxGeometry(o.width, 1, 0.035), this.m.shutter.clone());
          shutter.material.map = makeSlatTexture();
          const off = t * 0.32;
          shutter.position.set(cx + nx * off, 0, cz + nz * off);
          shutter.rotation.y = -angle;
          shutter.castShadow = true;
          shutter.visible = false;
          group.add(shutter);
          const sh: ShutterRuntime = { entity: o.cover, opening: o, mesh: shutter, current: 0, target: 0 };
          this.shutters.push(sh);
          this.placeShutter(sh);
        }
      }
    }
    piece(cursor, length + ext, 0, CUT3D);
  }

  /** Marco oscuro de ventanas y puertas exteriores (solo lo que queda por debajo del corte). */
  private buildFrame(o: Opening, cx: number, cz: number, angle: number, t: number, group: Group): void {
    const f = 0.05;
    const depth = t * 0.55;
    const top = Math.min(o.sill + o.height, CUT3D);
    const bar = (w: number, y0: number, y1: number, along: number) => {
      if (y1 - y0 < 0.01) return;
      const mesh = new Mesh(new BoxGeometry(w, y1 - y0, depth), this.frameMaterial);
      mesh.position.set(cx + Math.cos(angle) * along, (y0 + y1) / 2, cz + Math.sin(angle) * along);
      mesh.rotation.y = -angle;
      group.add(mesh);
    };
    if (o.sill > 0 && o.sill < CUT3D) bar(o.width, o.sill, o.sill + f, 0);
    bar(f, o.sill, top, -o.width / 2 + f / 2);
    bar(f, o.sill, top, o.width / 2 - f / 2);
    if (o.kind === "window" && o.width > 1.2) bar(f * 0.8, o.sill, top, 0);
  }

  private block(
    x: number,
    z: number,
    y0: number,
    [w, h, d]: [number, number, number],
    material: Material,
  ): Mesh {
    const g = new BoxGeometry(w, h, d);
    boxUV(g);
    const mesh = new Mesh(g, material);
    mesh.position.set(x, y0 + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private toneMaterial(tone: FurnitureTone | undefined): Material {
    switch (tone) {
      case "wood":
        return this.m.wood;
      case "darkwood":
        return this.m.darkwood;
      case "dark":
        return this.m.dark;
      case "white":
        return this.m.white;
      case "accent":
        return this.m.accent;
      case "beige":
        return this.m.beige;
      case "sofa":
        return this.m.linen;
      case "screen":
        return this.m.screen;
      case "steel":
        return this.m.steel;
      case "glass":
        return this.glassMaterial;
      default:
        return this.m.light;
    }
  }

  private buildFurniture(): void {
    for (const f of FURNITURE) {
      const [w, h, d] = f.size;
      if (isBed(f)) continue; // las camas se construyen con colchón, edredón y almohadas
      const base = 0.02 + (f.lift ?? 0);
      if (base >= CUT3D) continue; // lo colgado por encima del corte no se ve
      const top = f.top ? 0.04 : 0;
      const hh = Math.min(h - top, CUT3D + 0.25 - base);
      this.block(f.at[0], f.at[1], base, [w, hh, d], this.toneMaterial(f.tone));
      if (f.top && base + h - top < CUT3D + 0.25)
        this.block(f.at[0], f.at[1], base + hh, [w + 0.03, top, d + 0.03], this.toneMaterial(f.top));
    }
    // Baterías (módulos blancos apilados) con el inversor encima, contra la pared norte del lavadero
    const { battery, inverter } = ENERGY;
    const [bw, bh, bd] = battery.size;
    const [bx, bz] = battery.at;
    const moduleH = bh / battery.modules;
    for (let i = 0; i < battery.modules; i++)
      this.block(bx, bz, 0.02 + i * moduleH, [bw, moduleH - 0.015, bd], this.m.deviceLight);
    const [iw, ih, id] = inverter.size;
    this.block(
      inverter.at[0],
      inverter.at[1],
      inverter.lift,
      [iw, Math.min(ih, CUT3D + 0.2 - inverter.lift), id],
      this.m.device,
    );
    // Franja de luz del inversor (frente sur): se ilumina mientras hay producción solar
    this.inverterLed = new MeshStandardMaterial({ color: "#3a3d40", roughness: 0.4 });
    const led = new Mesh(new BoxGeometry(iw * 0.6, 0.025, 0.01), this.inverterLed);
    led.position.set(inverter.at[0], inverter.lift + 0.1, inverter.at[1] + id / 2 + 0.006);
    this.scene.add(led);

    // Lavadora: cuerpo blanco y ojo de buey hacia el oeste (brilla mientras lava)
    const [wx, wz] = WASHER.at;
    const [ww, wh, wd] = WASHER.size;
    this.block(wx, wz, 0.02, [ww - 0.02, wh - 0.02, wd - 0.02], this.m.deviceLight);
    // Tapa gris claro con el panel de mandos oscuro en el frente (oeste), para distinguirla de la encimera
    this.block(wx, wz, wh, [ww - 0.02, 0.02, wd - 0.02], this.m.steel);
    this.block(wx - ww / 2 + 0.06, wz, wh + 0.02, [0.1, 0.012, wd - 0.06], this.m.device);
    this.washerDoor = new MeshStandardMaterial({ color: "#2b3036", roughness: 0.15, metalness: 0.3 });
    const ring = new Mesh(new CylinderGeometry(0.2, 0.2, 0.03, 32), this.m.steel);
    ring.rotation.z = Math.PI / 2;
    ring.position.set(wx - ww / 2 - 0.01, 0.47, wz);
    const glass = new Mesh(new CylinderGeometry(0.16, 0.16, 0.035, 32), this.washerDoor);
    glass.rotation.z = Math.PI / 2;
    glass.position.set(wx - ww / 2 - 0.015, 0.47, wz);
    this.scene.add(ring, glass);

    // Cuadro del recibidor: marco de madera oscura y lienzo abstracto en tonos de la casa
    const [cx, cz] = PAINTING.at;
    const top = Math.min(PAINTING.lift + PAINTING.height, CUT3D + 0.2);
    const frame = this.block(
      cx,
      cz,
      PAINTING.lift,
      [0.04, top - PAINTING.lift, PAINTING.width],
      this.m.darkwood,
    );
    frame.castShadow = false;
    const canvasTex = makePaintingTexture();
    canvasTex.repeat.set(1, (top - PAINTING.lift) / PAINTING.height);
    const canvas = new Mesh(
      new PlaneGeometry(PAINTING.width - 0.08, top - PAINTING.lift - 0.06),
      new MeshStandardMaterial({ map: canvasTex, roughness: 0.9 }),
    );
    canvas.rotation.y = Math.PI / 2;
    canvas.position.set(cx + 0.025, (PAINTING.lift + top) / 2 + 0.01, cz);
    this.scene.add(canvas);
  }

  /** Sofá en U de lino: zócalo, respaldos, brazos y cojines redondeados. */
  private buildSofa(): void {
    const [x1, z1, x2, z2] = SOFA.rect;
    const d = SOFA.depth;
    const fabric = this.m.linen;
    const base = new MeshStandardMaterial({ color: "#b9ab92", roughness: 0.9 });
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
      const g = new RoundedBoxGeometry(w, h, dd, 3, Math.min(r, w / 2, h / 2, dd / 2));
      boxUV(g);
      const m = new Mesh(g, mat);
      m.position.set(cx, y0 + h / 2, cz);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    };
    const plinth = (ax: number, az: number, bx: number, bz: number) =>
      add((ax + bx) / 2, (az + bz) / 2, 0.02, bx - ax - 0.06, 0.1, bz - az - 0.06, base, 0.02);
    plinth(x1, z1, x1 + d, z2);
    plinth(x1 + d, z1, x2, z1 + d);
    plinth(x1 + d, z2 - d, x2, z2);
    add(x1 + back / 2, (z1 + z2) / 2, 0.12, back, 0.7, z2 - z1, fabric, 0.06);
    add((x1 + x2) / 2, z1 + back / 2, 0.12, x2 - x1, 0.7, back, fabric, 0.06);
    add((x1 + x2) / 2, z2 - back / 2, 0.12, x2 - x1, 0.7, back, fabric, 0.06);
    const arm = 0.2;
    add(x2 - arm / 2, z1 + d / 2, 0.12, arm, 0.5, d, fabric, 0.06);
    add(x2 - arm / 2, z2 - d / 2, 0.12, arm, 0.5, d, fabric, 0.06);
    const gap = 0.025;
    const seatH = seatTop - 0.12;
    const cushions = (ax: number, az: number, bx: number, bz: number, n: number, alongX: boolean) => {
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
    cushions(x1 + back, z1 + back, x1 + d, z2 - back, 4, false);
    cushions(x1 + d, z1 + back, x2 - arm, z1 + d, 2, true);
    cushions(x1 + d, z2 - d, x2 - arm, z2 - back, 2, true);
    // Cojines decorativos en tono terracota suave
    const pillow = new MeshStandardMaterial({ color: "#c9a58a", roughness: 0.95 });
    add(x1 + back + 0.25, z1 + back + 0.25, seatTop, 0.42, 0.36, 0.14, pillow, 0.06);
    add(x1 + back + 0.25, z2 - back - 0.25, seatTop, 0.42, 0.36, 0.14, pillow, 0.06);
    // Mesa de centro de madera
    this.block((x1 + d + x2) / 2 + 0.05, (z1 + z2) / 2, 0.02, [0.7, 0.38, 1.2], this.m.wood);
  }

  /** Camas: base, colchón, edredón hacia los pies y dos almohadas en el lado de la pared. */
  private buildBeds(): void {
    for (const f of FURNITURE.filter(isBed)) {
      const [w, h, d] = f.size;
      const [cx, cz] = f.at;
      const r: Rect = [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2];
      const room = ROOMS.find(({ rect: [a, b, c, e] }) => cx > a && cx < c && cz > b && cz < e)?.rect;
      const gaps = room
        ? { n: r[1] - room[1], s: room[3] - r[3], w: r[0] - room[0], e: room[2] - r[2] }
        : { n: 0, s: 1, w: 1, e: 1 };
      const head = (Object.entries(gaps) as [keyof typeof gaps, number][]).sort((a, b) => a[1] - b[1])[0][0];
      const top = 0.02 + h;
      this.block(cx, cz, 0.02, [w, h - 0.22, d], this.m.darkwood);
      this.block(cx, cz, top - 0.22, [w - 0.04, 0.2, d - 0.04], this.m.bed);
      const k = 0.32;
      const duvet: Rect =
        head === "n"
          ? [r[0], r[1] + d * k, r[2], r[3]]
          : head === "s"
            ? [r[0], r[1], r[2], r[3] - d * k]
            : head === "w"
              ? [r[0] + w * k, r[1], r[2], r[3]]
              : [r[0], r[1], r[2] - w * k, r[3]];
      const dg = new RoundedBoxGeometry(
        duvet[2] - duvet[0] + 0.04,
        0.08,
        duvet[3] - duvet[1] + 0.04,
        2,
        0.03,
      );
      boxUV(dg);
      const dm = new Mesh(dg, this.m.duvet);
      dm.position.set((duvet[0] + duvet[2]) / 2, top + 0.02, (duvet[1] + duvet[3]) / 2);
      dm.castShadow = dm.receiveShadow = true;
      this.scene.add(dm);
      const along = head === "n" || head === "s";
      const span = along ? w : d;
      const pw = Math.min(0.68, span / 2 - 0.08);
      for (const side of [-1, 1]) {
        const c = (along ? cx : cz) + side * (pw / 2 + 0.04);
        const off = 0.25;
        const px = head === "w" ? r[0] + off : head === "e" ? r[2] - off : c;
        const pz = head === "n" ? r[1] + off : head === "s" ? r[3] - off : c;
        const g = new RoundedBoxGeometry(along ? pw : 0.36, 0.13, along ? 0.36 : pw, 3, 0.06);
        const pm = new Mesh(g, this.m.pillow);
        pm.position.set(px, top + 0.06, pz);
        pm.castShadow = true;
        this.scene.add(pm);
      }
    }
  }

  /** Frigorífico, TV, toalleros y luces de los equipos. */
  private buildKitchenAndDevices(): void {
    const [fx, fz] = FRIDGE.at;
    const [fw, , fd] = FRIDGE.size;
    this.block(fx, fz, 0.02, [fw, CUT3D + 0.25, fd - 0.02], this.m.wood);
    // Tirador de acero en el frente (este) para distinguir el frigorífico de las columnas
    this.block(fx + fw / 2 + 0.015, fz + fd / 2 - 0.07, 0.75, [0.02, 0.7, 0.025], this.m.steel);

    // Robot aspirador: base contra la pared y el robot aparcado delante
    const [vx, vz] = VACUUM.dock;
    const [vw, vh, vd] = VACUUM.dockSize;
    this.block(vx, vz, 0.02, [vw, vh - 0.03, vd], this.m.device);
    this.block(vx, vz, vh - 0.01, [vw, 0.03, vd], this.m.deviceLight);
    const robot = new Group();
    const body = new Mesh(new CylinderGeometry(0.175, 0.175, 0.09, 32), this.m.deviceLight);
    body.position.y = 0.065;
    const lidar = new Mesh(new CylinderGeometry(0.045, 0.045, 0.03, 20), this.m.device);
    lidar.position.set(0.05, 0.125, 0);
    robot.add(body, lidar);
    robot.position.set(vx - vw / 2 - 0.16, 0, vz);
    body.castShadow = lidar.castShadow = true;
    this.scene.add(robot);
    this.robot = robot;

    // Impresora sobre el escritorio
    const [px, pz] = PRINTER.at;
    const [pw, ph, pd] = PRINTER.size;
    this.block(px, pz, PRINTER.lift, [pw, ph, pd], this.m.device);
    this.block(px + pw / 2 + 0.05, pz, PRINTER.lift + 0.05, [0.1, 0.01, pd * 0.7], this.m.deviceLight);

    // TV: pantalla sobre el mueble bajo (solo la parte por debajo del corte)
    const { width: w, height: h, lift } = TV;
    const [tx, tz] = TV.at;
    const top = Math.min(lift + h, CUT3D + 0.2);
    const screen = new MeshStandardMaterial({ color: "#101112", roughness: 0.2, metalness: 0.5 });
    const tvMesh = new Mesh(new BoxGeometry(0.05, top - lift, w), [
      this.frameMaterial,
      screen,
      this.frameMaterial,
      this.frameMaterial,
      this.frameMaterial,
      this.frameMaterial,
    ]);
    tvMesh.position.set(tx, (lift + top) / 2, tz);
    tvMesh.castShadow = true;
    this.scene.add(tvMesh);
    const tvLight = new PointLight(0x9fb8d6, 0, 5, 2);
    tvLight.position.set(tx - 0.8, lift + 0.4, tz);
    tvLight.visible = false;
    this.scene.add(tvLight);
    this.tv = { screen, light: tvLight, on: undefined };

    for (const t of TOWEL_RAILS) {
      const material = new MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, metalness: 0.3 });
      const g = new Group();
      g.position.set(t.at[0], 0, t.at[1]);
      if (t.axis === "z") g.rotation.y = Math.PI / 2;
      for (const side of [-1, 1]) {
        const post = new Mesh(new CylinderGeometry(0.018, 0.018, 0.85, 10), material);
        post.position.set(side * 0.25, 0.9 + 0.425, 0);
        g.add(post);
      }
      for (let i = 0; i < 7; i++) {
        const y = 0.96 + (i * 0.73) / 6;
        if (y > CUT3D) break;
        const bar = new Mesh(new CylinderGeometry(0.011, 0.011, 0.5, 8), material);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, y, 0);
        g.add(bar);
      }
      this.scene.add(g);
      this.towels.push({ entity: t.entity, material, on: undefined });
    }
  }

  private buildLamp(def: Lamp): LampRuntime {
    const [x, y, z] = def.pos;
    const light = new PointLight(WARM_WHITE, 0, LAMP_RANGE[def.kind], 2);
    light.position.set(x, Math.min(y, CUT3D + 0.9), z);
    light.visible = false;
    this.scene.add(light);
    const glowMaterial = new SpriteMaterial({
      map: glowTexture,
      color: WARM_WHITE,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    // Los puntos de luz de techo flotan justo sobre el corte del muro; los bajos, en su sitio
    const gy = def.kind === "pool" ? 0.05 : Math.min(y, CUT3D + 0.15);
    const points = def.spots ? def.spots.map(([sx, sz]) => new Vector3(sx, gy, sz)) : [new Vector3(x, gy, z)];
    const size =
      def.kind === "pool" ? 3.4 : def.kind === "ceiling" ? 1.5 : def.kind === "downlights" ? 0.8 : 0.9;
    const glows = points.map((p) => {
      const g = new Sprite(glowMaterial);
      g.position.copy(p);
      g.scale.set(size, size, 1);
      g.visible = false;
      this.scene.add(g);
      return g;
    });
    // Solo se ven las luminarias que quedan por debajo del corte (lámparas, tiras, apliques bajos)
    let bulbMaterial: MeshStandardMaterial | undefined;
    if (def.column) {
      // Columna de luz: cuerpo blanco translúcido que brilla entero al encenderse
      bulbMaterial = new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.35 });
      const body = new Mesh(new CylinderGeometry(0.13, 0.16, def.column, 28), bulbMaterial);
      body.position.set(x, def.column / 2, z);
      body.castShadow = true;
      const base = new Mesh(new CylinderGeometry(0.18, 0.18, 0.03, 28), this.m.steel);
      base.position.set(x, 0.015, z);
      this.scene.add(body, base);
    } else if (y < CUT3D && def.kind !== "pool") {
      bulbMaterial = new MeshStandardMaterial({ color: 0xe9e2d6, roughness: 0.5 });
      const geo =
        def.kind === "strip" && def.strip
          ? def.strip.axis === "x"
            ? new BoxGeometry(def.strip.length, 0.03, 0.03)
            : new BoxGeometry(0.03, 0.03, def.strip.length)
          : new SphereGeometry(0.1, 16, 12);
      const bulb = new Mesh(geo, bulbMaterial);
      bulb.position.set(x, y, z);
      this.scene.add(bulb);
    }
    return { def, light, glowMaterial, glows, bulbMaterial, on: false, level: 0 };
  }

  private placeShutter(sh: ShutterRuntime): void {
    const { sill, height, width } = sh.opening;
    const top = sill + height;
    const covered = sh.current * height;
    // La persiana baja desde arriba; solo se ve lo que queda por debajo del corte
    const y0 = Math.max(sill, top - covered);
    const y1 = Math.min(top, CUT3D);
    const visible = y1 - y0 > 0.005;
    sh.mesh.visible = visible;
    if (!visible) return;
    sh.mesh.scale.y = y1 - y0;
    sh.mesh.position.y = (y0 + y1) / 2;
    const map = sh.mesh.material.map;
    if (map) map.repeat.set(Math.max(1, width), (y1 - y0) * 22);
  }

  /* ================================================================ */
  /* Estado de Home Assistant                                          */
  /* ================================================================ */

  update(hass: HomeAssistant, weatherEntity?: string): void {
    let shadows = false;
    for (const lamp of this.lamps) {
      const st = hass.states[lamp.def.entity];
      const on = st?.state === "on";
      const level = on ? brightness(st) : 0;
      const color = on ? lightColor(st) : WARM_WHITE;
      if (on === lamp.on && level === lamp.level && lamp.light.color.equals(color)) continue;
      lamp.on = on;
      lamp.level = level;
      lamp.light.color.copy(color);
      lamp.light.intensity = LAMP_POWER[lamp.def.kind] * level;
      lamp.light.visible = on;
      lamp.glowMaterial.color.copy(color);
      lamp.glowMaterial.opacity = on ? 0.3 + 0.5 * level : 0;
      for (const g of lamp.glows) g.visible = on;
      if (lamp.bulbMaterial) {
        lamp.bulbMaterial.emissive.copy(on ? color : new Color(0));
        lamp.bulbMaterial.emissiveIntensity = on ? 1 + 1.5 * level : 0;
      }
      if (lamp.def.kind === "pool") {
        const water = this.water.material;
        water.emissive.copy(on ? color : new Color(0));
        water.emissiveIntensity = on ? 0.3 + 0.5 * level : 0;
        this.m.basin.emissive.copy(on ? color : new Color(0));
        this.m.basin.emissiveIntensity = on ? 0.45 * level : 0;
      }
      this.dirty = true;
    }

    for (const sh of this.shutters) {
      const pos = coverPosition(hass.states[sh.entity]);
      if (pos === undefined) continue;
      const target = 1 - pos / 100;
      if (target !== sh.target) {
        sh.target = target;
        this.dirty = true;
      }
    }
    for (const g of this.gates) {
      const st = hass.states[g.def.entity];
      if (!st || st.state === "unavailable" || st.state === "unknown") continue;
      const target = st.state === "on" ? 1 : 0;
      if (target !== g.target) {
        g.target = target;
        this.dirty = true;
      }
    }

    const tvState = hass.states[TV.entity];
    const tvOn = !!tvState && !["off", "unavailable", "unknown", "standby"].includes(tvState.state);
    if (tvOn !== this.tv.on) {
      this.tv.on = tvOn;
      this.tv.screen.emissive.set(tvOn ? 0x7f9bbf : 0x000000);
      this.tv.screen.emissiveIntensity = tvOn ? 0.9 : 0;
      this.tv.light.visible = tvOn;
      this.tv.light.intensity = tvOn ? 3 : 0;
      this.dirty = true;
    }
    for (const t of this.towels) {
      const on = hass.states[t.entity]?.state === "on";
      if (on === t.on) continue;
      t.on = on;
      t.material.emissive.set(on ? 0xff8a4a : 0x000000);
      t.material.emissiveIntensity = on ? 0.7 : 0;
      this.dirty = true;
    }
    // El robot solo se ve en su base cuando no está limpiando
    const vac = hass.states[VACUUM.entity]?.state;
    const docked = !vac || ["docked", "idle", "paused", "unavailable", "unknown"].includes(vac);
    if (docked !== this.robot.visible) {
      this.robot.visible = docked;
      this.dirty = this.shadowsDirty = true;
    }
    const washing = hass.states[WASHER.running]?.state === "on";
    const washHex = washing ? 0x5f9fc4 : 0x000000;
    if (this.washerDoor.emissive.getHex() !== washHex) {
      this.washerDoor.emissive.set(washHex);
      this.washerDoor.emissiveIntensity = washing ? 0.8 : 0;
      this.dirty = true;
    }
    const pv = Number(hass.states[ENERGY.sensors.pv]?.state);
    const ledHex = pv > 0.05 ? 0xf2b04a : 0x000000;
    if (this.inverterLed.emissive.getHex() !== ledHex) {
      this.inverterLed.emissive.set(ledHex);
      this.inverterLed.emissiveIntensity = pv > 0.05 ? 1.4 : 0;
      this.dirty = true;
    }
    const pumpOn = hass.states[PUMP.entity]?.state === "on";
    const edge = pumpOn ? 0x74937b : 0x000000;
    if (this.pumpEdge.emissive.getHex() !== edge) {
      this.pumpEdge.emissive.set(edge);
      this.pumpEdge.emissiveIntensity = pumpOn ? 1.2 : 0;
      this.dirty = true;
    }

    const clouds = weatherEntity ? hass.states[weatherEntity]?.attributes.cloud_coverage : undefined;
    const cc = typeof clouds === "number" ? clouds : undefined;
    if (cc !== this.cloudCoverage) {
      this.cloudCoverage = cc;
      shadows = true;
    }
    if (shadows) this.updateSun();
  }

  /** Sol real (posición y luz) para la ubicación y la hora, con un mínimo de luz de ambiente. */
  private updateSun(): void {
    const now = this.timeOverride ?? new Date();
    const { azimuth, elevation } = sunPosition(now, this.opts.latitude, this.opts.longitude);
    const { directNormal, sky } = sunLight(elevation, this.cloudCoverage);
    const theta = ((azimuth + NORTH_ANGLE) * Math.PI) / 180;
    const el = (Math.max(elevation, 8) * Math.PI) / 180;
    const dir = new Vector3(Math.sin(theta) * Math.cos(el), Math.sin(el), -Math.cos(theta) * Math.cos(el));
    this.sun.position.copy(dir.multiplyScalar(70).add(PLOT_CENTER));
    const day = smoothstep(-6, 10, elevation);
    this.sun.intensity = 0.35 + 4.4 * (directNormal / 1000);
    this.sun.color.setHSL(0.09, 0.75, 0.62 + 0.3 * smoothstep(0, 35, elevation));
    if (day < 0.5) this.sun.color.set(0xb9c6e6); // luna: luz fría y suave
    this.hemi.intensity = 0.55 + 0.9 * sky;
    this.ambient.intensity = 0.45 + 0.25 * sky;
    this.shadowsDirty = true;
    this.dirty = true;
  }

  /** Hora simulada (desarrollo) o `undefined` para la hora real. */
  setTime(date: Date | undefined): void {
    this.timeOverride = date;
    this.updateSun();
  }

  setTheme(theme: "light" | "dark"): void {
    this.theme = theme;
    this.palette = PALETTES[theme];
    this.applyPalette();
  }

  private applyPalette(): void {
    const p = this.palette;
    this.m.wall.color.set(p.wall);
    this.capMaterial.color.set(p.cap);
    this.m.slab.color.set(p.slab);
    this.m.slabSide.color.set(p.slabSide);
    this.m.light.color.set(p.furnitureLight);
    this.m.dark.color.set(p.furnitureDark);
    this.m.white.color.set(p.white);
    this.m.bed.color.set(p.bed);
    this.m.duvet.color.set(p.duvet);
    this.m.basin.color.set(p.basin);
    this.water.material.color.set(p.water);
    this.water.material.opacity = p.waterOpacity;
    for (const f of this.fenceClones) f.color.set(p.fence);
    this.shadowCatcher.material.opacity = p.shadow;
    this.renderer.toneMappingExposure = p.exposure;
    this.dirty = true;
  }

  /* ================================================================ */
  /* Cámara                                                            */
  /* ================================================================ */

  /**
   * Encuadra la caja `box` (min/max en metros) dentro de la zona `area` de la pantalla.
   * `minDistance` evita acercarse demasiado en estancias pequeñas.
   */
  frame(
    box: [Vector3, Vector3],
    area: Area,
    opts: { fill?: number; minDistance?: number; ms?: number; view?: ViewAngle } = {},
  ): void {
    const to = this.compute(box, area, opts.fill ?? 0.9, opts.view ?? BASE_VIEW);
    to.distance = Math.max(to.distance, opts.minDistance ?? 0);
    const ms = opts.ms ?? 0;
    if (ms > 0)
      this.anim = {
        from: { ...this.pose, target: this.pose.target.clone() },
        to,
        start: performance.now(),
        ms,
      };
    else {
      this.anim = undefined;
      this.pose = to;
      this.applyPose();
      this.onCamera?.();
    }
    this.dirty = true;
  }

  /** Distancia de cámara con la que `box` llena la zona `area` (para limitar el zoom). */
  distanceFor(box: [Vector3, Vector3], area: Area, fill = 0.9, view: ViewAngle = BASE_VIEW): number {
    return this.compute(box, area, fill, view).distance;
  }

  /** Activa el balanceo lento de la cámara (vista general); entra y sale suavemente. */
  setDrift(on: boolean): void {
    this.driftOn = on && !reducedMotion();
  }

  /**
   * Busca el ángulo que mejor enseña una estancia: prueba giros alrededor de la casa y varias
   * elevaciones, y puntúa cuántos de `points` (suelo y dispositivos) se ven sin que los tapen
   * los muros, lo grande que sale la estancia y lo cerca que queda de la vista de siempre.
   */
  bestView(
    box: [Vector3, Vector3],
    points: Vector3[],
    area: Area,
    opts: { fill?: number; minDistance?: number; outward?: Vector2 } = {},
  ): ViewAngle {
    const { fill = 0.82, minDistance = 0, outward } = opts;
    const walls = this.walls;
    if (!walls) return BASE_VIEW;
    const ray = new Raycaster();
    const cands: (ViewAngle & { vis: number; dist: number })[] = [];
    for (let i = 0; i < 16; i++) {
      const yaw = BASE_VIEW.yaw + (i * Math.PI) / 8;
      for (const deg of [38, 46, 54, 62]) {
        const elev = (deg * Math.PI) / 180;
        const pose = this.compute(box, area, fill, { yaw, elev });
        const eye = pose.target
          .clone()
          .addScaledVector(viewDir(yaw, elev), Math.max(pose.distance, minDistance));
        let vis = 0;
        for (const p of points) {
          const dir = p.clone().sub(eye);
          const len = dir.length();
          ray.set(eye, dir.normalize());
          ray.far = len - 0.08;
          if (ray.intersectObject(walls, true).length === 0) vis++;
        }
        cands.push({
          yaw: wrapAngle(yaw),
          elev,
          vis: vis / Math.max(1, points.length),
          dist: Math.max(pose.distance, minDistance),
        });
      }
    }
    const dMin = Math.min(...cands.map((c) => c.dist));
    // Mirar desde fuera de la casa hacia la estancia: nada se interpone y la escena cambia con cada estancia
    const out = outward && outward.length() > 0.05 ? outward.clone().normalize() : undefined;
    const score = (c: (typeof cands)[number]) =>
      c.vis * 100 -
      (c.dist / dMin - 1) * 40 +
      (out
        ? (Math.sin(c.yaw) * out.x + Math.cos(c.yaw) * out.y) * 14 * Math.min(1, outward!.length() / 3)
        : 0) -
      ((1 - Math.cos(c.yaw - BASE_VIEW.yaw)) / 2) * 3 -
      Math.abs(c.elev - (48 * Math.PI) / 180) * 12;
    const best = cands.reduce((a, b) => (score(b) > score(a) ? b : a));
    return { yaw: best.yaw, elev: best.elev };
  }

  private compute(box: [Vector3, Vector3], area: Area, fill: number, view: ViewAngle): CameraPose {
    const dirV = viewDir(view.yaw, view.elev);
    const { w, h } = this.size;
    const [lo, hi] = box;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
      (i) => new Vector3(i & 1 ? hi.x : lo.x, i & 2 ? hi.y : lo.y, i & 4 ? hi.z : lo.z),
    );
    const target = lo.clone().add(hi).multiplyScalar(0.5);
    const cam = this.camera.clone();
    cam.aspect = w / h;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    let distance = 40;
    // Ajuste iterativo: distancia para que quepa y recentrado del encuadre en perspectiva
    for (let it = 0; it < 6; it++) {
      cam.position.copy(target).addScaledVector(dirV, distance);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const c of corners) {
        const p = c.clone().project(cam);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const spanX = ((maxX - minX) / 2) * w;
      const spanY = ((maxY - minY) / 2) * h;
      const ratio = Math.max(spanX / (area.w * fill), spanY / (area.h * fill));
      // Recentrar: desplazar el objetivo hacia el centro de lo proyectado
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const halfH = Math.tan((cam.fov * Math.PI) / 360) * distance;
      target.addScaledVector(right, cx * halfH * cam.aspect).addScaledVector(up, cy * halfH);
      distance *= ratio;
    }
    return {
      target,
      distance,
      ox: area.x + area.w / 2 - w / 2,
      oy: area.y + area.h / 2 - h / 2,
      yaw: view.yaw,
      elev: view.elev,
    };
  }

  private applyPose(): void {
    const { target, distance, ox, oy, yaw, elev } = this.pose;
    const { w, h } = this.size;
    // Balanceo suave: seno lento, con entrada y salida en «smoothstep» para no dar tirones
    const k = this.drift * this.drift * (3 - 2 * this.drift);
    const sway = k * DRIFT_AMP * Math.sin((2 * Math.PI * performance.now()) / DRIFT_PERIOD);
    this.camera.position.copy(target).addScaledVector(viewDir(yaw + sway, elev), distance);
    this.camera.lookAt(target);
    // Desplaza la imagen para que el centro quede en la zona libre entre los paneles
    this.camera.setViewOffset(w, h, -ox, -oy, w, h);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /** Punto del espacio → px del contenedor (o undefined si queda detrás de la cámara). */
  project(p: Vector3): [number, number] | undefined {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return undefined;
    return [((v.x + 1) / 2) * this.size.w, ((1 - v.y) / 2) * this.size.h];
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyPose();
    this.dirty = true;
  }

  private tick = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const now = performance.now();
    let cameraMoved = false;

    if (this.anim) {
      const { from, to, start, ms } = this.anim;
      const k = Math.min(1, (now - start) / ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      // La distancia se interpola en escala logarítmica: el zoom se siente uniforme
      this.pose = {
        target: from.target.clone().lerp(to.target, e),
        distance: Math.exp(Math.log(from.distance) + (Math.log(to.distance) - Math.log(from.distance)) * e),
        ox: from.ox + (to.ox - from.ox) * e,
        oy: from.oy + (to.oy - from.oy) * e,
        // El giro va por el camino más corto
        yaw: from.yaw + wrapAngle(to.yaw - from.yaw) * e,
        elev: from.elev + (to.elev - from.elev) * e,
      };
      this.applyPose();
      if (k >= 1) this.anim = undefined;
      cameraMoved = true;
      this.dirty = true;
    }

    // Balanceo de la vista general (a pocos fotogramas: se mueve muy despacio)
    const driftTo = this.driftOn ? 1 : 0;
    if (this.drift !== driftTo || this.drift > 0) {
      this.drift =
        driftTo > this.drift ? Math.min(1, this.drift + dt / 4) : Math.max(0, this.drift - dt / 1.2);
      if (now - this.lastDrift > 1000 / DRIFT_FPS || this.anim) {
        this.lastDrift = now;
        this.applyPose();
        cameraMoved = true;
        this.dirty = true;
      }
    }

    for (const g of this.gates) {
      if (Math.abs(g.current - g.target) > 0.001) {
        const step = GATE_SPEED * dt;
        g.current += Math.max(-step, Math.min(step, g.target - g.current));
        g.mesh.position.copy(g.closed).addScaledVector(g.dir, g.current * g.def.slide);
        this.shadowsDirty = this.dirty = true;
      }
    }
    for (const sh of this.shutters) {
      if (Math.abs(sh.current - sh.target) > 0.001) {
        const step = SHUTTER_SPEED * dt;
        sh.current += Math.max(-step, Math.min(step, sh.target - sh.current));
        this.placeShutter(sh);
        this.shadowsDirty = this.dirty = true;
      }
    }

    // Oleaje: el mapa de normales se desliza despacio
    if (now - this.lastWater > 1000 / WATER_FPS && !reducedMotion()) {
      this.lastWater = now;
      const t = this.clock.elapsedTime;
      this.waterNormal.offset.set(t * 0.012, t * 0.007);
      this.dirty = true;
    }

    if (this.dirty) {
      this.dirty = false;
      if (this.shadowsDirty) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowsDirty = false;
      }
      this.renderer.render(this.scene, this.camera);
      if (cameraMoved) this.onCamera?.();
    }
  };

  get currentTheme(): "light" | "dark" {
    return this.theme;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.sunTimer);
    this.resizeObserver.disconnect();
    this.scene.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as Material | Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    for (const [a, b] of this.textures.values()) {
      a.dispose();
      b.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/* ==================================================================== */

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function isBed(f: (typeof FURNITURE)[number]): boolean {
  const [w, h, d] = f.size;
  return !f.top && !f.lift && h <= 0.55 && w > 1.3 && d > 1.3;
}

function brightness(st: HassEntity | undefined): number {
  const b = st?.attributes.brightness;
  return typeof b === "number" ? Math.max(0.08, b / 255) : 1;
}

function lightColor(st: HassEntity | undefined): Color {
  const rgb = st?.attributes.rgb_color;
  if (Array.isArray(rgb) && rgb.length === 3)
    return new Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).convertSRGBToLinear();
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

/* ---------- Formas y coordenadas de textura en metros ---------- */

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

/** UV de suelo: x/z en metros (la escala la pone `repeat` de cada textura). */
function planUV(g: BufferGeometry): void {
  const pos = g.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i);
    uv[i * 2 + 1] = -pos.getZ(i);
  }
  g.setAttribute("uv", new BufferAttribute(uv, 2));
}

/** UV de una caja en metros, proyectando cada cara según su normal (local). */
function boxUV(g: BufferGeometry): void {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const [u, v] =
      ay >= ax && ay >= az
        ? [pos.getX(i), pos.getZ(i)]
        : ax >= az
          ? [pos.getZ(i), pos.getY(i)]
          : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute("uv", new BufferAttribute(uv, 2));
}

/** UV en metros del mundo (muros: el revoco sigue de un trozo al siguiente sin saltos). */
function worldUV(g: BufferGeometry, mesh: Mesh): void {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    n.fromBufferAttribute(nor, i).transformDirection(mesh.matrixWorld);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    const [u, v] = ay >= ax && ay >= az ? [p.x, p.z] : ax >= az ? [p.z, p.y] : [p.x, p.y];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute("uv", new BufferAttribute(uv, 2));
}

/* ---------- Texturas generadas ---------- */

const glowTexture = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
})();

/** Mapa de normales del agua: suma de ondas suaves, repetible sin costuras. */
function makeWaterNormal(): CanvasTexture {
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const img = g.createImageData(N, N);
  const waves: [number, number, number, number][] = [
    [2, 1, 1, 0],
    [1, 3, 0.7, 1.3],
    [4, -1, 0.45, 2.1],
    [-3, 2, 0.4, 0.4],
    [5, 4, 0.25, 3.3],
  ];
  const height = (x: number, y: number) =>
    waves.reduce((s, [kx, ky, a, ph]) => s + a * Math.sin(((kx * x + ky * y) / N) * Math.PI * 2 + ph), 0);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = height(x + 1, y) - height(x - 1, y);
      const dy = height(x, y + 1) - height(x, y - 1);
      const n = new Vector3(-dx * 6, -dy * 6, 1).normalize();
      const i = (y * N + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Lienzo abstracto y tranquilo para el cuadro (manchas suaves en tonos lino, salvia y terracota). */
function makePaintingTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 180;
  const g = c.getContext("2d")!;
  g.fillStyle = "#efe6d6";
  g.fillRect(0, 0, 256, 180);
  const blobs: [number, number, number, string][] = [
    [70, 70, 62, "rgba(201,130,90,0.85)"],
    [170, 105, 70, "rgba(143,168,133,0.85)"],
    [125, 40, 34, "rgba(224,183,110,0.9)"],
    [205, 40, 26, "rgba(60,66,74,0.75)"],
  ];
  for (const [x, y, r, col] of blobs) {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.8, 0.4, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(40,36,32,0.55)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(20, 150);
  g.bezierCurveTo(90, 110, 150, 175, 240, 120);
  g.stroke();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

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

function makeSlatTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 8, 32);
  const grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.75, "rgba(0,0,0,0.15)");
  grad.addColorStop(0.92, "rgba(0,0,0,0.45)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 32);
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export { Vector2, Vector3 };
