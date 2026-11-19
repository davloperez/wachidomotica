import { existsSync, readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

/**
 * - `npm run dev`   → sirve dev/index.html con un `hass` real (si hay HA_URL/HA_TOKEN en .env) o simulado.
 * - `npm run build` → genera un único módulo ES autocontenido en dist/functional-v2.js.
 */
export default defineConfig(({ command, mode }) => {
  // .env propio del dashboard o, si no hay, el compartido en villawachitos/dashboards/.env
  const env = loadEnv(mode, existsSync(".env") ? process.cwd() : "..", "");
  const isServe = command === "serve";

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      // Las credenciales solo se inyectan en el servidor de desarrollo, nunca en el bundle final.
      __DEV_HA_URL__: JSON.stringify(isServe ? (env.HA_URL ?? "") : ""),
      __DEV_HA_TOKEN__: JSON.stringify(isServe ? (env.HA_TOKEN ?? "") : ""),
      // En modo librería Vite no sustituye process.env.NODE_ENV y en el navegador `process` no existe.
      ...(isServe ? {} : { "process.env.NODE_ENV": JSON.stringify("production") }),
    },
    server: {
      host: true,
      port: 5176,
      fs: { allow: [".."] },
      // Si el sistema agota los "file watchers" de inotify (ENOSPC), arrancar con VITE_USE_POLLING=1.
      watch: env.VITE_USE_POLLING === "1" ? { usePolling: true, interval: 300 } : undefined,
    },
    build: {
      target: "es2022",
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      minify: true,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      // En modo librería ES Vite conserva los espacios; forzamos la minificación completa.
      rolldownOptions: { output: { minify: true } },
      lib: {
        entry: "src/index.ts",
        formats: ["es"],
        fileName: () => "functional-v2.js",
      },
    },
  };
});
