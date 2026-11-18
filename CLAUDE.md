# wachidomotica

Home-automation config for the house "Villawachitos" (Home Assistant + ESPHome + custom Lovelace dashboards).
Single owner, no CI, no tests. Branch `main`.

## Layout

| Path | What | More context |
| --- | --- | --- |
| `villawachitos/dashboards/functional-v1` | **Active work.** Wall-panel dashboard (Lit + three.js) | `villawachitos/dashboards/CLAUDE.md`, its `README.md` |
| `villawachitos/dashboards/functional-v2` | Lightweight copy of functional-v1 for small portrait wall panels (Shelly Wall Display X2i): 2D plan, no 3D/blur/transparency, priority alerts | same |
| `villawachitos/dashboards/house-3d-v1` | Interactive 3D house. Its `src/scene/plan.ts` is the **shared floor plan** (also imported by functional-v1) | same |
| `villawachitos/dashboards/analytics-dashboard-v1` | Older analytics dashboard, rarely touched | same |
| `villawachitos/dashboards/shared/scripts` | `deploy.mjs` and `check-bundle.mjs` used by every dashboard | same |
| `villawachitos/esphome` | ESP32 firmware YAML | `villawachitos/esphome/CLAUDE.md` |
| `.vscode/tasks.json` | The user's way of running everything (labels in Spanish) | |
| `.claude/launch.json` | Dev servers for `preview_start`: `analytics-dashboard-v1` :5173, `house-3d-v1` :5174, `functional-v1` :5175, `functional-v2` :5176 | |

Never read or search inside `node_modules/`, `dist/`, `venv/`, `.esphome/`, `package-lock.json` or `public/textures/*.jpg`.

## Language and conventions

- **Spanish** for: UI text, READMEs, code comments, VSCode task labels. Keep it that way.
- **English** for commit messages, formatted `<Component>: <what changed>` — e.g.
  `Functional v1: added layers`, `House 3D v1: …`, `ESPHome: …`. Short, comma-separated list of changes.
- 2-space indent, LF, final newline (`.editorconfig`); 4 spaces for `.sh`, `.h`, `.py`.
- READMEs are user-facing feature docs. When a feature visible to the user changes, update the
  dashboard's `README.md` in the same change.

## Home Assistant

- A `home-assistant` MCP server is usually connected: use it (`ha_search`, `ha_get_state`, `ha_get_entity`…) to
  find real entity IDs and attributes instead of guessing. Read-only lookups are fine; anything that changes HA
  (services, config, automations, restarts) needs the user's OK.
- Entity IDs are Spanish snake_case (`light.jardin_sur_luz_piscina`, `switch.interruptor_depuradora`,
  `alarm_control_panel.alarma_vivienda`, `weather.forecast_casa`).
- Location: Molina de Segura (lat 38.0506, lon -1.2114). The plan is rotated 26° from true north.

## Outward-facing actions — ask first

- `npm run deploy` / `deploy:only` (uploads to HA over SSH and overwrites the live dashboard config).
- ESPHome `upload` / `run` / `run_all.sh upload` (flashes real devices over OTA).
- Never print or commit `.env` / `secrets.yaml` contents.
