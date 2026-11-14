#!/usr/bin/env node
/**
 * Comprobación tras el build: el bundle debe funcionar en el navegador tal cual lo carga
 * Home Assistant, sin variables de Node (`process`) ni restos de credenciales de desarrollo.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/analytics-dashboard-v1.js");
const code = readFileSync(file, "utf8");

const forbidden = [
  [/\bprocess\.env\b/, "referencia a process.env (no existe en el navegador)"],
  [/__DEV_HA_(URL|TOKEN)__/, "marcador de credenciales de desarrollo"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, "algo que parece un token JWT"],
];

const problems = forbidden.filter(([re]) => re.test(code)).map(([, msg]) => msg);
if (problems.length) {
  console.error(`\x1b[31m✖ Bundle no válido:\n  - ${problems.join("\n  - ")}\x1b[0m`);
  process.exit(1);
}
console.log(`\x1b[32m✔\x1b[0m Bundle verificado (${(code.length / 1024).toFixed(0)} KB)`);
