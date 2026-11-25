import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { tools } from "./tools.ts";
import { docsPage } from "./docs.ts";

const PORT = Number(process.env.PORT ?? 8765);
const ACCESS_KEY = process.env.MCP_ACCESS_KEY || "";

/** Un servidor MCP nuevo por petición (modo sin estado): no hay sesiones que se queden colgadas. */
function buildServer() {
  const server = new McpServer({ name: "mealie", version: "0.1.0" });
  for (const t of tools) {
    server.registerTool(
      t.name,
      {
        description: t.description,
        inputSchema: t.shape,
        annotations: { readOnlyHint: !!t.readOnly, destructiveHint: !!t.destructive, openWorldHint: false },
      },
      async (args: any) => {
        try {
          const result = await t.run(args);
          return { content: [{ type: "text" as const, text: JSON.stringify(result ?? null, null, 2) }] };
        } catch (e) {
          return { isError: true, content: [{ type: "text" as const, text: (e as Error).message }] };
        }
      },
    );
  }
  return server;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

const send = (res: ServerResponse, status: number, type: string, body: string) => {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
};

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, "text/html; charset=utf-8", docsPage(tools, { port: PORT, protectedByKey: !!ACCESS_KEY, host: req.headers.host }));
    }
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, "application/json", '{"ok":true}');
    if (url.pathname !== "/mcp") return send(res, 404, "text/plain", "No encontrado. La documentación está en /");

    if (ACCESS_KEY && req.headers.authorization !== `Bearer ${ACCESS_KEY}`) {
      return send(res, 401, "application/json", '{"error":"Falta o es incorrecta la clave de acceso (Authorization: Bearer ...)"}');
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(res, 405, "application/json", '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Solo POST (modo sin estado)"},"id":null}');
    }
    const body = await readBody(req);
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, "application/json", JSON.stringify({ error: (e as Error).message }));
  }
});

http.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i!.address);
  console.log(`Mealie MCP escuchando en el puerto ${PORT}`);
  for (const ip of ips) console.log(`  Documentación: http://${ip}:${PORT}/   ·   MCP: http://${ip}:${PORT}/mcp`);
});
