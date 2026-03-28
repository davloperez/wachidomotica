#!/usr/bin/env python3
"""
Discover ESPHome devices on the local network.
Compares found devices against the YAML configs in this project.

Requirements: pip install zeroconf
"""

import os
import re
import socket
import time
from pathlib import Path

try:
    from zeroconf import ServiceBrowser, Zeroconf
except ImportError:
    print("Missing dependency. Install it with:  pip install zeroconf")
    raise SystemExit(1)

ESPHOME_SERVICE = "_esphomelib._tcp.local."
DISCOVERY_TIMEOUT = 5  # seconds
SCRIPT_DIR = Path(__file__).parent


# ── Load known devices from project YAML files ────────────────────────────────

def load_project_devices():
    """Return dict  name → static_ip  from all persiana-*.yaml files."""
    devices = {}
    for yaml_file in sorted(SCRIPT_DIR.glob("persiana-*.yaml")):
        if yaml_file.name == "persiana-base.yaml":
            continue
        text = yaml_file.read_text()
        name_match = re.search(r"^\s*name:\s*([^\s#]+)", text, re.MULTILINE)
        ip_match = re.search(r"static_ip:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)", text)
        if name_match:
            name = name_match.group(1)
            ip = ip_match.group(1) if ip_match else None
            devices[name] = ip
    return devices


# ── mDNS discovery ─────────────────────────────────────────────────────────────

class ESPHomeListener:
    def __init__(self):
        self.found = {}  # name → {"ip": ..., "port": ..., "props": ...}

    def add_service(self, zc: Zeroconf, type_: str, name: str):
        info = zc.get_service_info(type_, name)
        if not info:
            return
        device_name = name.replace(f".{type_}", "").strip()
        addresses = [socket.inet_ntoa(a) for a in info.addresses if len(a) == 4]
        ip = addresses[0] if addresses else None
        props = {k.decode(): v.decode() if isinstance(v, bytes) else v
                 for k, v in (info.properties or {}).items()}
        self.found[device_name] = {
            "ip": ip,
            "port": info.port,
            "version": props.get("version", "?"),
        }

    def remove_service(self, zc, type_, name):
        pass

    def update_service(self, zc, type_, name):
        self.add_service(zc, type_, name)


def discover_mdns():
    zc = Zeroconf()
    listener = ESPHomeListener()
    browser = ServiceBrowser(zc, ESPHOME_SERVICE, listener)  # noqa: F841
    try:
        time.sleep(DISCOVERY_TIMEOUT)
    finally:
        zc.close()
    return listener.found


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f"Searching for ESPHome devices (mDNS, {DISCOVERY_TIMEOUT}s)...\n")

    project_devices = load_project_devices()
    discovered = discover_mdns()

    # ── In-project devices ────────────────────────────────────────────────────
    print("=" * 60)
    print("DEVICES IN THIS PROJECT")
    print("=" * 60)
    for name, static_ip in sorted(project_devices.items()):
        if name in discovered:
            d = discovered[name]
            status = "ONLINE"
            ip_info = f"{d['ip']}:{d['port']}"
            version = d["version"]
            print(f"  [✓] {name:<30}  {ip_info:<22}  v{version}")
        else:
            ip_info = static_ip or "no static IP"
            print(f"  [✗] {name:<30}  {ip_info:<22}  OFFLINE / not found")

    # ── Unknown devices (not in project) ─────────────────────────────────────
    unknown = {n: d for n, d in discovered.items() if n not in project_devices}
    print()
    print("=" * 60)
    print("ESPHOME DEVICES NOT IN THIS PROJECT")
    print("=" * 60)
    if unknown:
        for name, d in sorted(unknown.items()):
            ip_info = f"{d['ip']}:{d['port']}"
            print(f"  [?] {name:<30}  {ip_info:<22}  v{d['version']}")
    else:
        print("  (none found)")

    # ── Summary ───────────────────────────────────────────────────────────────
    online = sum(1 for n in project_devices if n in discovered)
    print()
    print(f"Summary: {online}/{len(project_devices)} project devices online, "
          f"{len(unknown)} unknown device(s) found.")


if __name__ == "__main__":
    main()
