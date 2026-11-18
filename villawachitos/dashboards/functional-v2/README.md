# Functional v2

Versión **ligera** de [Functional v1](../functional-v1/README.md) para pantallas pequeñas y verticales de poca
potencia, como las **Shelly Wall Display X2i** de la casa. Mismas estancias, capas, tarjetas y controles que la v1,
con los mismos colores tranquilos (lino, salvia, terracota y ámbar), pero:

- **Sin 3D**: en lugar de la maqueta hay un **plano 2D** navegable (sin three.js; el bundle pasa de ~1 MB + texturas
  a ~350 KB, casi todo tipografías).
- **Sin transparencias ni desenfoques**: todas las tarjetas, barras y paneles son de color opaco (los tonos suaves
  ya van mezclados sobre el color de la tarjeta).
- **Animaciones baratas**: solo `transform` y `opacity` (las anima la GPU sin repintar). Nada de sombras animadas,
  degradados en movimiento ni filtros.
- **Letra grande**: nada por debajo de 13 px y botones de al menos 44 px.
- Respeta «reducir movimiento» del sistema (se paran todas las animaciones).

Tema claro, oscuro o auto (botón «Tema» al final de la barra inferior).

## Disposición

- **Pantalla vertical** (la de las Shelly): arriba el plano (algo más de media pantalla), debajo las tarjetas de la
  vista actual y abajo del todo la barra de estancias. Al deslizar sobre las tarjetas el plano se va hacia arriba y
  queda toda la pantalla para ellas.
- **Pantalla apaisada y ancha** (≥ 900 px): el plano a la izquierda y las tarjetas a la derecha.
- Las tarjetas se reparten en una o dos columnas según el ancho disponible.

## Plano 2D

Se dibuja a partir del plano compartido con House 3D v1
([`../house-3d-v1/src/scene/plan.ts`](../house-3d-v1/src/scene/plan.ts)): parcela, césped, pavimentos, porche,
piscina, suelos de cada estancia, muros con sus puertas y ventanas, muebles, valla y portones
([`src/plan/geometry.ts`](src/plan/geometry.ts), [`src/plan/floor-plan.ts`](src/plan/floor-plan.ts)).

- **Navegable**: arrastrar para moverlo, pellizcar (o rueda del ratón) para el zoom, **doble toque** para acercar
  (con mucho zoom, el doble toque vuelve al encuadre) (sin botones de zoom).
- **Encuadre automático**: vista general = casa y piscina; estancia = la estancia con algo de alrededor; exterior =
  toda la parcela; capa = todo lo que tiene marcador.
- **Tocar una estancia** del plano lleva a su vista; la estancia elegida se marca con un borde discontinuo.
- **Estancias con luz encendida**: el suelo se tiñe de ámbar; la piscina se ilumina con su luz.
- Los marcadores mantienen su tamaño al hacer zoom. Con poco zoom solo se ve el icono de cada estancia (y cuántas
  luces tiene encendidas); al acercarse aparecen el nombre y la temperatura.
- Todo el dibujo es una sola capa que se mueve con un `transform`: moverlo o hacer zoom no repinta nada.

### Qué se ve en cada vista

| Vista    | Marcadores                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Casa     | Acceso de cada estancia, luces encendidas (punto que late), lo que está en marcha, persianas moviéndose y avisos. Tocar uno lleva a su estancia                                                                     |
| Estancia | Todas sus luces (tocar enciende/apaga, mantener pulsado abre el detalle) y todos sus dispositivos, persianas y sensores. Solo se rotula lo encendido o con aviso; tocar un marcador lleva a su tarjeta y la resalta |
| Capa     | Todo lo de la capa en la casa (con muchos elementos, puntos más pequeños y, de lejos, solo se rotula lo activo)                                                                                                     |

### Animaciones de lo que está activo

| Qué                                                                 | Animación                           |
| ------------------------------------------------------------------- | ----------------------------------- |
| Luz encendida                                                       | Su color y un anillo que se expande |
| Persiana subiendo / bajando                                         | El icono sube o baja                |
| Lavadora, depuradora, ventilación                                   | El icono gira                       |
| Lavavajillas                                                        | Se balancea                         |
| Robot aspirador limpiando, toallero encendido                       | Sube y baja                         |
| TV, enchufes, presencia, cámaras con movimiento, freidora…          | Late suavemente                     |
| Persona en cámara, sensor con agua, puerta abierta, portero sonando | Tiembla, en ámbar                   |

