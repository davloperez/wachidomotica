# Dashboards

Custom Lovelace cards for Home Assistant. Each dashboard is an independent npm package
(Vite 8 + TypeScript 6 + Lit 3, Node ≥ 22) built into **one self-contained ES module** (`dist/<name>.js`,
fonts and images inlined) that HA loads from `/local/<name>/`.

## Commands (run inside the dashboard folder)

```bash
npm run typecheck        # tsc --noEmit — fastest check, run after every change
npm run lint             # eslint (typescript-eslint + eslint-plugin-lit)
npm run build            # typecheck + vite build + shared/scripts/check-bundle.mjs
npm run format           # prettier (printWidth 110, double quotes, trailing commas)
```

`npm run deploy` exists but is outward-facing: only run it when the user asks.
Verification = `typecheck` + `lint` (+ `build` when touching bundling/config). There are no tests.

## Dev preview

`preview_start` with name `functional-v2`, then open
`/dev/index.html`. Query params: `?mock` (simulated data), `?dark` / `?light`, `?time=HH:MM` (fixes the sun).
Without `?mock` it uses live HA if `dashboards/.env` has `HA_URL` + `HA_TOKEN` — **live mode calls real services**,
so prefer `?mock` when clicking controls to test.

- `dev/mock-hass.ts` builds the fake `hass` from `src/house/rooms.ts`; new entities/attributes that the UI
  depends on must also be added there or the mock preview won't show them.
- `dev/live-hass.ts` adapts `home-assistant-js-websocket` to the `hass` shape.
- If Vite fails with `ENOSPC` file watchers, `VITE_USE_POLLING=1` is already set in `launch.json`.

## Shared plumbing

- `shared/scripts/deploy.mjs` reads each dashboard's `deploy.json` (bundle, wwwDir, `dashboard` or a `dashboards`
  list, kiosk, `assets` folders) and pushes `dashboard.config.json` as the card config to **every** listed HA
  dashboard (creating it, or syncing title/icon/show_in_sidebar if they differ). The repo is the source of truth for
  those HA dashboard configs: a deploy overwrites whatever was edited in the HA UI.
- `shared/scripts/check-bundle.mjs` fails the build if the bundle contains `process.env`, dev credential
  markers or a JWT. Credentials are only injected via `__DEV_HA_URL__` / `__DEV_HA_TOKEN__` in `vite serve`.
- `.env` lives in `villawachitos/dashboards/.env` (see `.env.example`); a per-dashboard `.env` overrides it.

## functional-v2: one card, several HA dashboards

The same `custom:functional-v2` card (same bundle, same `dashboard.config.json`) is published to all the
dashboards in `functional-v2/deploy.json` → `dashboards`. Only the **default view** differs, chosen at runtime from
the URL's first path segment (the dashboard `url_path`) via `DEFAULT_VIEWS` in `src/lib/panels.ts`:

