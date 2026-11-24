# Functional v2

Panel de pared **ligero** para pantallas pequeñas y verticales de poca
potencia, como las **Shelly Wall Display X2i** de la casa. Estancias, capas, tarjetas y controles
con colores tranquilos (lino, salvia, terracota y ámbar), pero:

- **Sin 3D**: en lugar de la maqueta hay un **plano 2D** navegable (sin three.js; el bundle pasa de ~1 MB + texturas
  a ~350 KB, casi todo tipografías).
- **Sin transparencias ni desenfoques**: todas las tarjetas, barras y paneles son de color opaco (los tonos suaves
  ya van mezclados sobre el color de la tarjeta).
- **Animaciones baratas**: solo `transform` y `opacity` (las anima la GPU sin repintar). Nada de sombras animadas,
  degradados en movimiento ni filtros.
- **Letra grande**: nada por debajo de 13 px y botones de al menos 44 px.
- Respeta «reducir movimiento» del sistema (se paran todas las animaciones).

Tema claro, oscuro o auto (botón «Tema» al final de la barra inferior). En **auto**, cada panel Shelly usa su
**sensor de luz**: por debajo de 50 lx pasa a oscuro y por encima de 70 lx a claro (entre medias se queda como
está), y solo cambia si la lectura se mantiene 90 s, para que una sombra o alguien delante no lo hagan parpadear. Los
sensores miden sobre todo luz natural (de noche marcan casi 0 aunque haya luces), así que de día queda claro y al
anochecer oscuro. Sin sensor (Casa General en móviles u ordenador) o si el sensor no responde, auto sigue el modo
oscuro de Home Assistant. Elegir claro u oscuro con el botón manda sobre el sensor (se recuerda en cada pantalla).
Los umbrales están en [`src/lib/theme.ts`](src/lib/theme.ts).

## Dashboards, vista por defecto y sensor de luz

La misma tarjeta (mismo código y misma configuración) se publica en varios dashboards de Home Assistant. Todos
muestran la casa entera, pero cada uno **arranca en la estancia donde está el panel** y vuelve a ella (con su
encuadre del plano) tras `idle_return_seconds` sin tocar la pantalla, y en tema auto usa **su sensor de luz**:

| Dashboard (URL)                                           | Vista por defecto | Tema auto según                                           |
| --------------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| **Casa General** (`/functional-v2`, el de HA por defecto) | Casa              | Modo oscuro de HA                                         |
| Shelly X2i Oficina 1 (`/shelly-x2i-oficina-1`)            | Oficina 1         | `sensor.oficina_1_shellywalldisplay_oficina1_iluminancia` |
| Shelly X2i Oficina 2 (`/shelly-x2i-oficina-2`)            | Oficina 2         | `sensor.oficina_2_shellywalldisplay_oficina2_iluminancia` |
| Shelly Cocina (`/shelly-cocina`)                          | Cocina            | `sensor.cocina_shelly_cocina_iluminancia`                 |
| Shelly Salón Este (`/shelly-salon-este`)                  | Salón             | `sensor.shellywalldisplay_0205030bbdd8_iluminancia`       |
| Shelly Baño 1 (`/shelly-bano-1`)                          | Baño 1            | `sensor.bano_1_shelly_bano_1_iluminancia`                 |
| Shelly Baño 2 (`/shelly-bano-2`)                          | Baño 2            | `sensor.bano_2_shelly_bano_2_iluminancia`                 |
| Shelly Dormitorio 1 (`/shelly-dormitorio-1`)              | Dormitorio 1      | `sensor.dormitorio_1_shelly_dormitorio_1_iluminancia`     |
| Shelly Dormitorio 2 (`/shelly-dormitorio-2`)              | Dormitorio 2      | `sensor.dormitorio_2_shelly_dormitorio_2_iluminancia`     |
| Shelly Dormitorio 3 (`/shelly-dormitorio-3`)              | Dormitorio 3      | `sensor.dormitorio_3_shelly_dormitorio_3_iluminancia`     |