## Colocar los iconos a mano (modo Editar)

Solo en **pantallas de escritorio** (≥ 900 px de ancho, con ratón): abajo en el plano aparece el botón **Editar**. En
las Shelly y el móvil no existe; ahí solo se aplica lo que ya esté guardado en `dashboard.config.json`.

1. Pulsa **Editar**. Todos los iconos del plano se rotulan y se marcan con un borde discontinuo.
2. **Arrastra** cada icono a donde quieras (el plano se sigue moviendo arrastrando el fondo y con el zoom). Mientras
   editas, tocar un icono no enciende la luz ni abre nada. **Doble clic** sobre un icono lo devuelve a su sitio.
   Funciona en cualquier vista (casa, estancia o capa) y la posición vale para todas.
3. **Exportar JSON** abre un cuadro con el bloque `"marker_positions": {…}` (posiciones en metros del plano) y un
   botón **Copiar**. Pégalo dentro de [`dashboard.config.json`](dashboard.config.json), junto a `theme`, `weather`…
   (sin olvidar la coma), y despliega.
4. Hasta entonces tus cambios se guardan en el navegador de escritorio (un punto ámbar en **Editar** avisa de que hay
   cambios sin exportar). **Descartar cambios** vuelve a lo que hay en el archivo y **Por defecto** deja todos los
   iconos en su sitio original.

Se pueden mover las luces, persianas, dispositivos y sensores, las puertas del garaje y los accesos de las estancias.
Las posiciones personalizadas tienen prioridad sobre las del plano; la geometría (muros, muebles) no se edita.

## Alertas prioritarias

Ocupan toda la pantalla (fondo opaco) por encima de cualquier vista hasta que se descartan
([`src/lib/priority.ts`](src/lib/priority.ts), [`src/widgets/priority-alert.ts`](src/widgets/priority-alert.ts)):

- **Llaman a la puerta** (portero Fermax DuoX): salta cuando cambia `event.jardin_norte_portero_automatico_exterior_duox_doorbell`
  (o `binary_sensor.…_duox_doorbell_zero` se pone a `on`). Botones **Abrir puerta** (pide un segundo toque; llama a
  `lock.unlock` sobre `lock.jardin_norte_portero_automatico_exterior_duox_zero` y se cierra sola al abrir) y
  **Descartar**. Si nadie la toca, desaparece a los 2 minutos. De momento sin imagen de la cámara.
- **Fuga de agua en el limpiasuelos** (`binary_sensor.sensor_agua_dreame_water_leak`): mientras el sensor esté mojado.
  Botones **Ver en el plano** (lleva al salón), **Pausar el robot** (si está limpiando) y **Descartar**. Descartada,
  no vuelve hasta que el sensor se seque y se moje otra vez.

Las alertas descartadas se recuerdan en el navegador de cada pantalla. Para desactivarlas en una pantalla concreta:
`"priority_alerts": false` en la configuración de la tarjeta.

## Vista general, estancias y capas

Igual que en la v1 (ver su [README](../functional-v1/README.md)): saludo y tiempo, avisos, alarma, acciones de toda
la casa, clima, energía y batería; en cada estancia iluminación con escenas, persianas, ambiente, seguridad,
dispositivos y actividad de hoy; y las capas Luces, Persianas, Clima, Energía, Electrodomésticos, Seguridad y
Multimedia. Las hojas de detalle (luz, instalación solar, depuradora) ocupan toda la pantalla con fondo opaco.

Estancias y dispositivos: [`src/house/rooms.ts`](src/house/rooms.ts); capas: [`src/house/layers.ts`](src/house/layers.ts)
(copias de las de la v1: un dispositivo nuevo hay que añadirlo en las dos).

**Previsión**: bajo el saludo, las próximas horas de hoy y los siguientes 5 días (mínima, máxima y probabilidad de
lluvia) de la entidad `weather` configurada, que usa las coordenadas de la casa (Urbanización La Quinta, Molina de
Segura). Se lee con `weather/subscribe_forecast`, así que la entidad debe soportar previsión diaria y por horas.