| HA dashboard (title → `url_path`) | Default view |
| --- | --- |
| Casa General → `functional-v2` (HA's default dashboard; renamed from "Functional v2", url_path kept) | `home` (Casa) |
| Shelly X2i Oficina 1 → `shelly-x2i-oficina-1` | `oficina_1` |
| Shelly X2i Oficina 2 → `shelly-x2i-oficina-2` | `oficina_2` |
| Shelly Salón Sur → `shelly-salon-sur` | `salon` |
| Shelly Salón Este → `shelly-salon-este` | `salon` |

- The panel starts in that view and, after `idle_return_seconds` without touches, returns to it (closing sheets
  and layers, and re-framing the plan if it was panned/zoomed). Every panel can still navigate the whole house.
- **Adding/removing a wall panel** = add/remove it in **both** `deploy.json` `dashboards` and `DEFAULT_VIEWS`, and
  update the table in the dashboard `README.md` and here. Values are `HOME` or a room `id` from `house/rooms.ts`;
  unknown dashboards fall back to `HOME`.
- Never hand-edit those dashboards in HA (the next deploy overwrites them). Dashboard-specific behaviour goes in
  `panels.ts`, not in per-dashboard card configs.
- The Shelly entries in `deploy.json` keep their old HA view paths (`view.path`: `oficina-1`, `oficina-2`,
  `salon-sur`, `salon`) so the URLs saved on the devices still work; Casa General uses `main`. The view path does
  not matter to the card (it only reads the `url_path`).
- Dev: `?panel=<url_path>` simulates a dashboard, e.g. `/dev/index.html?mock&panel=shelly-salon-sur`.

## functional-v2 map

Element `functional-v2`, sub-elements `fv2-`, for low-power portrait wall panels (Lit, **no three.js**). `house/rooms.ts` is where devices live (add new devices there), `house/layers.ts` defines the layers. Hard rules for performance: opaque colors only (no `rgba`/`color-mix` with transparency,
no `backdrop-filter`/`filter`), animate only `transform`/`opacity` (never `box-shadow`), fonts ≥ 13 px.

| File | Role |
| --- | --- |
| `src/functional-dashboard.ts` | Root: layout (plan on top / left, cards below / right, room dock), plan markers, routing, idle return, priority alerts |
| `src/lib/panels.ts` | `DEFAULT_VIEWS`: HA dashboard `url_path` → default view (see section above) |
| `src/plan/house-plan.ts` | Floor-plan geometry: rooms, walls, lamps, furniture, gates, pool |
| `src/plan/geometry.ts` | 2D geometry from the plan (world px, `PX` per metre), static SVG strings, framing boxes |
| `src/plan/floor-plan.ts` | `fv2-plan`: pan/pinch/wheel/double-tap zoom on a single transformed layer; markers are slotted and keep size via `--inv` |
| `src/lib/alerts.ts` | **Catálogo de avisos** (`ALERT_RULES`): cada aviso posible es una regla (grupo, niveles, «cuándo salta», entidades que vigila, `check`). `computeAlerts` (panel _Avisos_) y `alertCatalog` (hoja «Todos los avisos») salen de ahí |
| `src/widgets/alerts-sheet.ts` | `fv2-alerts-sheet`: hoja con todo el catálogo, activos arriba y el resto agrupado. Se abre con `open-alerts` desde el botón del panel _Avisos_ (`home-view.ts`) |
| `src/lib/priority.ts`, `src/widgets/priority-alert.ts` | Full-screen priority alerts (Fermax doorbell, Dreame leak) |
| `src/styles/tokens.ts` | Opaque tokens, plan colors (`--p-*`) and the `.anim-*` keyframes for active devices |
| `marker_positions` (card config) | Per-marker `[x, z]` metre overrides (key = `LayerItem.key`, `gates`, `room:<id>`). Authored with the desktop-only "Editar" mode in `functional-dashboard.ts` (drag, then "Exportar JSON" → paste into `dashboard.config.json`); wall panels only read the config |

Mock preview (`?mock`) has dev-bar buttons to fire the doorbell and the leak.

## Avisos: mantener el catálogo al día

La hoja «Todos los avisos» muestra **todos** los avisos posibles aunque no estén activos, así que el
catálogo (`ALERT_RULES` en `src/lib/alerts.ts`) debe reflejar siempre lo que hay en Home Assistant:

- **Aviso nuevo** (o cambia un umbral, un nivel o un texto): añadir o editar su `AlertRule` — `group`, `levels`,
  `title`, `when` (frase «Salta si…», en español), `entities` y `check`. Nunca crear avisos fuera de `ALERT_RULES`
  (no sumarlos a mano en `home-view.ts`), o no aparecerían en la hoja.
- **Aviso eliminado**: borrar la regla; si era una alerta a pantalla completa, también `priority.ts` y
  `priority-alert.ts`.
- **Dispositivo nuevo o quitado en `house/rooms.ts`**: las reglas por tipo (`leaks`, `doors`, `gates`, `dishwasher`,
  `washer`, `litter`) lo recogen solas. Si es un tipo de dispositivo **nuevo** que debe avisar (p. ej. un sensor de
  humo, una batería baja de otro aparato), hace falta una regla nueva. Si cambia un `entity_id`, comprobar que la
  regla que lo usa (`FRIDGE`, `ENERGY`, `DOORBELL`, `VACUUM_LEAK`…) sigue apuntando a él.
- Las reglas `fullscreen: true` reflejan las alertas de `priority.ts` (timbre y fuga del limpiasuelos): mantenerlas
  sincronizadas con ese archivo.
- El orden de `ALERT_RULES` fija el orden de los avisos del mismo nivel en el panel _Avisos_.
- Tras cualquier cambio de avisos: `npm run typecheck && npm run lint`, probar la hoja con `?mock` y actualizar el
  `README.md` del dashboard si cambia algo visible para el usuario.
