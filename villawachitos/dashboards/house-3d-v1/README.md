# Casa 3D v1

Plano 3D interactivo de la vivienda (una planta) con el **estado real** de Home Assistant:

- **Luces reales** (luces puntuales de Three.js): color, brillo y encendido de cada entidad `light.*`.
  Las de techo más intensas proyectan sombra (máximo 6 a la vez por rendimiento).
- **Persianas** dentro de los huecos de las ventanas que suben y bajan según `current_position`.
- **Sol real**: posición a partir de `sun.sun` (azimut y elevación). Un tejado invisible hace que la luz
  solo entre por las ventanas, así que una persiana bajada oscurece la habitación.
- Gestos táctiles: **1 dedo gira**, **2 dedos hacen zoom y desplazan**. Tras 90 s sin tocar vuelve a la vista
  inicial (también con el botón de diana).
- Tema claro, oscuro o auto, igual que Analytics v1.

## El plano

Todo está en [`src/scene/plan.ts`](src/scene/plan.ts) en metros (X → este, Z → sur):

- `ROOMS`: estancias (rectángulos) con tipo de suelo y etiqueta.
- `WALLS`: muros con sus huecos (`door` / `window`); una ventana con `cover` lleva persiana.
- `LAMPS`: luminarias vinculadas a entidades (`ceiling`, `pendant`, `lamp`, `strip`).
- `FURNITURE`: bloques sencillos para dar escala y sombras.

El plano actual es **hipotético**. Para ajustarlo a la casa real, edita las coordenadas y vuelve a desplegar.

## Desarrollo y despliegue

| Tarea de VSCode                    | Qué hace                                                        |
| ---------------------------------- | --------------------------------------------------------------- |
| **Casa 3D: servidor de desarrollo**| `http://localhost:5174/dev/index.html` (datos reales; `?mock` simulados con control del sol) |
| **Casa 3D: deploy a Home Assistant**| Build → SSH → recurso `?v=<hash>` → dashboard `house-3d-v1`     |
| Casa 3D: build / typecheck y lint  | Comprobaciones                                                  |

Usa el `.env` compartido de `villawachitos/dashboards/.env` y el script común de
[`../shared/scripts/deploy.mjs`](../shared/scripts/deploy.mjs), configurado en [`deploy.json`](deploy.json).

## Rendimiento en la tablet

- Solo se dibuja cuando algo cambia (gesto, estado de HA o animación de persianas): sin consumo en reposo.
- Resolución limitada a `max_pixel_ratio` (1.5 por defecto) en `dashboard.config.json`; súbelo a 2 si la
  tablet va sobrada o bájalo a 1 si va justa.
