# Functional v1

Panel de pared **funcional e informativo**, con colores cálidos y tranquilos (lino, salvia, terracota y ámbar),
paneles de cristal esmerilado y animaciones suaves. Tema claro, oscuro o auto (botón al final de la barra inferior).

## Vista general (Casa)

En el centro, la **maqueta 3D de toda la casa** (interior y exterior). Sobre cada estancia hay un acceso con su nombre,
temperatura (si tiene sensor), luces encendidas y presencia; las estancias con luces encendidas brillan en la imagen
y la piscina se ilumina con su luz. Alrededor:

- **Saludo**, fecha, hora, tiempo y quién está en casa.
- **Energía hoy**: producción y consumo, barras de los últimos 7 días (hoy rayado) y autosuficiencia.
- **Batería**: % de carga, energía almacenada, autonomía estimada y curva de 24 h.
- **Alarma**: estado y botón conectar/desconectar (pide confirmación), puertas de la calle, puerta de casa y cámaras.
- **Avisos** calculados en el panel: alarma, fugas de agua, puertas abiertas, frigorífico, lavavajillas, arenero,
  batería baja, averías (`binary_sensor` de clase `problem`) y dispositivos sin conexión. Tocar uno lleva a su estancia.
- **Clima interior** (salón, humedad, exterior y aire acondicionado) con curva de 24 h.
- **Toda la casa**: luces encendidas, apertura media de persianas, apagar todo y subir/bajar todas (con confirmación).

## Vista de estancia

Al tocar una estancia (o su botón en la barra inferior), la cámara **se acerca suavemente** a ella y aparecen:

- Cabecera con el nombre y resumen (temperatura, humedad, luces, persianas).
- **Iluminación**: interruptor general, escenas (_Todo_, _Relax_, _Noche_, _Apagar_, según el tipo de cada luminaria
  del plano) y un mosaico por luz con intensidad; el icono de ajustes abre el detalle (intensidad, temperatura de
  color, color y efectos WLED).
- **Luces sobre la imagen**: cada luminaria aparece en su sitio; tocar enciende/apaga, mantener pulsado abre el detalle.
- **Ambiente** (temperatura y humedad con curva de 24 h) o el tiempo en el exterior.
- **Persianas** con dibujo de lamas, subir/parar/bajar y apertura exacta.
- **Dispositivos** de la estancia: climatización, TV, robot, frigorífico (con curva de temperaturas), lavavajillas,
  freidora, lavadora, arenero, toalleros, ventilación, instalación solar (flujo de energía animado), depuradora,
  puertas de la calle, portero (abrir con confirmación), cámaras y presencia.
- **Actividad de hoy**: línea de tiempo con cuándo ha estado encendida cada luz y abierta cada persiana.

Tras `idle_return_seconds` (180 s por defecto) sin tocar la pantalla vuelve a la vista general.

## Estancias y dispositivos

Todo está en [`src/house/rooms.ts`](src/house/rooms.ts): luces (con nombre corto), persianas, sensores de clima y
dispositivos de cada estancia. La forma de la casa sale del plano compartido con House 3D v1
([`../house-3d-v1/src/scene/plan.ts`](../house-3d-v1/src/scene/plan.ts)): si se retoca allí, cambia aquí también.

## Maqueta 3D

La casa es el modelo 3D de House 3D v1 adaptado al estilo del panel
([`src/scene3d/calm-scene.ts`](src/scene3d/calm-scene.ts), three.js): muros cortados a media altura, muebles, camas,
sofá, cocina, valla con portones y piscina, con la paleta tranquila del tema (claro u oscuro).

- **Sin control manual**: no se puede girar ni hacer zoom con el dedo. La cámara solo se mueve al elegir una estancia
  (acercamiento animado) o al volver a la vista general, y encuadra la casa en el hueco libre entre los paneles.
