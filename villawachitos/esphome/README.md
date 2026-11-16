# ESPHome

Firmware de los ESP32 de la casa. Cada `esp-*.yaml` marcado con `# @esphome-device` es un dispositivo físico.

| Fichero | Contenido |
| --- | --- |
| `common.yaml` | Configuración común (placa, API, OTA, logger, web server) |
| `persiana-base.yaml` | Persiana `time_based`: relés, posición guardada, receptor ESP-NOW y scripts de los botones |
| `persiana-oficina-base.yaml`, `persiana-dormitorio-base.yaml` | Luces y botones compartidos de esas persianas |
| `espnow_recv.h` / `espnow_includes.h` | Código C del receptor (persianas) y emisor (`controller.yaml`) ESP-NOW |
| `controller.yaml` | Mando ESP-NOW con pantalla OLED que manda subir/bajar a las persianas (`device_id` 0–7) |
| `v2/www.js` | Interfaz web local que sirve el `web_server` de cada dispositivo |
| `secrets.yaml` | `wifi_ssid`, `wifi_password`, `api_encryption_key` (no se sube a git) |

## Entorno

ESPHome se instala en `venv/` (no se sube a git). Para crearlo o actualizarlo usa la tarea de VSCode
_ESPHome: crear/actualizar entorno Python_, o:

```bash
rm -rf venv && python3 -m venv venv && venv/bin/pip install --upgrade pip esphome
```

Si el sistema cambia de versión de Python, el `venv` deja de funcionar: hay que recrearlo.

## Uso

Desde VSCode, con las tareas _ESPHome: …_ (compilar/subir/logs del archivo abierto, o todos). Desde terminal:

```bash
venv/bin/esphome run esp-cocina.yaml
```

```bash
PATH="$PWD/venv/bin:$PATH" ./run_all.sh compile
```

```bash
PATH="$PWD/venv/bin:$PATH" ./run_all.sh upload
```
