# Mealie MCP

Servidor MCP para gestionar Mealie desde Claude. Documentación y conexión en `http://IP-DE-HA:8765/`.

## Configuración

- **mealie_url**: dirección de Mealie (por defecto `http://192.168.0.10:9000`).
- **api_token**: token de Mealie (perfil → *API Tokens*).
- **access_key** (opcional): si se rellena, los clientes deben enviar `Authorization: Bearer <clave>`.
