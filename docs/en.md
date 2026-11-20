# WebRTC Camera

Bring the cameras of your **go2rtc** server into Gladys: images on the dashboard, camera status,
WebRTC live view, scene triggers and actions.

[go2rtc](https://github.com/AlexxIT/go2rtc) is the camera server that reads almost any camera
(RTSP, ONVIF, Tapo, Reolink, HomeKit, Ring…) and serves it over WebRTC. It runs on its own, and
it is also included in **Frigate** and in the **Home Assistant** add-on: you may already have one.

## Requirements

- Gladys 5.3 or newer.
- A go2rtc server reachable from Gladys on your network (API on port **1984** by default).
- Your cameras declared in go2rtc (`streams:` section of `go2rtc.yaml`).

## Configuration

| Field                     | What to put                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| go2rtc address            | The go2rtc API, e.g. `http://192.168.1.20:1984`.                                                               |
| User name / Password      | Only if the go2rtc API is protected (`api.username` / `api.password`).                                         |
| Cameras                   | Stream names to add, separated by commas. Empty: all the streams.                                              |
| Image refresh (s)         | Seconds between two images of each camera (default 60). It also detects a camera that stops answering. 0: off. |
| Image width (px)          | Width of the images (default 640). Gladys accepts 150 KB max: a heavy image is asked again, narrower.          |
| Live view address (https) | Optional: go2rtc behind an https reverse proxy, as your browser sees it. Adds a WebRTC live view button.       |
| Detailed logs             | Logs every image and every error. Turn it off afterwards.                                                      |

Then:

1. Click **Test the connection**: the answer gives the go2rtc version and the cameras found.
2. Open the **Discover** tab and add the cameras to Gladys.
3. Optional: **Test an image** checks one camera (size, time).

Each go2rtc stream becomes a camera in Gladys. The device id comes from the stream name:
**renaming a stream in go2rtc creates a new camera** in Gladys.

## Camera status

- A camera is **offline** after two failed images in a row, or at once if go2rtc itself does
  not answer. Its badge then shows "unreachable".
- The integration status (Configuration screen) shows whether go2rtc answers, and why not
  (wrong address, wrong password…).
- With "Image refresh" at 0, the status is only updated when an image is asked.

## Scenes

**Triggers**

- **A camera stops answering** — filter: camera. Variables: camera name, reason (code:
  `http_error`, `timeout`, `server_unreachable`, `auth`, …).
- **A camera answers again** — filter: camera. Variables: camera name, time offline (s).

They fire once, at the change. A camera already down when Gladys starts is shown offline, but
fires nothing.

**Actions**

- **Take a camera image** — takes a fresh image now. Put it just before the Gladys action
  "Send a camera image" to send an up-to-date image. Outputs: image taken (yes/no), size (KB).
- **Read the go2rtc cameras again** — adds the new streams. Outputs: number of cameras, cameras
  not offline.

Example: _A camera stops answering_ → _Send a message_ "Camera {{device_name}} is offline
({{reason}})".

## Dashboard widgets

- **Cameras**: all the cameras with their last image, their state and a live view link; the
  go2rtc status; a button to refresh all the images.
- **Camera**: one camera in large (chosen in the widget settings), its state, a **New image**
  button and a **Live view** button.

The live view opens the go2rtc WebRTC player (`stream.html?mode=webrtc`). Gladys only opens
https links: fill in the **Live view address** with an https address of go2rtc (reverse proxy).
Without it, the live view buttons are hidden.

## Troubleshooting

| Message                                  | What to do                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| go2rtc cannot be reached                 | Check the address and port, and that Gladys can reach that machine.    |
| go2rtc refused the user name or password | Check the fields against `api.username` / `api.password` of go2rtc.    |
| this address is not a go2rtc API         | The address points at another service: use the go2rtc API port (1984). |
| go2rtc could not read the camera         | go2rtc cannot open the stream: check it in the go2rtc web page.        |
| the image stays over 150 KB              | Lower the **Image width**.                                             |

Images need go2rtc to decode the video: for H.264/H.265 cameras, go2rtc uses **FFmpeg** (included
in its Docker image and in Frigate).

## Privacy

- The integration only talks to your go2rtc server. No cloud.
- The camera URLs listed by go2rtc (often with passwords) are never sent to Gladys nor logged.
- Images stay in memory (the last one per camera).
