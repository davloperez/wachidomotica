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

- `shared/scripts/deploy.mjs` reads each dashboard's `deploy.json` (bundle, wwwDir, dashboard url_path, kiosk,
  `assets` folders) and pushes `dashboard.config.json` as the card config. The repo is the source of truth for
  the HA dashboard config.
- `shared/scripts/check-bundle.mjs` fails the build if the bundle contains `process.env`, dev credential
  markers or a JWT. Credentials are only injected via `__DEV_HA_URL__` / `__DEV_HA_TOKEN__` in `vite serve`.
- `.env` lives in `villawachitos/dashboards/.env` (see `.env.example`); a per-dashboard `.env` overrides it.

## functional-v2 map

Element `functional-v2`, sub-elements `fv2-`, for low-power portrait wall panels (Lit, **no three.js**). `house/rooms.ts` is where devices live (add new devices there), `house/layers.ts` defines the layers. Hard rules for performance: opaque colors only (no `rgba`/`color-mix` with transparency,
no `backdrop-filter`/`filter`), animate only `transform`/`opacity` (never `box-shadow`), fonts ≥ 13 px.

| File | Role |
| --- | --- |
| `src/functional-dashboard.ts` | Root: layout (plan on top / left, cards below / right, room dock), plan markers, routing, priority alerts |
| `src/plan/house-plan.ts` | Floor-plan geometry: rooms, walls, lamps, furniture, gates, pool |
| `src/plan/geometry.ts` | 2D geometry from the plan (world px, `PX` per metre), static SVG strings, framing boxes |
| `src/plan/floor-plan.ts` | `fv2-plan`: pan/pinch/wheel/double-tap zoom on a single transformed layer; markers are slotted and keep size via `--inv` |
| `src/lib/priority.ts`, `src/widgets/priority-alert.ts` | Full-screen priority alerts (Fermax doorbell, Dreame leak) |
| `src/styles/tokens.ts` | Opaque tokens, plan colors (`--p-*`) and the `.anim-*` keyframes for active devices |
| `marker_positions` (card config) | Per-marker `[x, z]` metre overrides (key = `LayerItem.key`, `gates`, `room:<id>`). Authored with the desktop-only "Editar" mode in `functional-dashboard.ts` (drag, then "Exportar JSON" → paste into `dashboard.config.json`); wall panels only read the config |

Mock preview (`?mock`) has dev-bar buttons to fire the doorbell and the leak.
