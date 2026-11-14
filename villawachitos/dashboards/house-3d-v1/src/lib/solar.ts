/**
 * Posición y luminosidad del sol calculadas localmente (sin depender de `sun.sun`).
 *
 * Posición: algoritmo de efemérides solares simplificado (el mismo de SunCalc / Astronomy Answers),
 * con error < 0,5° en azimut y elevación, de sobra para iluminar una maqueta.
 * Luminosidad: irradiancia directa de cielo despejado con la masa de aire de Kasten-Young y el
 * modelo de Meinel, atenuada por la nubosidad.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
/** Oblicuidad de la eclíptica */
const OBLIQUITY = RAD * 23.4397;
/** Constante solar (W/m²) */
const SOLAR_CONSTANT = 1361;

export interface SunPosition {
  /** Grados desde el norte, en sentido horario (90 = este, 180 = sur). */
  azimuth: number;
  /** Grados sobre el horizonte, con refracción atmosférica. Negativo de noche. */
  elevation: number;
}

export function sunPosition(date: Date, latitude: number, longitude: number): SunPosition {
  const d = date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;

  // Coordenadas eclípticas y ecuatoriales del sol
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L));

  // Ángulo horario local
  const phi = RAD * latitude;
  const sidereal = RAD * (280.16 + 360.9856235 * d) + RAD * longitude;
  const H = sidereal - ra;

  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  // Azimut desde el sur hacia el oeste → convertir a brújula (desde el norte, horario).
  const azSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));

  const elevation = altitude / RAD + refraction(altitude / RAD);
  const azimuth = (((azSouth / RAD + 180) % 360) + 360) % 360;
  return { azimuth, elevation };
}

/** Refracción atmosférica (grados) según Sæmundsson; eleva el sol aparente cerca del horizonte. */
function refraction(h: number): number {
  const hh = Math.max(h, -1.9);
  return 1.02 / Math.tan(RAD * (hh + 10.3 / (hh + 5.11))) / 60;
}

export interface SunLight {
  /** Irradiancia directa normal estimada (W/m²) con la nubosidad aplicada. */
  directNormal: number;
  /** Fracción de luz difusa del cielo (0 noche … 1 mediodía despejado). */
  sky: number;
}

/**
 * Luz solar para una elevación y nubosidad (0-100 %).
 * Cielo despejado: DNI = 1361 · 0,7^(AM^0,678); el crepúsculo civil (hasta −6°) aún aporta cielo.
 */
export function sunLight(elevation: number, cloudCoverage = 0): SunLight {
  const cc = Math.min(1, Math.max(0, cloudCoverage / 100));
  let dni = 0;
  if (elevation > 0) {
    const airMass = 1 / (Math.sin(RAD * elevation) + 0.50572 * Math.pow(elevation + 6.07995, -1.6364));
    dni = SOLAR_CONSTANT * Math.pow(0.7, Math.pow(airMass, 0.678));
  }
  // Las nubes bloquean casi toda la luz directa; la difusa baja menos (Kasten-Czeplak).
  const direct = dni * (1 - 0.92 * Math.pow(cc, 1.6));
  const daylight = smooth(-6, 20, elevation);
  const sky = daylight * (1 - 0.45 * Math.pow(cc, 3.4));
  return { directNormal: direct, sky };
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Nombre corto del punto cardinal para un azimut. */
export function compassPoint(azimuth: number): string {
  const points = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return points[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
}
