#!/usr/bin/env node
/**
 * Despliegue genérico de un dashboard personalizado en Home Assistant.
 * Se ejecuta desde la carpeta del dashboard (npm run deploy) y lee su `deploy.json`:
 *
 *   {
 *     "bundle": "dist/mi-dashboard.js",            // archivo generado por el build
 *     "wwwDir": "/config/www/mi-dashboard",          // destino en HA (/config/www → /local)
 *     "card": "dashboard.config.json",               // configuración de la tarjeta
 *     "dashboard": { "url_path": "mi-dash", "title": "Mi dash", "icon": "mdi:…" },
 *     "view": { "title": "Main", "path": "main" },
 *     "kiosk": true                                  // kiosk-mode: sin cabecera ni barra lateral
 *   }
 *
 *  1. Sube el bundle por SSH (app "Terminal & SSH"; solo necesita `ssh`), con escritura atómica.
 *  2. Registra/actualiza el recurso de Lovelace con `?v=<hash>` (HA cachea /local 31 días).
 *  3. Crea el dashboard si no existe y publica su configuración (el repositorio es la fuente de verdad).
 *
 * Credenciales en `.env` de la carpeta del dashboard o, si no existe, en `villawachitos/dashboards/.env`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";

const ROOT = process.cwd();

const c = {
  step: (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`),
  ok: (msg) => console.log(`\x1b[32m✔\x1b[0m ${msg}`),
  fail: (msg) => {
    console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
    process.exit(1);
  },
};

/* ---------- Configuración ---------- */

const deployFile = resolve(ROOT, "deploy.json");
if (!existsSync(deployFile)) c.fail(`No existe ${deployFile}. Ejecuta el deploy desde la carpeta del dashboard.`);
const deploy = JSON.parse(readFileSync(deployFile, "utf8"));

const envFile = [resolve(ROOT, ".env"), resolve(ROOT, "../.env")].find((f) => existsSync(f));
if (!envFile) c.fail("No hay .env (ni en la carpeta del dashboard ni en villawachitos/dashboards/). Copia .env.example.");
process.loadEnvFile(envFile);

const env = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") c.fail(`Falta la variable ${name} en ${envFile}`);
  return v;
};

const HA_URL = env("HA_URL").replace(/\/$/, "");
const HA_TOKEN = env("HA_TOKEN");
const SSH_HOST = env("HA_SSH_HOST");
const SSH_PORT = env("HA_SSH_PORT", "22");
const SSH_USER = env("HA_SSH_USER", "root");
const SSH_KEY = process.env.HA_SSH_KEY?.replace(/^~/, homedir());

const BUNDLE = resolve(ROOT, deploy.bundle);
const FILE_NAME = basename(BUNDLE);
const WWW_DIR = String(deploy.wwwDir).replace(/\/$/, "");
if (!WWW_DIR.startsWith("/config/www/")) c.fail("wwwDir debe estar dentro de /config/www/");
if (!existsSync(BUNDLE)) c.fail("No hay bundle. Ejecuta antes `npm run build`.");

const cardConfig = JSON.parse(readFileSync(resolve(ROOT, deploy.card), "utf8"));
const bundle = readFileSync(BUNDLE);
const hash = createHash("sha256").update(bundle).digest("hex").slice(0, 12);
const localUrlBase = `/local/${WWW_DIR.slice("/config/www/".length)}/${FILE_NAME}`;
const resourceUrl = `${localUrlBase}?v=${hash}`;
const DASHBOARD = { show_in_sidebar: true, require_admin: false, mode: "storage", ...deploy.dashboard };
const VIEW = { title: "Main", path: "main", ...deploy.view };

/* ---------- 1. Subida por SSH ---------- */