La lista está en [`src/lib/panels.ts`](src/lib/panels.ts) (`PANELS`) y los dashboards a publicar en
[`deploy.json`](deploy.json) (`dashboards`). Un dashboard nuevo se añade en los dos sitios. En desarrollo,
`?panel=<url>` simula estar en ese dashboard (p. ej. `?mock&panel=shelly-x2i-oficina-1`); con `?mock`, el botón
**Luz** de la barra de desarrollo alterna los sensores entre día y noche.

## Disposición

- **Pantalla vertical** (la de las Shelly): arriba el plano (algo más de media pantalla), debajo las tarjetas de la
  vista actual y abajo del todo la barra de estancias. Al deslizar sobre las tarjetas el plano se va hacia arriba y
  queda toda la pantalla para ellas.
- **Pantalla apaisada y ancha** (≥ 900 px): el plano a la izquierda y las tarjetas a la derecha.
- Las tarjetas se reparten en una o dos columnas según el ancho disponible.

## Plano 2D

Se dibuja a partir del plano de la casa
([`src/plan/house-plan.ts`](src/plan/house-plan.ts)): parcela, césped, pavimentos, porche,
piscina, suelos de cada estancia, muros con sus puertas y ventanas, muebles, valla y portones
([`src/plan/geometry.ts`](src/plan/geometry.ts), [`src/plan/floor-plan.ts`](src/plan/floor-plan.ts)).

- **Navegable**: arrastrar para moverlo, pellizcar (o rueda del ratón) para el zoom, **doble toque** para acercar
  (con mucho zoom, el doble toque vuelve al encuadre) (sin botones de zoom).
- **Encuadre automático**: vista general = casa y piscina; estancia = la estancia con algo de alrededor; exterior =
  toda la parcela; capa = todo lo que tiene marcador.
- **Tocar una estancia** del plano lleva a su vista; la estancia elegida se marca con un borde discontinuo.
- **Estancias con luz encendida**: el suelo se tiñe de ámbar; la piscina se ilumina con su luz.
- Los marcadores mantienen su tamaño al hacer zoom. Con poco zoom solo se ve el icono de cada estancia (y cuántas
  luces tiene encendidas); al acercarse aparece el nombre.
- Todo el dibujo es una sola capa que se mueve con un `transform`: moverlo o hacer zoom no repinta nada.

### Qué se ve en cada vista

| Vista    | Marcadores                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Casa     | Acceso de cada estancia, luces encendidas (punto que late), lo que está en marcha, persianas moviéndose y avisos. Tocar uno lleva a su estancia                                                                                                                   |
| Estancia | Todas sus luces (tocar enciende/apaga, mantener pulsado abre el detalle; las tiras WLED se encienden en modo Ambiente) y todos sus dispositivos, persianas y sensores. Solo se rotula lo encendido o con aviso; tocar un marcador lleva a su tarjeta y la resalta |
| Capa     | Todo lo de la capa en la casa (con muchos elementos, puntos más pequeños y, de lejos, solo se rotula lo activo)                                                                                                                                                   |

### Tiras WLED

Las tres tiras WLED (cortineros del salón, oficina 1 y oficina 2) no llevan deslizador de intensidad sino cuatro
presets: **Ambiente** (blanco cálido sólido al 30 %), **Aurora** (efecto Pacifica, verdes y azules), **Cálido**
(sólido rojo-naranja con muy poco blanco) y **Máximo** (blanco brillante al 100 %). Tocar la tira en el plano o su
mosaico estando apagada la enciende en Ambiente. El icono de ajustes abre el detalle, que ofrece los efectos
Solid, Random Colors, Dynamic, Scan, Pacifica y Rainbow.

### Deslizadores y scroll en la pantalla táctil

Para que al hacer scroll con el dedo no se mueva nada sin querer, los deslizadores (intensidad, temperatura y tono de
las luces, intervalo de dosificación) **no responden a un simple toque ni a un arrastre vertical**. Para cambiarlos hay
que agarrar el pomo y arrastrar en horizontal, o mantener pulsado ~0,3 s sobre la barra (el pomo crece al activarse).
Con ratón funcionan como siempre. Las persianas y cortinas no llevan deslizador: tienen los botones de abrir, parar y
cerrar y los de posición rápida 0, 25, 50, 75 y 100 %.

### Animaciones de lo que está activo

