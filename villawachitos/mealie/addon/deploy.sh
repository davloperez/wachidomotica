#!/usr/bin/env bash
# Sube la app a Home Assistant (/local_apps/mealie_mcp) por SSH y la instala o reconstruye.
# Credenciales SSH: villawachitos/dashboards/.env (las mismas que el deploy del dashboard).
# El token de Mealie se toma de ../.env y se guarda en las opciones de la app (no se imprime).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ../dashboards/.env; . ./.env; set +a
KEY="${HA_SSH_KEY/#\~/$HOME}"
SSH=(ssh ${KEY:+-i "$KEY"} -p "${HA_SSH_PORT:-22}" -o BatchMode=yes "${HA_SSH_USER:-root}@$HA_SSH_HOST")
SLUG=local_mealie_mcp

echo "▸ Subiendo ficheros a /local_apps/mealie_mcp"
tar -czf - -C addon config.yaml Dockerfile run.sh DOCS.md -C .. src package.json package-lock.json |
  "${SSH[@]}" 'rm -rf /local_apps/mealie_mcp && mkdir -p /local_apps/mealie_mcp && tar -xzf - -C /local_apps/mealie_mcp'

echo "▸ Recargando la tienda de apps"
"${SSH[@]}" 'ha store reload >/dev/null'

# `ha apps info` también responde para apps de la tienda sin instalar, así que se consulta el estado real.
if "${SSH[@]}" "curl -sf -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" http://supervisor/addons/$SLUG/info | grep -qv \\\"installed\\\":false"; then
  echo "▸ Reconstruyendo la app"
  "${SSH[@]}" "ha apps rebuild $SLUG"
else
  echo "▸ Instalando la app (construye la imagen; puede tardar unos minutos)"
  "${SSH[@]}" "ha apps install $SLUG"
fi

echo "▸ Guardando opciones y arrancando"
# El JSON viaja por stdin (no por argumentos) para que el token no aparezca en la lista de procesos.
printf '{"options":{"mealie_url":"%s","api_token":"%s","access_key":"%s"}}' \
  "${MEALIE_URL:-http://192.168.0.10:9000}" "$MEALIE_API_TOKEN" "${MCP_ACCESS_KEY:-}" |
  "${SSH[@]}" "curl -sf -X POST -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" -H 'Content-Type: application/json' -d @- http://supervisor/addons/$SLUG/options >/dev/null"
"${SSH[@]}" "ha apps restart $SLUG >/dev/null 2>&1 || ha apps start $SLUG"
echo "✔ Hecho. Logs: ssh … ha apps logs $SLUG"
