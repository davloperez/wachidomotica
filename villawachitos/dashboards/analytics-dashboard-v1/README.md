# Analytics Dashboard v1

Dashboard de Home Assistant con HTML/CSS 100 % propio, pensado para un wallpanel en horizontal
(Samsung Galaxy Tab S10 Ultra). Estética HUD/futurista con tema **claro**, **oscuro** y **auto**.

## Cómo funciona

- Es un **componente web** (Lit + TypeScript) que se compila a un único archivo JS autocontenido:
  incluye librerías (ECharts, iconos MDI) y fuentes (Space Grotesk, Orbitron), sin depender de internet.
- Home Assistant lo carga como **recurso de Lovelace** y lo muestra como única tarjeta en una vista
  `panel` (pantalla completa). **Kiosk Mode** oculta la cabecera y la barra lateral.
- Home Assistant inyecta el objeto `hass`: estados en tiempo real, llamadas websocket y servicios.
  No hay tokens dentro del dashboard.

```
dashboard.config.json   → configuración de la tarjeta (entidades). Se publica en HA con el deploy.
src/
  index.ts              → punto de entrada: fuentes + registro de la tarjeta
  analytics-dashboard.ts→ layout, KPIs, tema
  styles/               → tokens de diseño (light/dark), estilo de panel, fuentes embebidas
  widgets/              → reloj, gráfica (ECharts), arco solar
  data/                 → estadísticas del recorder, previsión del tiempo
  lib/                  → formato, iconos, gestión de tema
dev/                    → página de desarrollo con `hass` real (.env) o simulado
deploy.json             → destino y dashboard para el script común ../shared/scripts/deploy.mjs
```

## Puesta en marcha (una sola vez)

1. **Dependencias**: tarea de VSCode _Analytics v1: instalar dependencias_ (o `npm ci`).
2. **`.env`**: copia `villawachitos/dashboards/.env.example` a `villawachitos/dashboards/.env` (compartido por
   todos los dashboards; un `.env` dentro de esta carpeta tiene prioridad) y rellena:
   - `HA_URL`: URL de Home Assistant en tu red (p. ej. `http://192.168.0.10:8123`).
   - `HA_TOKEN`: token de larga duración (Perfil → Seguridad). Debe ser de un usuario administrador
     (registrar recursos y dashboards lo requiere).
   - `HA_SSH_HOST` / `HA_SSH_PORT` / `HA_SSH_USER`: acceso SSH.
3. **App "Terminal & SSH"** en Home Assistant (Ajustes → Apps):
   - En _Configuración_ → `authorized_keys`, pega tu clave pública (`~/.ssh/id_ed25519.pub`).
   - En _Red_, publica el puerto 22 (o el que prefieras y ponlo en `HA_SSH_PORT`).
   - Arráncala y activa _Iniciar al arrancar_.
   - Prueba: `ssh root@<host> ls /config/www`.

## Día a día

| Tarea de VSCode                       | Qué hace                                                            |
| ------------------------------------- | ------------------------------------------------------------------- |
| **Analytics v1: servidor de desarrollo** | Vite en `http://localhost:5173/dev/index.html` con recarga en vivo |
| **Analytics v1: build**                  | Typecheck + bundle en `dist/` (Ctrl+Shift+B)                        |
| **Analytics v1: deploy a Home Assistant**| Build → SSH → recurso `?v=<hash>` → dashboard `analytics-v1`        |
| Analytics v1: typecheck / lint           | Comprobaciones                                                      |

La página de desarrollo usa datos reales si `.env` tiene `HA_URL` y `HA_TOKEN`; si no (o con `?mock`),
usa datos simulados. La barra inferior permite simular el modo oscuro de Home Assistant.

> Si Vite avisa de `ENOSPC: System limit for number of file watchers`, la tarea ya arranca con
> `VITE_USE_POLLING=1`. Desde terminal: `VITE_USE_POLLING=1 npm run dev`.

### Qué hace el deploy

1. Sube `dist/analytics-dashboard-v1.js` a `/config/www/analytics-dashboard-v1/` por SSH (escritura atómica).
2. Registra o actualiza el recurso `/local/analytics-dashboard-v1/analytics-dashboard-v1.js?v=<hash>`.
   Home Assistant cachea `/local` 31 días; el hash obliga a los navegadores a descargar la nueva versión.
3. Crea el dashboard `analytics-v1` si no existe y publica su configuración (vista `panel` + `kiosk_mode`)
   a partir de `dashboard.config.json`.

Después, recarga la página en la tablet. Para salir del modo kiosko añade `?disable_km` a la URL.

## Configuración de la tarjeta

```json
{
  "type": "custom:analytics-dashboard-v1",
  "title": "Villawachitos",
  "theme": "auto",
  "weather": "weather.forecast_casa",
  "alarm": "alarm_control_panel.alarma_vivienda",
  "sun": "sun.sun",
  "hvac": "climate.aidoo_28_cc_ff_82_82_6f",
  "climate": { "name": "Salón", "temperature": "sensor.…", "humidity": "sensor.…" }
}
```

- `theme`: `auto` (sigue el modo oscuro de Home Assistant), `light` o `dark`. El selector de la
  barra superior lo cambia en esa tablet y lo recuerda.
- Los KPIs de luces, persianas y personas se calculan sobre todo el dominio, excluyendo grupos y
  entidades no disponibles.

## Tablet

- Resolución de diseño: ~1480×925 CSS px (Tab S10 Ultra en horizontal, DPR 2). Escala con `clamp()`.
- Deriva de 3 px muy lenta para evitar marcas en pantalla.
- Recomendado **Fully Kiosk Browser**: pantalla siempre encendida o por movimiento, arranque automático,
  bloqueo de kiosko y la integración Fully Kiosk de Home Assistant para controlar brillo y pantalla.
