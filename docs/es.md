# WebRTC Camera

Lleve las cámaras de su servidor **go2rtc** a Gladys: imágenes en el panel, estado de las
cámaras, directo WebRTC, disparadores y acciones de escena.

[go2rtc](https://github.com/AlexxIT/go2rtc) es el servidor de cámaras que lee casi cualquier
cámara (RTSP, ONVIF, Tapo, Reolink, HomeKit, Ring…) y la sirve por WebRTC. Funciona solo, y
también está incluido en **Frigate** y en el complemento de **Home Assistant**: quizá ya tenga
uno.

## Requisitos

- Gladys 5.3 o posterior.
- Un servidor go2rtc accesible desde Gladys en su red (API en el puerto **1984** por defecto).
- Sus cámaras declaradas en go2rtc (sección `streams:` de `go2rtc.yaml`).

## Configuración

| Campo                         | Qué poner                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Dirección de go2rtc           | La API de go2rtc, p. ej. `http://192.168.1.20:1984`.                                                                           |
| Usuario / Contraseña          | Solo si la API de go2rtc está protegida (`api.username` / `api.password`).                                                     |
| Cámaras                       | Nombres de los flujos que se añaden, separados por comas. Vacío: todos los flujos.                                             |
| Actualización de imágenes (s) | Segundos entre dos imágenes de cada cámara (60 por defecto). También detecta una cámara que deja de responder. 0: desactivado. |
| Ancho de las imágenes (px)    | Ancho de las imágenes (640 por defecto). Gladys acepta 150 KB como máximo: una imagen pesada se vuelve a pedir más estrecha.   |
| Dirección del directo (https) | Opcional: go2rtc detrás de un proxy inverso https, tal como lo ve su navegador. Añade un botón de directo WebRTC.              |
| Registros detallados          | Registra cada imagen y cada error. Desactívelo después.                                                                        |

Después:

1. Pulse **Probar la conexión**: la respuesta da la versión de go2rtc y las cámaras encontradas.
2. Abra la pestaña **Descubrir** y añada las cámaras a Gladys.
3. Opcional: **Probar una imagen** comprueba una cámara (tamaño, tiempo).

Cada flujo de go2rtc se convierte en una cámara en Gladys. El identificador del dispositivo viene
del nombre del flujo: **renombrar un flujo en go2rtc crea una cámara nueva** en Gladys.

## Estado de las cámaras

- Una cámara está **sin conexión** tras dos imágenes fallidas seguidas, o enseguida si el propio
  go2rtc no responde. Su distintivo muestra entonces «inaccesible».
- El estado de la integración (pantalla de configuración) indica si go2rtc responde y, si no,
  por qué (dirección o contraseña incorrectas…).
- Con «Actualización de imágenes» a 0, el estado solo se actualiza cuando se pide una imagen.

## Escenas

**Disparadores**

- **Una cámara deja de responder** — filtro: cámara. Variables: nombre de la cámara, motivo
  (código: `http_error`, `timeout`, `server_unreachable`, `auth`, …).
- **Una cámara vuelve a responder** — filtro: cámara. Variables: nombre de la cámara, tiempo sin
  conexión (s).

Se activan una vez, en el cambio. Una cámara ya caída al arrancar Gladys se muestra sin conexión,
pero no activa nada.

**Acciones**

- **Tomar una imagen de cámara** — toma una imagen nueva ahora. Póngala justo antes de la acción
  de Gladys «Enviar una imagen de cámara» para enviar una imagen actual. Salidas: imagen tomada
  (sí/no), tamaño (KB).
- **Volver a leer las cámaras go2rtc** — añade los flujos nuevos. Salidas: número de cámaras,
  cámaras no desconectadas.

Ejemplo: _Una cámara deja de responder_ → _Enviar un mensaje_ «La cámara {{device_name}} está sin
conexión ({{reason}})».

## Widgets del panel

- **Cámaras**: todas las cámaras con su última imagen, su estado y un enlace al directo; el
  estado de go2rtc; un botón para actualizar todas las imágenes.
- **Cámara**: una cámara en grande (elegida en los ajustes del widget), su estado, un botón
  **Nueva imagen** y un botón **En directo**.

El directo abre el reproductor WebRTC de go2rtc (`stream.html?mode=webrtc`). Gladys solo abre
enlaces https: indique en **Dirección del directo** una dirección https de go2rtc (proxy inverso).
Sin ella, los botones de directo se ocultan.

## Solución de problemas

| Mensaje                                   | Qué hacer                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| no se puede contactar con go2rtc          | Compruebe la dirección y el puerto, y que Gladys alcanza esa máquina.          |
| go2rtc rechazó el usuario o la contraseña | Compare los campos con `api.username` / `api.password` de go2rtc.              |
| esta dirección no es una API de go2rtc    | La dirección apunta a otro servicio: use el puerto de la API de go2rtc (1984). |
| go2rtc no pudo leer la cámara             | go2rtc no consigue abrir el flujo: compruébelo en la página web de go2rtc.     |
| la imagen supera 150 KB                   | Reduzca el **Ancho de las imágenes**.                                          |

Para las imágenes, go2rtc tiene que decodificar el vídeo: con cámaras H.264/H.265, go2rtc usa
**FFmpeg** (incluido en su imagen Docker y en Frigate).

## Privacidad

- La integración solo habla con su servidor go2rtc. Sin nube.
- Las URL de las cámaras que lista go2rtc (a menudo con contraseña) nunca se envían a Gladys ni
  se registran.
- Las imágenes se quedan en memoria (la última de cada cámara).