function upload() {
  return new Promise((ok, ko) => {
    const target = `${WWW_DIR}/${FILE_NAME}`;
    const args = [
      "-p",
      SSH_PORT,
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      // Primera conexión: guarda la huella del servidor; después, ssh rechaza si cambia.
      "StrictHostKeyChecking=accept-new",
      ...(SSH_KEY ? ["-i", SSH_KEY] : []),
      `${SSH_USER}@${SSH_HOST}`,
      `mkdir -p '${WWW_DIR}' && cat > '${target}.tmp' && mv '${target}.tmp' '${target}' && wc -c < '${target}'`,
    ];
    const ssh = spawn("ssh", args, { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    ssh.stdout.on("data", (d) => (out += d));
    ssh.on("error", ko);
    ssh.on("close", (code) => {
      if (code !== 0) return ko(new Error(`ssh terminó con código ${code}`));
      const remoteSize = Number.parseInt(out.trim(), 10);
      if (remoteSize !== bundle.length)
        return ko(new Error(`tamaño remoto ${remoteSize} ≠ local ${bundle.length}`));
      ok();
    });
    createReadStream(BUNDLE).pipe(ssh.stdin);
  });
}

/* ---------- 2 y 3. API websocket de Home Assistant ---------- */

class HaSocket {
  #ws;
  #id = 0;
  #pending = new Map();

  async open() {
    const wsUrl = `${HA_URL.replace(/^http/, "ws")}/api/websocket`;
    this.#ws = new WebSocket(wsUrl);
    await new Promise((ok, ko) => {
      this.#ws.addEventListener("error", () => ko(new Error(`No se pudo conectar a ${wsUrl}`)));
      this.#ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "auth_required")
          this.#ws.send(JSON.stringify({ type: "auth", access_token: HA_TOKEN }));
        else if (msg.type === "auth_ok") ok();
        else if (msg.type === "auth_invalid") ko(new Error("Token de Home Assistant no válido"));
        else if (msg.type === "result") {
          const p = this.#pending.get(msg.id);
          this.#pending.delete(msg.id);
          if (msg.success) p?.ok(msg.result);
          else p?.ko(new Error(`${msg.error?.code}: ${msg.error?.message}`));
        }
      });
    });
  }

  call(payload) {
    const id = ++this.#id;
    return new Promise((ok, ko) => {
      this.#pending.set(id, { ok, ko });
      this.#ws.send(JSON.stringify({ id, ...payload }));
    });
  }

  close() {
    this.#ws?.close();
  }
}

async function registerResource(ha) {
  const resources = await ha.call({ type: "lovelace/resources" });
  const existing = resources.filter((r) => r.url.split("?")[0] === localUrlBase);
  if (existing.length === 0) {
    await ha.call({ type: "lovelace/resources/create", res_type: "module", url: resourceUrl });
    return "creado";
  }
  const [first, ...dupes] = existing;
  await ha.call({
    type: "lovelace/resources/update",
    resource_id: first.id,
    res_type: "module",
    url: resourceUrl,
  });
  for (const d of dupes) await ha.call({ type: "lovelace/resources/delete", resource_id: d.id });
  return first.url === resourceUrl ? "sin cambios" : "actualizado";
}

async function publishDashboard(ha) {
  const dashboards = await ha.call({ type: "lovelace/dashboards/list" });
  let created = false;
  if (!dashboards.some((d) => d.url_path === DASHBOARD.url_path)) {
    await ha.call({ type: "lovelace/dashboards/create", ...DASHBOARD });
    created = true;
  }
  await ha.call({
    type: "lovelace/config/save",
    url_path: DASHBOARD.url_path,
    config: {
      // kiosk-mode (Marketplace): oculta cabecera y barra lateral. Para salir: añade ?disable_km a la URL.
      ...(deploy.kiosk === false ? {} : { kiosk_mode: { kiosk: true } }),
      views: [{ ...VIEW, type: "panel", cards: [cardConfig] }],
    },
  });
  return created ? "creado" : "actualizado";
}

/* ---------- Main ---------- */

try {
  c.step(`Subiendo ${FILE_NAME} (${(bundle.length / 1024).toFixed(0)} KB) a ${SSH_USER}@${SSH_HOST}:${WWW_DIR}`);
  await upload();
  c.ok("Archivo subido");

  const ha = new HaSocket();
  c.step(`Conectando con ${HA_URL}`);
  await ha.open();
  c.ok(`Recurso Lovelace ${await registerResource(ha)} → ${resourceUrl}`);
  c.ok(`Dashboard ${await publishDashboard(ha)} → ${HA_URL}/${DASHBOARD.url_path}/${VIEW.path}`);
  ha.close();

  console.log("\nEn la tablet: recarga la página (o Fully Kiosk → Reload) para cargar la nueva versión.");
} catch (err) {
  c.fail(err instanceof Error ? err.message : String(err));
}
