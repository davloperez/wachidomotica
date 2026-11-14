#!/usr/bin/env node
/**
 * Despliegue del Analytics Dashboard v1 en Home Assistant.
 *
 *  1. Sube dist/analytics-dashboard-v1.js a /config/www/analytics-dashboard-v1/ por SSH
 *     (app "Terminal & SSH"; solo necesita `ssh`, sin rsync ni scp).
 *  2. Registra o actualiza el recurso de Lovelace con `?v=<hash>` para invalidar la caché
 *     de 31 días que Home Assistant aplica a /local.
 *  3. Crea (si no existe) el dashboard `analytics-v1` y publica su configuración
 *     a partir de dashboard.config.json, de modo que el repositorio es la fuente de verdad.
 *
 * Configuración en .env (ver .env.example). Uso: `npm run deploy` o la tarea de VSCode.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = resolve(ROOT, "dist/analytics-dashboard-v1.js");
const FILE_NAME = "analytics-dashboard-v1.js";
const DASHBOARD = {
  url_path: "analytics-v1",
  title: "Analytics v1",
  icon: "mdi:chart-timeline-variant-shimmer",
  show_in_sidebar: true,
  require_admin: false,
  mode: "storage",
};

const c = {
  step: (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`),
  ok: (msg) => console.log(`\x1b[32m✔\x1b[0m ${msg}`),
  fail: (msg) => {
    console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
    process.exit(1);
  },
};

/* ---------- Configuración ---------- */

const envFile = resolve(ROOT, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
else c.fail(`No existe ${envFile}. Copia .env.example a .env y rellénalo.`);

const env = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") c.fail(`Falta la variable ${name} en .env`);
  return v;
};

const HA_URL = env("HA_URL").replace(/\/$/, "");
const HA_TOKEN = env("HA_TOKEN");
const SSH_HOST = env("HA_SSH_HOST");
const SSH_PORT = env("HA_SSH_PORT", "22");
const SSH_USER = env("HA_SSH_USER", "root");
const SSH_KEY = process.env.HA_SSH_KEY?.replace(/^~/, homedir());
const WWW_DIR = env("HA_WWW_DIR", "/config/www/analytics-dashboard-v1").replace(/\/$/, "");

if (!WWW_DIR.startsWith("/config/www/")) c.fail("HA_WWW_DIR debe estar dentro de /config/www/");
if (!existsSync(BUNDLE)) c.fail("No hay bundle. Ejecuta antes `npm run build`.");

const cardConfig = JSON.parse(readFileSync(resolve(ROOT, "dashboard.config.json"), "utf8"));
const bundle = readFileSync(BUNDLE);
const hash = createHash("sha256").update(bundle).digest("hex").slice(0, 12);
const localUrlBase = `/local/${WWW_DIR.slice("/config/www/".length)}/${FILE_NAME}`;
const resourceUrl = `${localUrlBase}?v=${hash}`;

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
      // Escritura atómica: se sube a un temporal y se renombra.
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
      kiosk_mode: { kiosk: true },
      views: [{ title: "Analytics", path: "main", type: "panel", cards: [cardConfig] }],
    },
  });
  return created ? "creado" : "actualizado";
}

/* ---------- Main ---------- */

try {
  c.step(
    `Subiendo ${FILE_NAME} (${(bundle.length / 1024).toFixed(0)} KB) a ${SSH_USER}@${SSH_HOST}:${WWW_DIR}`,
  );
  await upload();
  c.ok("Archivo subido");

  const ha = new HaSocket();
  c.step(`Conectando con ${HA_URL}`);
  await ha.open();
  c.ok(`Recurso Lovelace ${await registerResource(ha)} → ${resourceUrl}`);
  c.ok(`Dashboard ${await publishDashboard(ha)} → ${HA_URL}/${DASHBOARD.url_path}/main`);
  ha.close();

  console.log("\nEn la tablet: recarga la página (o Fully Kiosk → Reload) para cargar la nueva versión.");
} catch (err) {
  c.fail(err instanceof Error ? err.message : String(err));
}
