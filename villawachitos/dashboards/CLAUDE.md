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

`preview_start` with name `functional-v1` (or `functional-v2`, `house-3d-v1`, `analytics-dashboard-v1`), then open
`/dev/index.html`. Query params: `?mock` (simulated data), `?dark` / `?light`, `?time=HH:MM` (fixes the sun).
Without `?mock` it uses live HA if `dashboards/.env` has `HA_URL` + `HA_TOKEN` — **live mode calls real services**,
so prefer `?mock` when clicking controls to test.

- `dev/mock-hass.ts` builds the fake `hass` from `src/house/rooms.ts`; new entities/attributes that the UI
  depends on must also be added there or the mock preview won't show them.
- `dev/live-hass.ts` adapts `home-assistant-js-websocket` to the `hass` shape.
- If Vite fails with `ENOSPC` file watchers, `VITE_USE_POLLING=1` is already set in `launch.json`.

## Shared plumbing

- `shared/scripts/deploy.mjs` reads each dashboard's `deploy.json` (bundle, wwwDir, dashboard url_path, kiosk,
  `assets` folders) and pushes `dashboard.config.json` as the card config. The repo is the source of truth for
  the HA dashboard config.
- `shared/scripts/check-bundle.mjs` fails the build if the bundle contains `process.env`, dev credential
  markers or a JWT. Credentials are only injected via `__DEV_HA_URL__` / `__DEV_HA_TOKEN__` in `vite serve`.
- `.env` lives in `villawachitos/dashboards/.env` (see `.env.example`); a per-dashboard `.env` overrides it.

## functional-v1 map (the main project)

Custom element `functional-v1`; sub-elements prefixed `fv1-`. Big files — read only the section you need
(grep for the symbol first).

| File | Role |
| --- | --- |
| `src/functional-dashboard.ts` | Root element: config, theme, view routing (home / room / layer), 3D scene host, idle return |
| `src/house/rooms.ts` | **Where devices live**: `ROOMS_DEF` with lights, covers, climate sensors and `devices` per room. Add a device here |
| `src/house/layers.ts` | Layer selector (luces, persianas, clima, energía, electro, seguridad, multimedia) and what each includes |
| `src/house/iso.ts`, `materials.ts` | SVG isometric fallback (no WebGL) and its painted materials |
| `src/scene3d/calm-scene.ts` | three.js house model, camera (64-angle best-view search per room), sun, live lights |
| `src/views/home-view.ts`, `room-view.ts`, `layer-view.ts` | Side panels for each view |
| `src/widgets/devices.ts` | Device cards + `DEVICE_ICONS`, `deviceBrief` |
| `src/widgets/lights.ts`, `covers.ts`, `alarm-keypad.ts`, `pump-sheet.ts`, `solar-sheet.ts` | Controls and detail sheets |
| `src/charts/charts.ts` | Hand-written SVG charts (`fv1-area-chart`, `bar-chart`, `ring`, `timeline`, `energy-flow`) — no chart libs |
| `src/lib/ha.ts` | Helpers: `st`, `isOn`, `num`, `fmt`, `call`, `moreInfo`, `relTime`, Spanish label maps |
| `src/lib/data.ts` | Statistics/history fetches (`hourlyMeans`, `dailyTotals`, `stateSpans`) |
| `src/lib/alerts.ts` | `computeAlerts` for the "Avisos" panel |
| `src/styles/tokens.ts` | Design tokens (light/dark), shared styles |
| `../house-3d-v1/src/scene/plan.ts` | Geometry: rooms, walls, lamps, furniture, gates, pool. Shared with house-3d-v1 — edits affect both |

Conventions: reuse `src/lib/ha.ts` helpers instead of reading `hass.states` directly; icons come from `@mdi/js`
rendered with `icon()`; numbers formatted in `es` locale with `fmt`; respect `prefers-reduced-motion`; keep
rendering cheap (it runs on a wall tablet — render-on-demand, no continuous repaints).

## functional-v2 map

A fork of functional-v1 (element `functional-v2`, sub-elements `fv2-`) for low-power portrait wall panels. Same
`house/rooms.ts`, `house/layers.ts`, views and widgets (duplicated: a new device must be added to both dashboards),
but **no three.js**, and hard rules for performance: opaque colors only (no `rgba`/`color-mix` with transparency,
no `backdrop-filter`/`filter`), animate only `transform`/`opacity` (never `box-shadow`), fonts ≥ 13 px.

| File | Role |
| --- | --- |
| `src/functional-dashboard.ts` | Root: layout (plan on top / left, cards below / right, room dock), plan markers, routing, priority alerts |
| `src/plan/geometry.ts` | 2D geometry from the shared plan (world px, `PX` per metre), static SVG strings, framing boxes |
| `src/plan/floor-plan.ts` | `fv2-plan`: pan/pinch/wheel/double-tap zoom on a single transformed layer; markers are slotted and keep size via `--inv` |
| `src/lib/priority.ts`, `src/widgets/priority-alert.ts` | Full-screen priority alerts (Fermax doorbell, Dreame leak) |
| `src/styles/tokens.ts` | Opaque tokens, plan colors (`--p-*`) and the `.anim-*` keyframes for active devices |
| `marker_positions` (card config) | Per-marker `[x, z]` metre overrides (key = `LayerItem.key`, `gates`, `room:<id>`). Authored with the desktop-only "Editar" mode in `functional-dashboard.ts` (drag, then "Exportar JSON" → paste into `dashboard.config.json`); wall panels only read the config |

Mock preview (`?mock`) has dev-bar buttons to fire the doorbell and the leak.
