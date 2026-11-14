import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Clock,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  GridHelper,
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
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TOUCH,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

import type { HassEntity, HomeAssistant } from "../types";
import {
  EXTERIOR_THICKNESS,
  FURNITURE,
  INTERIOR_THICKNESS,
  LAMPS,
  ROOMS,
  WALLS,
  WALL_HEIGHT,
  type FloorKind,
  type Lamp,
  type Opening,
  type Wall,
} from "./plan";
import { PALETTES, type Palette } from "./palette";

/** Máximo de luces puntuales con sombra a la vez (cada una usa un cubemap: coste alto en tablets). */
const MAX_SHADOW_LIGHTS = 6;
/** Velocidad visual de las persianas (fracción de recorrido por segundo). */
const SHUTTER_SPEED = 0.35;
/** Tras este tiempo sin tocar la pantalla, la cámara vuelve a la vista inicial. */
const IDLE_RETURN_MS = 90_000;

const HOME_CAMERA = new Vector3(0, 18, 14.5);
const HOME_TARGET = new Vector3(0, 0, 0.3);
const WARM_WHITE = new Color(255 / 255, 196 / 255, 137 / 255);

/* Intensidad máxima (candelas) por tipo de luminaria, con unidades físicas de three.js */
const LAMP_POWER: Record<Lamp["kind"], number> = { ceiling: 26, pendant: 14, lamp: 4, strip: 6 };

interface LampRuntime {
  def: Lamp;
  light: PointLight;
  bulb: Mesh<BufferGeometry, MeshStandardMaterial>;
  glow: Sprite;
  on: boolean;
  level: number;
}

interface ShutterRuntime {
  entity: string;
  opening: Opening;
  mesh: Mesh<BoxGeometry, MeshStandardMaterial>;
  /** Fracción cubierta actual y objetivo (0 = abierta, 1 = cerrada) */
  current: number;
  target: number;
}

export interface SceneStats {
  lightsOn: number;
  lightsTotal: number;
  coversOpenAvg: number | undefined;
  coversTotal: number;
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
  private ground!: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private grid!: GridHelper;
  private wallMaterial!: MeshStandardMaterial;
  private wallLines!: LineSegments<BufferGeometry, LineBasicMaterial>;
  private floorMaterials: Record<FloorKind, MeshStandardMaterial> = {} as never;
  private furnitureMaterials: Record<string, MeshStandardMaterial> = {};
  private glassMaterial!: MeshStandardMaterial;
  private shutterMaterial!: MeshStandardMaterial;

  private lamps: LampRuntime[] = [];
  private shutters: ShutterRuntime[] = [];
  private raf = 0;
  private dirty = true;
  private lastInteraction = performance.now();
  private returningHome = false;

