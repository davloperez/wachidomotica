# Mealie MCP

Servidor [MCP](https://modelcontextprotocol.io) que deja a Claude gestionar Mealie (`http://192.168.0.10:9000`)
desde cualquier equipo de la red local: **recetas, ingredientes, lista de la compra y menú semanal**.

La página `http://192.168.0.10:8765/` muestra la documentación de todas las herramientas
y las instrucciones de conexión.

## Qué puede hacer (37 herramientas)

| Área | Herramientas |
| --- | --- |
| Recetas | buscar, ver, crear (con ingredientes, pasos, categorías, etiquetas), modificar, duplicar, **borrar**, importar desde URL, **imagen** (desde una URL pública o un fichero en base64; quitarla) |
| Ingredientes | añadir/quitar un ingrediente o paso de una receta, analizar texto, catálogo de alimentos y unidades (listar, crear, renombrar, borrar) |
| Categorías y etiquetas | listar, borrar (se crean solas al usarlas en una receta) |
| Lista de la compra | listas (crear/borrar), ver artículos, añadir, marcar comprado, quitar, añadir los ingredientes de una receta |
| Menú semanal | ver un rango de fechas, planificar (receta o nota libre), cambiar, quitar, receta aleatoria |

Las herramientas que borran van marcadas como destructivas: Claude Code pide confirmación antes de usarlas.

Los ingredientes se guardan por defecto **como texto tal cual** (`200 g de harina`), porque el analizador de
Mealie está pensado para inglés. Con `parse: true` se intenta separar cantidad/unidad/alimento.

## Dónde corre: app de Home Assistant (`local_mealie_mcp`)

El servidor vive en HA como app local («Mealie MCP», Ajustes → Apps): arranca con HA, se reinicia sola y tiene
sus logs. Sus ficheros están en `addon/` y se instalan en `/local_apps/mealie_mcp` de HA.

- **Instalar o actualizar**: `npm run deploy:app` (tarea de VSCode «Mealie MCP: desplegar app en Home Assistant»).
  Sube el código por SSH (credenciales de `villawachitos/dashboards/.env`), construye la imagen y guarda las opciones
  (`MEALIE_URL`, `MEALIE_API_TOKEN` y `MCP_ACCESS_KEY` de `mealie/.env`). **Sobrescribe la app en el HA real.**
- **Opciones** (token, URL, clave opcional): también se editan en HA, en la pestaña Configuración de la app.
- **Logs**: `ha apps logs local_mealie_mcp` (terminal de HA) o la pestaña Registro de la app.
- Documentación y comando de conexión: `http://192.168.0.10:8765/`.

## Desarrollo local (opcional)

1. `npm ci` y crea `.env` a partir de `.env.example` (el `.env` está en `.gitignore`).
2. `npm start` (tarea «Mealie MCP: iniciar servidor») levanta el servidor en tu equipo, en el puerto 8765.
3. `npm run smoke [url]` comprueba todo el circuito contra Mealie (crea y borra datos `zz-prueba-mcp`). Sin argumento
   prueba `http://localhost:8765/mcp`; pasa la URL de HA para probar la app desplegada.

## Conectar otro equipo (p. ej. Windows con Claude Code)

No hace falta clonar nada. En PowerShell o CMD, una sola vez:

```
claude mcp add --transport http --scope user mealie http://192.168.0.10:8765/mcp
```

Después, desde cualquier carpeta, en Claude Code: «¿Qué recetas tengo con pollo?», «Planifica la cena del jueves»,
«Añade a la compra lo que falta para esta receta».

## Seguridad

- El token de Mealie nunca sale del servidor; los clientes solo hablan con este MCP.
- Por defecto **cualquier equipo de la red local** puede usarlo. Para exigir una clave, define `MCP_ACCESS_KEY` en `.env`
  y conecta con `--header "Authorization: Bearer LA_CLAVE"` añadido al comando anterior.
- No lo expongas a Internet.

## Estructura

- `addon/` app de HA (config.yaml, Dockerfile, run.sh, deploy.sh).
- `src/client.ts` cliente de la API REST de Mealie · `src/tools.ts` herramientas (única fuente: también genera la
  documentación) · `src/docs.ts` página `/` · `src/server.ts` servidor HTTP sin estado en `/mcp`.
- Para añadir una herramienta, basta una llamada `def(...)` en `src/tools.ts`.