| Qué                                                                 | Animación                                     |
| ------------------------------------------------------------------- | --------------------------------------------- |
| Luz encendida                                                       | Su color y un anillo que se expande           |
| Persiana subiendo / bajando                                         | El icono sube o baja                          |
| Lavadora, depuradora, ventilación                                   | El icono gira                                 |
| Lavavajillas                                                        | Se balancea                                   |
| Robot aspirador limpiando, toallero encendido                       | Sube y baja                                   |
| TV, enchufes, presencia, cámaras con persona o gato, freidora…      | Late suavemente                               |
| Instalación fotovoltaica mientras se consume de la red              | Late suavemente (también en la vista general) |
| Persona en cámara, sensor con agua, puerta abierta, portero sonando | Tiembla, en ámbar                             |

## Cámaras

- **Instantáneas**: en el detalle de las cámaras (vista Exterior y capa Seguridad) cada cámara muestra su imagen, que se
  renueva cada 20 s; en el panel de Seguridad de la vista general, cada 30 s. El borde se pone en rojo con una persona y
  en ámbar con un gato (el movimiento genérico no resalta). Solo se actualizan con el panel visible.
- **Visor a pantalla completa**: tocar una imagen abre esa cámara en grande. Abajo hay un selector para cambiar de
  cámara y arriba el botón **Todas**, que muestra una cuadrícula con todas las cámaras; tocar una de ellas la abre en
  grande. **Ver todas** en el panel de Seguridad abre directamente la cuadrícula.
  - **Escritorio** (≥ 900 px con ratón): todas las cámaras **en directo y fluidas** (WebRTC a través de Home Assistant, sin
    librerías ni transcodificación), también en la cuadrícula.
  - **Shelly y móvil**: una **imagen que se renueva cada 3 s**, para no cargar la pantalla con vídeo.
- Si en escritorio el directo no arranca (12 s) se cae, en la cámara grande, a vídeo MJPEG de HA y, si tampoco, a
  imágenes cada segundo, con un botón **Reintentar directo**. El portero automático (sin vídeo en directo) solo muestra
  imágenes.
- Las cámaras salen de `ROOMS_DEF` (`camera` en cada cámara) y de `EXTRA_CAMERAS` en `src/house/rooms.ts`.

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
- **Humo en la cocina** (`binary_sensor.sensor_humo_smoke`): mientras el detector detecte humo; va la primera si hay
  varias alertas. Botones **Silenciar la alarma** (interruptor `switch.sensor_humo_silence` del propio detector),
  **Ver en el plano** (lleva a la cocina) y **Descartar**. Descartada, no vuelve hasta que se despeje y detecte
  humo otra vez. Además, la automatización de Home Assistant «Alerta de humo en la cocina» avisa por Telegram en
  el grupo de **Alertas** (no en el de Notificaciones).
- **Fuga de agua en el limpiasuelos** (`binary_sensor.sensor_agua_dreame_water_leak`): mientras el sensor esté mojado.
  Botones **Ver en el plano** (lleva al salón), **Pausar el robot** (si está limpiando) y **Descartar**. Descartada,
  no vuelve hasta que el sensor se seque y se moje otra vez.

Las alertas descartadas se recuerdan en el navegador de cada pantalla. Para desactivarlas en una pantalla concreta:
`"priority_alerts": false` en la configuración de la tarjeta.

## Vista general, estancias y capas

Saludo y tiempo, avisos, alarma, acciones de toda
la casa, clima (aire acondicionado, temperatura y humedad de fuera y previsión de las próximas 24 h; las Shelly X2i no
miden temperatura ni humedad: la de cada estancia sale de sus sensores propios, ver más abajo), energía y batería; en cada estancia iluminación con escenas (Todo, Relax, Noche y Apagar; en **Baño 1 y Baño 2** son Todo, Relax (solo la hornacina), Rutinas (hornacina y espejo) y Apagar; en Cocina «Relax» es **Cocinar** y «Noche» solo enciende la barra al 5 %, ver `scenes` en `rooms.ts`), persianas y cortinas (estas se abren en horizontal, con su propio icono y tarjeta), ambiente, seguridad,
dispositivos; y las capas Luces, Persianas, Clima, Energía, Electrodomésticos, Seguridad y
Multimedia. Las hojas de detalle (luz, instalación solar, depuradora) ocupan toda la pantalla con fondo opaco.

