/** Colores de la escena 3D para cada tema. La iluminación (sol, lámparas) es siempre la real. */
export interface Palette {
  background: string;
  ground: string;
  grid: string;
  gridOpacity: number;
  wall: string;
  wallLine: string;
  wallLineOpacity: number;
  floor: string;
  furnitureDark: string;
  furnitureLight: string;
  accent: string;
  shutter: string;
  fixture: string;
  lawn: string;
  paving: string;
  water: string;
  basin: string;
  fence: string;
}

export const PALETTES: Record<"light" | "dark", Palette> = {
  dark: {
    background: "#04060c",
    ground: "#0a0f1c",
    grid: "#35e8ff",
    gridOpacity: 0.07,
    wall: "#f4f5f7",
    wallLine: "#35e8ff",
    wallLineOpacity: 0.9,
    floor: "#d3c3a6",
    furnitureDark: "#3a4152",
    furnitureLight: "#c9cfdb",
    accent: "#6d5bd0",
    shutter: "#2b2d32",
    fixture: "#6b7385",
    lawn: "#1f3b26",
    paving: "#4a4d55",
    water: "#1fb5d6",
    basin: "#c9bb9d",
    fence: "#24272c",
  },
  light: {
    background: "#e9eef6",
    ground: "#dde4ee",
    grid: "#0a84ff",
    gridOpacity: 0.08,
    wall: "#f8f8f6",
    wallLine: "#0a84ff",
    wallLineOpacity: 0.55,
    floor: "#ddceb3",
    furnitureDark: "#5b6475",
    furnitureLight: "#eef1f5",
    accent: "#7a3cff",
    shutter: "#2b2d32",
    fixture: "#c3c9d4",
    lawn: "#8fbf72",
    paving: "#ddd6c8",
    water: "#3ccbe8",
    basin: "#dccfb5",
    fence: "#1c1e22",
  },
};

/** Colores reales de materiales de la casa: no dependen del tema. */
export const MATERIAL_COLORS = {
  white: "#f3f3f1",
  wood: "#a87a4f",
  beige: "#e4d8c1",
  sofa: "#e6dbc6",
  frame: "#16171a",
} as const;
