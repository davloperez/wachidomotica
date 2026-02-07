# ESPHome Project

This repository contains ESPHome configuration files for multiple ESP32 devices.

All device YAML files live at the project root for simplicity (for now), along with shared configuration and secrets.

---

## 📁 Project Structure

```
esphome/
├── venv/               # Python virtual environment (not committed)
├── .gitignore
├── secrets.yaml        # WiFi credentials, passwords (not committed)
├── common.yaml         # Shared ESPHome configuration
├── esp32-salon.yaml
├── esp32-cocina.yaml
├── esp32-garaje.yaml
└── README.md
```

### Important notes:

- `venv/` contains a local Python environment with ESPHome installed
- `.esphome/` (auto-created by ESPHome) is ignored by git
- `secrets.yaml` is never committed (contains sensitive data)
- Each `esp32-*.yaml` file represents one physical device

---

## 🧰 Requirements

You need:

- Linux (tested on Ubuntu)
- Python 3.8+ recommended
- pip (usually comes with Python)

---

## ✅ Check if Python 3 is installed

Run:

```bash
python3 --version
```

If you see something like:

```
Python 3.10.x
```

You're good.

---

## 📦 Install Python 3 (if missing)

On Ubuntu:

```bash
sudo apt update
sudo apt install python3 python3-venv python3-pip
```

Verify again:

```bash
python3 --version
```

---

## 🐍 First-time setup (create local environment)

From the project folder:

```bash
python3 -m venv venv
source venv/bin/activate
pip install esphome
```

Test:

```bash
esphome version
```

---

## ▶️ Using ESPHome

Activate the environment:

```bash
source venv/bin/activate
```

Run a specific device:

```bash
esphome run esp32-salon.yaml
```

Or:

```bash
esphome run esp32-cocina.yaml
```

---

## 🔁 Shared configuration

Common ESPHome settings live in:

```
common.yaml
```

Each device YAML typically includes it using:

```yaml
packages:
  base: !include common.yaml
```

---

## 🔐 Secrets

Sensitive values are stored in:

```
secrets.yaml
```

Example:

```yaml
wifi_ssid: "MyWifi"
wifi_password: "supersecret"
ota_password: "xxxx"
api_password: "yyyy"
```

Use them in configs like:

```yaml
password: !secret wifi_password
```

---

## 🧹 Git ignore

The following are intentionally not tracked:

- `venv/`
- `.esphome/`
- `secrets.yaml`
- build/cache files

---

## 🧠 Typical workflow

```bash
cd esphome
source venv/bin/activate
esphome run esp32-device.yaml
```

---

## 📌 Notes for future me

- ESPHome is installed locally in `venv/`
- Never install it system-wide
- If things break: delete `venv/`, recreate it, reinstall ESPHome
- Device YAML files live at project root (for now)

---

Happy automating 🤖