  constructor(
    private readonly container: HTMLElement,
    opts: { maxPixelRatio?: number } = {},
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
    this.controls.maxDistance = 45;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.screenSpacePanning = false;
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    this.controls.addEventListener("start", () => {
      this.lastInteraction = performance.now();
      this.returningHome = false;
    });
    this.controls.addEventListener("change", () => {
      this.lastInteraction = performance.now();
      // Mantener el centro de giro dentro de la casa.
      this.controls.target.x = Math.max(-10, Math.min(10, this.controls.target.x));
      this.controls.target.z = Math.max(-7, Math.min(7, this.controls.target.z));
      this.controls.target.y = 0;
      this.dirty = true;
    });
    this.controls.update();

    this.build();
    this.applyPalette();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
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

    this.sun = new DirectionalLight(0xfff2dd, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -16;
    this.sun.shadow.camera.right = 16;
    this.sun.shadow.camera.top = 16;
    this.sun.shadow.camera.bottom = -16;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    s.add(this.sun, this.sun.target);

    // Terreno
    this.ground = new Mesh(new PlaneGeometry(160, 160), new MeshStandardMaterial({ roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    s.add(this.ground);

    this.grid = new GridHelper(80, 80);
    this.grid.position.y = 0.002;
    (this.grid.material as Material).transparent = true;
    s.add(this.grid);

    // Suelos de cada estancia
    for (const kind of ["wood", "tile", "stone"] as FloorKind[]) {
      this.floorMaterials[kind] = new MeshStandardMaterial({ roughness: kind === "tile" ? 0.35 : 0.75 });
    }
    ROOMS.forEach((room, i) => {
      const [x1, z1, x2, z2] = room.rect;
      const floor = new Mesh(new PlaneGeometry(x2 - x1, z2 - z1), this.floorMaterials[room.floor]);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((x1 + x2) / 2, 0.01 + i * 0.002, (z1 + z2) / 2);
      floor.receiveShadow = true;
      s.add(floor);

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
    const walls = new Group();
    const lineVerts: number[] = [];
    for (const wall of WALLS) this.buildWall(wall, walls, lineVerts);
    s.add(walls);

    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute("position", new Float32BufferAttribute(lineVerts, 3));
    this.wallLines = new LineSegments(lineGeo, new LineBasicMaterial({ transparent: true }));
    s.add(this.wallLines);

    // Tejado invisible: solo proyecta sombra, para que el sol entre únicamente por las ventanas.
    const roof = new Mesh(
      new BoxGeometry(18 + EXTERIOR_THICKNESS, 0.2, 12 + EXTERIOR_THICKNESS),
      new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    roof.position.y = WALL_HEIGHT + 0.1;
    roof.castShadow = true;
    s.add(roof);

    // Mobiliario (bloques sencillos para dar escala y sombras)
    for (const tone of ["dark", "light", "accent"]) {
      this.furnitureMaterials[tone] = new MeshStandardMaterial({ roughness: 0.7 });
    }
    for (const f of FURNITURE) {
      const [w, h, d] = f.size;
      const mesh = new Mesh(new BoxGeometry(w, h, d), this.furnitureMaterials[f.tone ?? "light"]);
      mesh.position.set(f.at[0], h / 2 + 0.02, f.at[1]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      s.add(mesh);
    }

    // Luminarias
    const glowTexture = makeGlowTexture();
    for (const def of LAMPS) this.lamps.push(this.buildLamp(def, glowTexture));
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
        }
      }
    }
    piece(cursor, length + ext, 0, WALL_HEIGHT);

    // Línea luminosa en la coronación del muro
    const y = WALL_HEIGHT + 0.004;
    lineVerts.push(x1 - ux * ext, y, z1 - uz * ext, x2 + ux * ext, y, z2 + uz * ext);
  }

  private buildLamp(def: Lamp, glowTexture: CanvasTexture): LampRuntime {
    const [x, y, z] = def.pos;
    const light = new PointLight(WARM_WHITE, 0, def.kind === "ceiling" ? 12 : 7, 2);
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
    const size = def.kind === "ceiling" ? 1.6 : def.kind === "strip" ? (def.strip?.length ?? 1) * 0.9 : 0.9;
    glow.scale.set(size, def.kind === "strip" ? 0.6 : size, 1);
    glow.visible = false;
    this.scene.add(glow);

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

  update(hass: HomeAssistant, sunEntity = "sun.sun"): SceneStats {
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
        lamp.light.visible = on;
        lamp.glow.visible = on;
        lamp.glow.material.color.copy(color);
        lamp.glow.material.opacity = 0.35 + 0.65 * level;
        const m = lamp.bulb.material;
        m.emissive.copy(on ? color : new Color(0x000000));
        m.emissiveIntensity = on ? 1.5 + 2 * level : 0;
        m.color.set(on ? 0xffffff : this.palette.fixture);
        this.dirty = true;
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
      }
    }

    this.updateSun(hass.states[sunEntity]);

    return {
      lightsOn,
      lightsTotal,
      coversOpenAvg: openCount ? openSum / openCount : undefined,
      coversTotal: this.shutters.length,
    };
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

  private updateSun(sun: HassEntity | undefined): void {
    const elevation = Number(sun?.attributes.elevation ?? 45);
    const azimuth = Number(sun?.attributes.azimuth ?? 180);
    const el = (Math.max(elevation, 2) * Math.PI) / 180;
    const az = (azimuth * Math.PI) / 180;
    // Azimut desde el norte en sentido horario; el norte es -Z.
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const day = smoothstep(-4, 12, elevation);

    const nextPos = dir.multiplyScalar(40);
    const intensity = 3.2 * day;
    if (!this.sun.position.equals(nextPos) || this.sun.intensity !== intensity) {
      this.sun.position.copy(nextPos);
      this.sun.intensity = intensity;
      this.sun.visible = intensity > 0.01;
      this.sun.color.setHSL(0.09, 0.9, 0.62 + 0.3 * smoothstep(0, 30, elevation));
      this.hemi.intensity = 0.06 + 0.9 * day;
      this.hemi.color.set(day > 0.5 ? 0xdfe8ff : 0x8fa6ff);
      this.renderer.toneMappingExposure = 0.95 + 0.25 * (1 - day);
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
    this.scene.fog = new Fog(p.background, 38, 95);
    this.ground.material.color.set(p.ground);
    const gridMat = this.grid.material as LineBasicMaterial;
    gridMat.color.set(p.grid);
    gridMat.opacity = p.gridOpacity;
    this.wallMaterial.color.set(p.wall);
    this.wallLines.material.color.set(p.wallLine);
    this.wallLines.material.opacity = p.wallLineOpacity;
    this.floorMaterials.wood.color.set(p.wood);
    this.floorMaterials.tile.color.set(p.tile);
    this.floorMaterials.stone.color.set(p.stone);
    this.furnitureMaterials.dark.color.set(p.furnitureDark);
    this.furnitureMaterials.light.color.set(p.furnitureLight);
    this.furnitureMaterials.accent.color.set(p.accent);
    for (const sh of this.shutters) sh.mesh.material.color.set(p.shutter);
    for (const l of this.lamps) if (!l.on) l.bulb.material.color.set(p.fixture);
    this.dirty = true;
  }

  resetView(): void {
    this.returningHome = true;
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

    if (!this.returningHome && performance.now() - this.lastInteraction > IDLE_RETURN_MS) {
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

  dispose(): void {
    cancelAnimationFrame(this.raf);
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
