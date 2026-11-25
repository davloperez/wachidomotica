import type { ToolDef } from "./tools.ts";
import { z } from "zod";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Describe los parámetros de una herramienta a partir de su esquema zod. */
function params(shape: z.ZodRawShape): string {
  const entries = Object.entries(shape);
  if (!entries.length) return `<span class="muted">sin parámetros</span>`;
  return entries
    .map(([k, schema]) => {
      const v = schema as z.ZodType;
      const opt = v.safeParse(undefined).success;
      const desc = v.description ? ` — ${esc(v.description)}` : "";
      return `<code>${k}</code>${opt ? "" : " <b>*</b>"}${desc}`;
    })
    .join("<br>");
}

export function docsPage(tools: ToolDef[], o: { port: number; protectedByKey: boolean; host?: string }): string {
  const host = o.host ?? `IP-DEL-SERVIDOR:${o.port}`;
  const groups = [...new Set(tools.map((t) => t.group))];
  const keyHdr = o.protectedByKey ? ` --header "Authorization: Bearer TU_CLAVE"` : "";
  const sections = groups
    .map(
      (g) => `<h2>${esc(g)}</h2>` +
        tools.filter((t) => t.group === g).map((t) => `<div class="tool"><h3><code>${t.name}</code>${t.destructive ? ' <span class="tag danger">borra / modifica</span>' : t.readOnly ? ' <span class="tag">solo lectura</span>' : ""}</h3><p>${esc(t.description)}</p><p class="params">${params(t.shape)}</p></div>`).join(""),
    )
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mealie MCP</title>
<style>
:root{color-scheme:light dark;--bg:#fafaf7;--fg:#222;--mut:#777;--card:#fff;--line:#e3e3dc;--acc:#c2410c}
@media (prefers-color-scheme:dark){:root{--bg:#1a1a18;--fg:#e8e8e3;--mut:#999;--card:#242421;--line:#38382f;--acc:#fb923c}}
body{font:16px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:820px;margin:0 auto;padding:16px 16px 64px}
h1{margin-bottom:0}h2{margin-top:2em;border-bottom:1px solid var(--line);padding-bottom:4px}h3{margin:0 0 4px;font-size:1rem}
pre{background:var(--card);border:1px solid var(--line);padding:12px;border-radius:8px;overflow-x:auto}
code{font-family:ui-monospace,monospace;font-size:.92em}.tool{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:10px 0}
.tool p{margin:4px 0}.params{font-size:.9rem;color:var(--mut)}.muted{color:var(--mut)}
.tag{font:12px system-ui;border:1px solid var(--line);border-radius:10px;padding:1px 8px;color:var(--mut)}.tag.danger{color:var(--acc);border-color:var(--acc)}
</style></head><body>
<h1>Mealie MCP</h1><p class="muted">Recetas, ingredientes, lista de la compra y menú semanal de Villawachitos, para Claude.</p>
<h2>Cómo conectarlo (Claude Code en Windows)</h2>
<p>Una sola vez, en PowerShell o CMD:</p>
<pre>claude mcp add --transport http --scope user mealie http://${esc(host)}/mcp${keyHdr}</pre>
<p>Después abre Claude Code en cualquier carpeta y pídele cosas en lenguaje normal: «¿Qué recetas tengo con pollo?», «Planifica la cena del jueves con la lasaña», «Añade a la compra lo que falta para el cocido».</p>
<p>Comprueba que aparece con <code>claude mcp list</code> (o <code>/mcp</code> dentro de Claude Code). Si quieres que no pregunte en cada lectura, puedes permitir las herramientas de solo lectura; las que borran siempre piden confirmación.</p>
<h2>Datos técnicos</h2>
<p>Endpoint MCP: <code>POST /mcp</code> (Streamable HTTP, sin sesión). Comprobación: <code>GET /health</code>. ${o.protectedByKey ? "Requiere cabecera <code>Authorization: Bearer …</code>." : "Sin clave: accesible desde cualquier equipo de la red local."}</p>
<h1 style="font-size:1.5rem;margin-top:1.5em">Herramientas (${tools.length})</h1>
<p class="muted"><b>*</b> = obligatorio</p>
${sections}
</body></html>`;
}