- **Materiales** con textura y relieve (normal map) en metros reales, con los acabados de la casa: el mismo suelo de
  baldosa marfil de 60 × 60 dentro, en el porche, en los pasos y en la piscina (coronación y vaso), muros blancos por
  dentro y por fuera, hormigón gris en el aparcamiento (sin llegar a la puerta principal), césped, lino en el sofá y
  madera clara y oscura en los muebles. Persianas y carpinterías en antracita; puerta principal, valla y puerta del
  patio del lavadero en negro (cerradas). Son texturas **CC0 de [ambientCG](https://ambientcg.com)**, en
  [`public/textures/`](public/textures/) (~0,8 MB, créditos en `CREDITS.md`).
- **Dispositivos en su sitio**: frigorífico (al sur del fregadero), robot aspirador en su base (al norte del mueble de
  la TV; desaparece mientras limpia) e impresora (oficina 1). Al entrar en su estancia llevan un marcador con su estado;
  tocarlo lleva a su tarjeta y la resalta.
- **Sol real** según la hora y la ubicación (`latitude`/`longitude` de la tarjeta, o las de la casa por defecto):
  sombras suaves que se recalculan solo cuando cambia algo.
- **Estado en vivo**: luces encendidas iluminan su estancia, la piscina se ilumina, persianas y portones se mueven,
  la TV brilla, los toalleros se calientan y el agua se mueve (se para con "reducir movimiento").
- Solo se renderiza cuando hay cambios o animaciones, para no gastar la tablet.
- Si el navegador no tiene WebGL se usa la maqueta isométrica SVG de abajo.

## Imágenes

Sin WebGL se dibuja una **maqueta isométrica** del plano ([`src/house/iso.ts`](src/house/iso.ts)):
parcela, piscina, suelos, muros cortados a media altura, muebles y árboles, con los colores del tema.

Los **materiales** ([`src/house/materials.ts`](src/house/materials.ts)) se dibujan en metros sobre el plano y se
proyectan con la misma perspectiva: tarima de roble al tresbolillo con vetas, baldosa de 60 × 60 en baños y lavadero,
losas de piedra en porche y piscina, adoquín en el aparcamiento, césped segado a franjas con textura, madera con veta
en los muebles, camas con edredón y almohadas, sofá con cojines, árboles con copa sombreada, sombras suaves de muros y
muebles y un grano fino por encima. El agua de la piscina lleva cáusticas en movimiento en una capa aparte que solo se
anima con `transform`, para que la tablet no tenga que repintar la maqueta (se paran con "reducir movimiento").

Para usar imágenes propias, súbelas a `/config/www/functional-v1/img/` y añádelas en `dashboard.config.json`
(las posiciones van en % del ancho y alto de cada imagen):

```json
"images": {
  "home": "/local/functional-v1/img/casa.webp",
  "hotspots": { "salon": [48, 55], "cocina": [36, 52], "exterior": [60, 82] },
  "rooms": { "salon": "/local/functional-v1/img/salon.webp" },
  "markers": { "light.wled_gledopto": [52, 18] }
}
```

- Con `home`, la imagen cubre toda la pantalla y cada estancia de `hotspots` lleva su acceso en ese punto.
- Una estancia con imagen en `rooms` cambia a su imagen al entrar (fundido y leve zoom); sin ella, se acerca la general.
- `markers` coloca las luces sobre la imagen de su estancia (opcional).

## Configuración de la tarjeta

```json
{
  "type": "custom:functional-v1",
  "title": "Villawachitos",
  "theme": "auto",
  "weather": "weather.forecast_casa",
  "alarm": "alarm_control_panel.alarma_vivienda",
  "idle_return_seconds": 180,
  "latitude": 38.0506,
  "longitude": -1.2114,
  "images": {}
}
```

## Desarrollo y despliegue

| Tarea de VSCode                            | Qué hace                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Functional v1: servidor de desarrollo**  | `http://localhost:5175/dev/index.html` (datos reales; `?mock` simulados; `?dark` / `?light`; `?time=HH:MM` fija el sol) |
| **Functional v1: deploy a Home Assistant** | Build → SSH → recurso `?v=<hash>` → dashboard `functional-v1`                                                           |
| Functional v1: typecheck y lint            | Comprobaciones                                                                                                          |

Usa el `.env` compartido de `villawachitos/dashboards/.env` y el script común de
[`../shared/scripts/deploy.mjs`](../shared/scripts/deploy.mjs), configurado en [`deploy.json`](deploy.json).
El deploy sube también las texturas a `/config/www/functional-v1/textures/` (campo `assets` de `deploy.json`).
Las gráficas son SVG propios (sin librerías); la única dependencia pesada es three.js para la maqueta.