**Avisos meteorológicos (AEMET)**: aparecen en *Avisos* (amarillo = info, naranja = aviso, rojo = importante) cuando
un sensor de alertas está activo. Home Assistant no trae las alertas de la AEMET por sí solo: hace falta la
integración **Meteoalarm** (publica los avisos de la AEMET para España). Se detectan solos los `binary_sensor` con
«meteoalarm» o «aemet» en el id, o se indican con `weather_alerts`.

**Tocar para ver más**: las filas de Seguridad (alarma, puertas, sensores de agua), cada puerta de la calle y cada
cámara, el clima de la estancia y el tiempo abren el detalle de Home Assistant (la alarma se conecta o desconecta ahí).

**Robot aspirador** (Dreame): además de *Limpiar* y *A la base*, el botón **Personalizar limpieza e historial** (o tocar su
marcador en el plano) abre una hoja con:

- **Modo**: solo aspirar, solo fregar o aspirar y fregar a la vez; **potencia de aspirado** (silencio, estándar,
  fuerte, turbo) y **humedad de la mopa** (poco húmeda, húmeda, muy mojada). Sin mopa instalada solo deja aspirar.
- **Estancias**: botones *Interior*, *Exterior* (el porche, lo único exterior del mapa del robot) y *Todo*, o *Elegir*
  y tocar las estancias en un plano sencillo: el número indica el orden de limpieza. Las del robot no coinciden con
  las del panel (p. ej. Salón y cocina son una sola).
- **Últimas limpiezas**: fecha, duración, superficie, tipo, si se interrumpió y por qué, si llevaba mopa, método,
  estancias donde no pudo entrar, y el desgaste de cepillos y filtro (de `sensor.limpiasuelos_cleaning_history`).
- **Mapas**: el mapa en directo mientras limpia (o el último estado) y el recorrido de cada limpieza del historial, con
  una miniatura en cada tarjeta; tocar una la muestra en grande. Salen de `camera.limpiasuelos_map` (la integración
  de Dreame guarda las últimas 30 tareas con su imagen).
- Al empezar se desactiva CleanGenius y la limpieza personalizada del robot (si no, ignora estos ajustes), se fijan
  modo, succión y humedad, se ordena la secuencia de estancias y se llama a `dreame_vacuum.vacuum_clean_segment`.

**Modo kiosko**: el despliegue oculta la cabecera y la barra lateral de Home Assistant (`"kiosk": true` en
`deploy.json`). El botón **Ajustes** del final de la barra inferior las muestra (recarga con `?disable_km`, que es como
lo desactiva kiosk-mode) para entrar en ajustes u otros paneles; el mismo botón, ahora **Kiosko**, vuelve a ocultarlas.
Volver a abrir el panel desde la barra lateral también lo deja en kiosko. Se quita con `"kiosk_toggle": false`.

Tras `idle_return_seconds` (180 s por defecto) sin tocar la pantalla vuelve a la vista general.

## Configuración de la tarjeta

```json
{
  "type": "custom:functional-v2",
  "title": "Villawachitos",
  "theme": "auto",
  "weather": "weather.forecast_casa",
  "weather_alerts": ["binary_sensor.meteoalarm"],
  "alarm": "alarm_control_panel.alarma_vivienda",
  "idle_return_seconds": 180,
  "priority_alerts": true,
  "kiosk_toggle": true,
  "marker_positions": {
    "light.jardin_sur_luz_piscina": [-1.25, 11.3]
  }
}
```

## Desarrollo y despliegue

| Tarea de VSCode                            | Qué hace                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Functional v2: servidor de desarrollo**  | `http://localhost:5176/dev/index.html` (datos reales; `?mock` simulados; `?dark` / `?light`) |
| **Functional v2: deploy a Home Assistant** | Build → SSH → recurso `?v=<hash>` → dashboard `functional-v2`                                |
| Functional v2: typecheck y lint            | Comprobaciones                                                                               |

Con `?mock`, la barra de desarrollo tiene los botones **Timbre** y **Fuga robot** para probar las alertas; las
persianas simuladas tardan unos segundos en moverse (para ver su animación) y el portero se vuelve a cerrar solo.

Usa el `.env` compartido de `villawachitos/dashboards/.env` y el script común de
[`../shared/scripts/deploy.mjs`](../shared/scripts/deploy.mjs), configurado en [`deploy.json`](deploy.json).
