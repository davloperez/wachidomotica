/** Colores de la escena 3D para cada tema. La iluminación (sol, lámparas) es siempre la real. */
export interface Palette {
  background: string;
  ground: string;
  grid: string;
  gridOpacity: number;
  wall: string;
  wallLine: string;
  wallLineOpacity: number;
  wood: string;
  tile: string;
  stone: string;
  furnitureDark: string;
  furnitureLight: string;
  accent: string;
  shutter: string;
  fixture: string;
}

export const PALETTES: Record<"light" | "dark", Palette> = {
  dark: {
    background: "#04060c",
    ground: "#0a0f1c",
    grid: "#35e8ff",
    gridOpacity: 0.07,
    wall: "#b9c2d3",
    wallLine: "#35e8ff",
    wallLineOpacity: 0.9,
    wood: "#8a6a4c",
    tile: "#8e98a8",
    stone: "#7d7569",
    furnitureDark: "#3a4152",
    furnitureLight: "#c9cfdb",
    accent: "#6d5bd0",
    shutter: "#9aa4b5",
    fixture: "#6b7385",
  },
  light: {
    background: "#e9eef6",
    ground: "#dde4ee",
    grid: "#0a84ff",
    gridOpacity: 0.08,
    wall: "#f7f8fb",
    wallLine: "#0a84ff",
    wallLineOpacity: 0.55,
    wood: "#c9a37c",
    tile: "#d5dae2",
    stone: "#cfc7ba",
    furnitureDark: "#5b6475",
    furnitureLight: "#eef1f5",
    accent: "#7a3cff",
    shutter: "#b8c0cc",
    fixture: "#c3c9d4",
  },
};
