# wachidomotica

Home-automation config for the house "Villawachitos" (Home Assistant + ESPHome + custom Lovelace dashboards).
Single owner, no CI, no tests. Branch `main`.

## Layout

| Path | What | More context |
| --- | --- | --- |
| `villawachitos/dashboards/functional-v2` | **Active work.** Wall-panel dashboard for small portrait panels (Shelly Wall Display X2i): 2D plan, no 3D/blur/transparency, priority alerts. Its `src/plan/house-plan.ts` is the floor plan. One deploy publishes it to the HA dashboards "Casa General" (`functional-v2`, HA's default) and the Shelly panels (Oficina 1/2, Salón Sur/Este), each with its own default room (`src/lib/panels.ts`) | `villawachitos/dashboards/CLAUDE.md`, its `README.md` |
| `villawachitos/dashboards/shared/scripts` | `deploy.mjs` and `check-bundle.mjs` used by every dashboard | same |
| `villawachitos/esphome` | ESP32 firmware YAML | `villawachitos/esphome/CLAUDE.md` |
| `.vscode/tasks.json` | The user's way of running everything (labels in Spanish) | |
| `.claude/launch.json` | Dev server for `preview_start`: `functional-v2` :5176 | |

Never read or search inside `node_modules/`, `dist/`, `venv/`, `.esphome/`, `package-lock.json` or `public/textures/*.jpg`.

## Language and conventions

- **Spanish** for: UI text, READMEs, code comments, VSCode task labels. Keep it that way.
- **English** for commit messages, formatted `<Component>: <what changed>` — e.g.
  `Functional v2: added layers`, `ESPHome: …`. Short, comma-separated list of changes.
- 2-space indent, LF, final newline (`.editorconfig`); 4 spaces for `.sh`, `.h`, `.py`.
- READMEs are user-facing feature docs. When a feature visible to the user changes, update the
  dashboard's `README.md` in the same change.

## Home Assistant

- A `home-assistant` MCP server is usually connected: use it (`ha_search`, `ha_get_state`, `ha_get_entity`…) to
  find real entity IDs and attributes instead of guessing. Read-only lookups are fine; anything that changes HA
  (services, config, automations, restarts) needs the user's OK.
- Entity IDs are Spanish snake_case (`light.jardin_sur_luz_piscina`, `switch.interruptor_depuradora`,
  `alarm_control_panel.alarma_vivienda`, `weather.forecast_casa`).
- When devices or alerts are added/removed in HA, keep the dashboard catalogs in sync (esp. `ALERT_RULES` in
  `functional-v2/src/lib/alerts.ts`, which feeds the "Todos los avisos" sheet) — see `villawachitos/dashboards/CLAUDE.md`.
- Location: Molina de Segura (lat 38.0506, lon -1.2114). The plan is rotated 26° from true north.

## Outward-facing actions — ask first

- `npm run deploy` / `deploy:only` (uploads to HA over SSH and overwrites the live config of **every** dashboard in
  `deploy.json`, including the Shelly wall panels).
- ESPHome `upload` / `run` / `run_all.sh upload` (flashes real devices over OTA).
- Never print or commit `.env` / `secrets.yaml` contents.
