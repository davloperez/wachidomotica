#!/bin/sh
# Lee las opciones de la app (Ajustes → Apps → Mealie MCP → Configuración) y arranca el servidor.
opt() { node -e "const v=require('/data/options.json')['$1'];process.stdout.write(v??'')"; }
export MEALIE_URL="$(opt mealie_url)"
export MEALIE_API_TOKEN="$(opt api_token)"
export MCP_ACCESS_KEY="$(opt access_key)"
export PORT=8765
if [ -z "$MEALIE_API_TOKEN" ]; then
  echo "Falta el token: configura 'api_token' en las opciones de la app." >&2
  exit 1
fi
cd /app && exec node src/server.ts
