# Casa 3D v1

Plano 3D interactivo de la vivienda (una planta) con el **estado real** de Home Assistant:

- **Luces reales** (luces puntuales de Three.js): color, brillo y encendido de cada entidad `light.*`.
  Las de techo más intensas proyectan sombra (máximo 6 a la vez por rendimiento).
- **Persianas** dentro de los huecos de las ventanas que suben y bajan según `current_position`.
- **Sol real calculado**: posición exacta (azimut y elevación) para la latitud, longitud, día y hora,
  calculada en el propio dashboard y recalculada cada 30 s. Por defecto usa Molina de Segura
  (38,0506 N, 1,2114 O, AEMET). La intensidad sigue un modelo de cielo despejado según la masa de aire
  (sol bajo = luz más débil y cálida), atenuado por la nubosidad (`cloud_coverage`) de la entidad `weather`.
  El disco solar se ve en el cielo (el plano está girado 26° respecto al norte real).
  Un tejado invisible hace que la luz solo entre por las ventanas, así que una persiana bajada oscurece la habitación.
- **Parcela**: césped, piscina de 8 × 3 m al sur, playa, porche, aparcamiento y valla negra de 2 m, a escala
  del plano de la parcela. Las luces exteriores también son reales, y el agua de la piscina toma el color real
  de `light.luz_piscina`.
- **Puertas de los vehículos**: dos correderas que corren una sobre otra (la del oeste por dentro) y se abren o cierran según los
  sensores de contacto `binary_sensor.sensor_puerta_garaje_1_contact` / `_2_contact` (`GATES` en el plano).
  1 m al este, la puerta peatonal (`PEDESTRIAN_GATE`, aún sin sensor).
- **Accionable**: toca una luz, una persiana o el agua de la piscina y se abre un panel con lo que admita ese
  dispositivo en Home Assistant: encender/apagar, intensidad, temperatura de color, color (muestras y tono),
  efectos (WLED); en persianas subir/parar/bajar, apertura exacta y atajos 0-25-50-75-100 %. El botón «···»
  abre el diálogo nativo de Home Assistant. Tocar una zona vacía o pulsar Esc cierra el panel. Las zonas
  táctiles son invisibles y algo mayores que el objeto (`addHitTarget` en `house-scene.ts`); el panel está en
  [`src/ui/control-panel.ts`](src/ui/control-panel.ts). En `?mock` los servicios se simulan en local.
- **Cámara que sigue la actividad**: cuando cambia una luz, persiana o puerta (desde aquí, desde Home Assistant
  o por una automatización) y nadie ha movido la vista en los últimos 20 s, la cámara se acerca un momento a ese
  elemento; si cambian varios a la vez, encuadra el punto medio entre ellos. A los 6 s del último cambio vuelve
  a la vista que había. No salta con un panel de control abierto y se cancela al tocar la vista
  (`FOCUS_IDLE_MS`, `FOCUS_HOLD_MS` en `house-scene.ts`).
- **Luces vivas**: cada luz encendida emite ondas de su color que se expanden en bucle y su halo «respira»,
  para que llamen la atención aunque la vista esté quieta (animación limitada a 30 fps).
- **Depuradora**: caseta enterrada de 1 × 1 m que asoma 10 cm con césped artificial encima (`PUMP` en el plano,
  junto a la piscina). Con `switch.interruptor_depuradora` encendido el borde se ilumina en verde, emite ondas
  y la etiqueta muestra la potencia de `sensor.interruptor_depuradora_power_a`. Al tocarla se puede parar o poner en marcha.
- **Instalación solar** en la parte norte del lavadero (`ENERGY` en el plano): torre de baterías con una barra
  de nivel que sube con el % de carga (verde, ámbar o roja) e inversor en la pared con piloto ámbar y ondas
  mientras las placas producen. Junto al lavadero, una etiqueta con producción solar, % de batería
  (▲ cargando / ▼ descargando), consumo de la casa y red, de los sensores Sigenergy.
