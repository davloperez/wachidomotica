# ESPHome

ESP32 (`esp32dev`, esp-idf) firmware. See `README.md` for the file table.

- A device file is any `esp-*.yaml` whose first line is `# @esphome-device` (`run_all.sh` relies on that marker).
- Shared config via `packages: !include`: `common.yaml` → `persiana-base.yaml` → `persiana-{oficina,dormitorio}-base.yaml`.
  Blinds use `substitutions` (`device_id` 0–7 for the ESP-NOW remote in `controller.yaml`, `open_duration`, `close_duration`).
- `secrets.yaml` holds `wifi_ssid`, `wifi_password`, `api_encryption_key` — gitignored; never print it.
- ESPHome is in `venv/` here (gitignored). Use `venv/bin/esphome`.

## Checking a change

```bash
venv/bin/esphome config esp-cocina.yaml      # fast validation, no compile
venv/bin/esphome compile esp-cocina.yaml     # full build (slow: run in background)
```

`esphome upload` / `run` and `./run_all.sh upload` flash real devices over OTA: only when the user asks.
