# WebRTC Camera — Gladys Assistant integration

External integration connecting [Gladys Assistant](https://gladysassistant.com) to the cameras
of a [**go2rtc**](https://github.com/AlexxIT/go2rtc) server — the WebRTC camera gateway that
reads RTSP, ONVIF, Tapo, Reolink, HomeKit, Ring… cameras, standalone or bundled in Frigate and
the Home Assistant add-on.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).
Requires **Gladys 5.3.0 or later**.

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md) · [Deutsch](./docs/de.md) ·
[Español](./docs/es.md).

## What it does

- **Cameras**: every go2rtc stream becomes a camera device in Gladys (Discover tab).
- **Images**: a periodic image of every camera (configurable, can be turned off), and a fresh
  image whenever Gladys asks for one (dashboard, chat). Always under the 150 KB Gladys accepts:
  go2rtc is asked for a narrower frame when needed.
- **Status**: go2rtc connection status in the Configuration screen, a `local` / `unreachable`
  badge per camera.
- **Scene triggers**: _a camera stops answering_, _a camera answers again_.
- **Scene actions**: _take a camera image_ (before "Send a camera image"), _read the go2rtc
  cameras again_.
- **Dashboard widgets**: _Cameras_ (all the cameras, their last image and state, go2rtc status)
  and _Camera_ (one camera in large, "New image" button, WebRTC live view link).
- **Configuration actions**: _Test the connection_, _Test an image_.
- **Languages**: English, French, German, Spanish.
- **Catalog**: categories `security` + `multimedia`, `transports: ["local"]`, search keywords,
  `countries`.

## How it talks to go2rtc

Only the go2rtc HTTP API, on the user's network:

| Call                                              | Use                                  |
| ------------------------------------------------- | ------------------------------------ |
| `GET /api`                                        | version, for "Test the connection"   |
| `GET /api/streams`                                | stream names → cameras               |
| `GET /api/frame.jpeg?src=<n>&width=<w>`           | one JPEG image of a camera           |
| `<https address>/stream.html?src=<n>&mode=webrtc` | live view link opened by the widgets |

Basic authentication (`api.username` / `api.password`) is supported. The camera URLs that
`/api/streams` returns (with their passwords) never leave the go2rtc client: only the stream names
are used.

## Project structure

```
index.js                     SDK bootstrap: registerHandlers, shutdown, connect
src/integration.js           every SDK handler (scan, image, actions, scenes, widgets, lifecycle)
src/service.js               refresh loop, availability, scene triggers
src/cameras.js               camera devices, state and image cache
src/go2rtc/client.js         go2rtc HTTP client and error codes
src/go2rtc/snapshot.js       image sizing under 150 KB
src/capabilities/scenes.js   scene actions
src/capabilities/widgets.js  dashboard widgets
src/messages.js, src/i18n.js user-facing texts (en, fr, de, es)
src/config.js                defaults and normalization
src/logging.js               "Detailed logs" switch
gladys-assistant-integration.json   manifest
docs/                        user documentation (4 languages)
test/                        node --test, fake Gladys + fake go2rtc
.github/                     CI, image build, release, GitHub releases, Dependabot
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="webrtc-camera" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the integration runs
inside its sandboxed container. The SDK reads them automatically.

To try it without cameras, run go2rtc with a test stream:

```yaml
# go2rtc.yaml
streams:
  test: exec:ffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=10 -c:v libx264 -f rtsp {output}
```

## Quality checks

The same checks run on every push and pull request (see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
npm run format:check   # Prettier: is everything formatted?
npm run lint           # ESLint: catch real mistakes
npm test               # Unit tests, via the built-in `node --test` runner
```

Before tagging a release, the store validation can be run locally:

```bash
npx github:GladysAssistant/integration-store --skip-image-check .
```

## Release

**Actions → Release → Run workflow**, pick `patch`, `minor` or `major`: the workflow bumps the
version everywhere (`package.json` + manifest `version`/`docker_image`), moves the
`[Unreleased]` section of [`CHANGELOG.md`](CHANGELOG.md), pushes the `vX.Y.Z` tag, builds the
`linux/amd64` + `linux/arm64` image to `ghcr.io`, publishes the GitHub Release and runs the full
store checks. The decentralized indexer then picks up the new manifest version — the repository
must be public and carry the `gladys-assistant-integration` GitHub topic, and the ghcr.io
package must be public.

Manual test build of a branch: **Actions → Build and publish image → Run workflow** (tags the
image with the branch name, never `latest`); the run summary gives a manifest ready to paste in
Gladys developer mode.

## Security

See [SECURITY.md](SECURITY.md).

## License

Apache-2.0.