- **TV del salón** (85", pared este, `TV` en el plano): con `media_player.salon_tv_samsung_salon_85` encendida
  la pantalla muestra una animación esquemática con el título o la fuente y tiñe el salón. Al tocarla: encender
  (por `remote.*` si el media_player no lo admite), apagar, reproducción, volumen, silencio y fuente.
- **Frigorífico** integrado en la cocina (`FRIDGE`): columna con frente de madera, piloto verde (rojo y ondas si la
  puerta está abierta) y etiqueta con temperatura real y objetivo del frigorífico y del congelador y estado de la puerta.
- **Downlights**: las luces de techo de oficinas, dormitorios y vestidor son 4 focos repartidos 2 × 2 (`downlights()`
  en el plano) que se encienden y se tocan como una sola luz.
- **Luz general** suave que deja ver la casa de noche y rellena las sombras de día.
- Gestos táctiles: **1 dedo gira**, **2 dedos hacen zoom y desplazan**. Tras 90 s sin tocar vuelve a la vista
  inicial (también con el botón de diana).
- Tema claro, oscuro o auto, igual que Analytics v1.

## El plano

Todo está en [`src/scene/plan.ts`](src/scene/plan.ts) en metros, medido sobre el plano de la parcela C7-4
(X → derecha del plano, Z → hacia la piscina; el norte real está girado `NORTH_ANGLE` = 26°):

- `ROOMS`: estancias (rectángulos) con tipo de suelo y etiqueta.
- `WALLS`: muros con sus huecos (`door` / `window`); una ventana con `cover` lleva persiana.
- `LAMPS`: luminarias vinculadas a entidades (`ceiling`, `pendant`, `lamp`, `strip`).
- `FURNITURE`: bloques sencillos para dar escala y sombras.
- `PLOT`, `POOL`, `POOL_COPING`, `PORCH`, `PAVING`, `PUMP`, `FOOTPRINT`: parcela, piscina y su coronación de 35 cm,
  porche (mismo suelo que la casa, hasta ~1 m de la piscina), pavimentos, caseta de la depuradora y huella del tejado.

Las estancias siguen los nombres del plano (Oficina 1/2 = Despacho 1/2 del plano; Entrada = Hall del plano; el fijo de vidrio junto a la puerta principal
y las ventanas de oficinas y dormitorios 2 y 3 del plano son en realidad correderas hasta el suelo o no existen; los dormitorios 2 y 3 están intercambiados respecto al plano;
Baño 1 = el de la suite). Para retocar algo, edita las coordenadas y vuelve a desplegar.

## Configuración de la tarjeta

```json
{
  "type": "custom:house-3d-v1",
  "title": "Villawachitos",
  "theme": "auto",
  "latitude": 38.0506,
  "longitude": -1.2114,
  "weather": "weather.forecast_casa"
}
```

## Desarrollo y despliegue

| Tarea de VSCode                      | Qué hace                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Casa 3D: servidor de desarrollo**  | `http://localhost:5174/dev/index.html` (datos reales; `?mock` simulados). Deslizador de **hora** para ver el recorrido del sol de hoy |
| **Casa 3D: deploy a Home Assistant** | Build → SSH → recurso `?v=<hash>` → dashboard `house-3d-v1`                                                                           |
| Casa 3D: build / typecheck y lint    | Comprobaciones                                                                                                                        |

Usa el `.env` compartido de `villawachitos/dashboards/.env` y el script común de
[`../shared/scripts/deploy.mjs`](../shared/scripts/deploy.mjs), configurado en [`deploy.json`](deploy.json).

## Rendimiento en la tablet

- Solo se dibuja cuando algo cambia (gesto, estado de HA o animación de persianas): sin consumo en reposo.
- Resolución limitada a `max_pixel_ratio` (1.5 por defecto) en `dashboard.config.json`; súbelo a 2 si la
  tablet va sobrada o bájalo a 1 si va justa.