Estancias y dispositivos: [`src/house/rooms.ts`](src/house/rooms.ts); capas: [`src/house/layers.ts`](src/house/layers.ts)
(un dispositivo nuevo se añade ahí).

**Ambiente en primer lugar**: en **Oficina 1, Oficina 2 y Baño 2** la tarjeta de temperatura y humedad (sensores
`sensor.sensor_t_h_oficina_1_*`, `sensor.sensor_t_h_oficina_2_*` y `sensor.sensor_t_h_m_i_bano_2_*`) sale la primera
de la estancia y con cifras grandes, para leerla de lejos en la Shelly de cada una (`climateFirst` en `rooms.ts`). El
Baño 2 además muestra su movimiento y su luz ambiente (tarjeta _Movimiento y luz_).

**Previsión**: bajo el saludo, las próximas horas de hoy y los siguientes 5 días (mínima, máxima y probabilidad de
lluvia) de la entidad `weather` configurada, que usa las coordenadas de la casa. Se lee con `weather/subscribe_forecast`, así que la entidad debe soportar previsión diaria y por horas.

**Todos los avisos**: el botón _Ver todos los avisos_ del panel _Avisos_ abre una hoja con el catálogo completo de
avisos posibles, se cumplan o no. Arriba, _Activos ahora_ (en el color de su gravedad; tocar uno lleva a su
estancia); debajo, agrupados (Seguridad, Agua, Puertas, Cocina, Electrodomésticos, Meteorología, Energía, Sistema y
A pantalla completa), los que podrían saltar, cada uno con su condición y su gravedad. Tocar una fila despliega las
entidades de Home Assistant que vigila. Se abre aunque no haya ningún aviso.

**Menú de comidas**: la tarjeta _Menú_ de la vista general muestra la comida y la cena de hoy y de mañana. Las recetas
y su planificación se hacen en **Mealie** (add-on de Home Assistant); aquí solo se leen. Tocar una comida abre su receta
(tiempos, raciones, ingredientes, pasos, notas, enlace a la receta original y vídeo); _Ver todo el menú_ abre un
calendario por semanas (flechas y _Hoy_) con todas las comidas planificadas, también desayunos, meriendas, postres, etc.
Las comidas sin receta (solo nota, p. ej. «Comemos fuera») se ven pero no se abren. El vídeo sale del extra `video` de
la receta en Mealie o, si no está, del primer enlace de YouTube/Vimeo que haya en su descripción, notas o pasos.
Se lee con los servicios `mealie.get_mealplan` y `mealie.get_recipe` de la integración oficial; hace falta indicar su
`entry_id` en `mealie` (Ajustes → Dispositivos y servicios → Mealie, o en la URL de la integración). Sin `mealie` la
tarjeta no sale.

**Imágenes de las recetas**: miniatura junto a cada comida (tarjeta y calendario) y foto grande en la receta. Se cargan
directamente de Mealie, que por eso tiene publicado el puerto **9000** (add-on → Red). Por defecto se usa el mismo host
con el que se abrió el panel en ese puerto (`http://<host de HA>:9000`), lo que vale con Home Assistant por **http**
en la red local; con https o desde fuera el navegador bloquea imágenes http, así que sin `mealie_url` no se ven (no
molesta: simplemente no salen). Se puede fijar la dirección con `mealie_url`. Las imágenes de Mealie se sirven sin
sesión y la versión de la foto va en la URL, así que al cambiarla en Mealie se actualiza sola.

**Avisos meteorológicos (AEMET)**: aparecen en _Avisos_ (amarillo = info, naranja = aviso, rojo = importante) cuando
un sensor de alertas está activo. Home Assistant no trae las alertas de la AEMET por sí solo: hace falta la
integración **Meteoalarm** (publica los avisos de la AEMET para España). Se detectan solos los `binary_sensor` con
«meteoalarm» o «aemet» en el id, o se indican con `weather_alerts`.

**Tocar para ver más**: las filas de Seguridad (alarma, puertas, sensores de agua), cada puerta de la calle y cada
cámara, el clima de la estancia y el tiempo abren el detalle de Home Assistant (la alarma se conecta o desconecta ahí).

