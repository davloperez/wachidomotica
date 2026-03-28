#!/usr/bin/env node
/**
 * Discover ESPHome devices on the local network.
 * Compares found devices against the YAML configs in this project.
 *
 * Requirements: npm install bonjour-service
 */

const fs = require("fs");
const path = require("path");
const { Bonjour } = require("bonjour-service");

const DISCOVERY_TIMEOUT = 5000; // ms
const SCRIPT_DIR = __dirname;

// ── Load known devices from project YAML files ────────────────────────────────

function loadProjectDevices() {
  const devices = {};
  const files = fs
    .readdirSync(SCRIPT_DIR)
    .filter(
      (f) =>
        f.startsWith("persiana-") &&
        f.endsWith(".yaml") &&
        f !== "persiana-base.yaml",
    )
    .sort();

  for (const file of files) {
    const text = fs.readFileSync(path.join(SCRIPT_DIR, file), "utf8");
    const nameMatch = text.match(/^\s*name:\s*([^\s#]+)/m);
    const ipMatch = text.match(/static_ip:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
    if (nameMatch) {
      devices[nameMatch[1]] = ipMatch ? ipMatch[1] : null;
    }
  }
  return devices;
}

// ── mDNS discovery ─────────────────────────────────────────────────────────────

function discoverMdns() {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const found = {};

    const browser = bonjour.find({ type: "esphomelib" }, (service) => {
      const name = service.name;
      const ip = service.addresses?.find((a) => a.includes(".")) ?? null;
      const port = service.port;
      const version = service.txt?.version ?? "?";
      found[name] = { ip, port, version };
    });

    setTimeout(() => {
      browser.stop();
      bonjour.destroy();
      resolve(found);
    }, DISCOVERY_TIMEOUT);
  });
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

const pad = (str, len) => String(str).padEnd(len);

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  process.stdout.write(
    `Searching for ESPHome devices (mDNS, ${DISCOVERY_TIMEOUT / 1000}s)...\n\n`,
  );

  const projectDevices = loadProjectDevices();
  const discovered = await discoverMdns();

  // ── In-project devices ──────────────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("DEVICES IN THIS PROJECT");
  console.log("=".repeat(60));

  for (const [name, staticIp] of Object.entries(projectDevices).sort()) {
    if (discovered[name]) {
      const d = discovered[name];
      const ipInfo = `${d.ip}:${d.port}`;
      console.log(`  [✓] ${pad(name, 30)}  ${pad(ipInfo, 22)}  v${d.version}`);
    } else {
      const ipInfo = staticIp ?? "no static IP";
      console.log(
        `  [✗] ${pad(name, 30)}  ${pad(ipInfo, 22)}  OFFLINE / not found`,
      );
    }
  }

  // ── Unknown devices ─────────────────────────────────────────────────────────
  const unknown = Object.entries(discovered)
    .filter(([n]) => !(n in projectDevices))
    .sort(([a], [b]) => a.localeCompare(b));

  console.log();
  console.log("=".repeat(60));
  console.log("ESPHOME DEVICES NOT IN THIS PROJECT");
  console.log("=".repeat(60));

  if (unknown.length) {
    for (const [name, d] of unknown) {
      const ipInfo = `${d.ip}:${d.port}`;
      console.log(`  [?] ${pad(name, 30)}  ${pad(ipInfo, 22)}  v${d.version}`);
    }
  } else {
    console.log("  (none found)");
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const online = Object.keys(projectDevices).filter(
    (n) => discovered[n],
  ).length;
  const total = Object.keys(projectDevices).length;
  console.log();
  console.log(
    `Summary: ${online}/${total} project devices online, ${unknown.length} unknown device(s) found.`,
  );
}

main();
