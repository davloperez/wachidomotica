# Migración a Componente Cover de ESPHome

## Resumen de Cambios

Los ficheros de control de persianas han sido migrados del sistema simple de relés a `time_based_cover` de ESPHome. Esto proporciona mejor funcionalidad y control de posición.

## Cambios Realizados

### 1. `persiana-base-old.yaml`

- **Cambio principal**: Introducción del componente `cover` tipo `time_based`
- **Ventajas**:
  - Control de posición automático basado en tiempo de viaje
  - Parada automática al alcanzar abrir/cerrar
  - Integración con Home Assistant
  - Pueden ordenarse parar en mitad del camino
- **Sustituciones configurables**:
  - `open_duration`: Tiempo para abrir completamente (por defecto: 29s)
  - `close_duration`: Tiempo para cerrar completamente (por defecto: 28s)

- **Cambios en ESP-NOW**: Ahora usa `cover.open()` y `cover.close()` en lugar de `toggle` en relés
- **Botones físicos**: Se simplifican para llamar directamente a `cover.open()` y `cover.close()`
- **Relés**: Ahora son internos (no expuestos a Home Assistant)

### 2. `persiana-oficina-base.yaml`

- **Cambio principal**: Los LEDs ahora se activan por eventos del cover:
  - `on_open`: Parpadear LED subida
  - `on_close`: Parpadear LED bajada
  - `on_stop`: Detener parpadeo y encender LEDs
- Los scripts de parpadeo mantienen la misma funcionalidad

### 3. Archivos Individuales de Persianas

Se agregaron sustituciones específicas para cada persiana:

```yaml
substitutions:
  open_duration: "29" # Tiempo para subir (segundos)
  close_duration: "28" # Tiempo para bajar (segundos)
```

## Uso: Cómo Configurar Tiempos por Persiana

Si una persiana tarda diferente tiempo que otras, modifica los valores de sustitución:

**Ejemplo**: Si `persiana-dormitorio-1.yaml` tarda 30s en subir y 27s en bajar:

```yaml
substitutions:
  device_id: "2"
  open_duration: "30" # Nuevo tiempo de subida
  close_duration: "27" # Nuevo tiempo de bajada
```

## API en Home Assistant

Los covers ahora estarán disponibles en Home Assistant con acción de:

- **open**: Abre completamente la persiana
- **close**: Cierra completamente la persiana
- **stop**: Detiene el movimiento actual
- **set_position**: Coloca la persiana en una posición (0-100%)

## Notas Técnicas

- El componente `time_based_cover` calcula la posición basado en el tiempo transcurrido
- Los tiempos deben ser precisos para que la posición sea exacta
- Si los tiempos no son exactos, ajusta incrementalmente:
  - Demasiado rápido: Aumenta el valor
  - Demasiado lento: Disminuye el valor

## Compatibilidad Regresiva

- Los botones físicos siguen funcionando igual
- El control ESP-NOW ahora es más eficiente
- La configuración del resto de componentes (WiFi, LEDs, relé de luz) no cambió