**Robot aspirador** (Dreame X60 Pro Master, `vacuum.x60_pro_master`): además de _Limpiar_ y _A la base_, el botón **Personalizar limpieza e historial** (o tocar su
marcador en el plano) abre una hoja con:

- **Modo**: solo aspirar, solo fregar o aspirar y fregar a la vez; **potencia de aspirado** (silencio, estándar,
  fuerte, turbo) y **humedad de la mopa** (poco húmeda, húmeda, muy mojada). Sin mopa instalada solo deja aspirar.
- **Estancias**: botones _Interior_, _Exterior_ (el porche, lo único exterior del mapa del robot) y _Todo_, o _Elegir_
  y tocar las estancias en un plano sencillo: el número indica el orden de limpieza. Son las mismas que las del
  panel (Salón, Cocina y Entrada por separado). El **Dormitorio 3** sale como «sin mapa» y no se puede elegir hasta
  que el robot lo mapee.
- **Últimas limpiezas**: fecha, duración, superficie, tipo, si se interrumpió y por qué, si llevaba mopa, método,
  estancias donde no pudo entrar, y el desgaste de cepillos, filtro, sensores y ruedas (de
  `sensor.x60_pro_master_cleaning_history`).
- **Mapas**: el mapa en directo mientras limpia (o el último estado) y el recorrido de cada limpieza del historial, con
  una miniatura en cada tarjeta; tocar una la muestra en grande. Salen de `camera.x60_pro_master_map` (la integración
  de Dreame guarda las últimas 30 tareas con su imagen).
- Al empezar se desactiva CleanGenius y la limpieza personalizada del robot (si no, ignora estos ajustes), se fijan
  modo, succión y humedad, se ordena la secuencia de estancias y se llama a `dreame_vacuum.vacuum_clean_segment`.

**Modo kiosko**: el despliegue oculta la cabecera y la barra lateral de Home Assistant (`"kiosk": true` en
`deploy.json`). El botón **Ajustes** del final de la barra inferior las muestra (recarga con `?disable_km`, que es como
lo desactiva kiosk-mode) para entrar en ajustes u otros paneles; el mismo botón, ahora **Kiosko**, vuelve a ocultarlas.
Volver a abrir el panel desde la barra lateral también lo deja en kiosko. Se quita con `"kiosk_toggle": false`.

Tras `idle_return_seconds` (180 s por defecto) sin tocar la pantalla vuelve a la vista por defecto de su dashboard
(ver [Dashboards, vista por defecto y sensor de luz](#dashboards-vista-por-defecto-y-sensor-de-luz)) y deshace el zoom del plano.

En pantallas estrechas (paneles verticales), si la vista por defecto es una estancia, al arrancar y al volver por
inactividad el contenido sale ya desplazado: los controles de la estancia parten del borde superior y el plano queda
encima, a un gesto de scroll hacia arriba. En «Casa General» y en pantallas anchas no cambia nada.

## Configuración de la tarjeta

```json
{
  "type": "custom:functional-v2",
  "title": "Villawachitos",
  "theme": "auto",
  "weather": "weather.forecast_casa",
  "weather_alerts": ["binary_sensor.meteoalarm"],
  "alarm": "alarm_control_panel.alarma_vivienda",
  "mealie": "<entry_id de la integración Mealie>",
  "mealie_url": "http://homeassistant.local:9000",
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
| **Functional v2: deploy a Home Assistant** | Build → SSH → recurso `?v=<hash>` → todos los dashboards de `deploy.json`                    |
| Functional v2: typecheck y lint            | Comprobaciones                                                                               |

Con `?mock`, la barra de desarrollo tiene los botones **Timbre** y **Fuga robot** para probar las alertas (y **Luz**
para el tema según el sensor de luz); las
persianas simuladas tardan unos segundos en moverse (para ver su animación) y el portero se vuelve a cerrar solo.

Usa el `.env` compartido de `villawachitos/dashboards/.env` y el script común de
[`../shared/scripts/deploy.mjs`](../shared/scripts/deploy.mjs), configurado en [`deploy.json`](deploy.json).
