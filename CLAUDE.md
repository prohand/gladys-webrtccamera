# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human contributors.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) that brings the cameras of a **go2rtc** server
(the WebRTC camera gateway, also bundled in Frigate and the Home Assistant add-on) into Gladys.
It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js). Requires
Gladys 5.3+ (`keywords` and `countries` in the manifest).

Every go2rtc stream is a camera device. The integration sends periodic images, answers fresh
image requests, tracks each camera's availability, fires scene triggers on changes, offers
scene actions and two dashboard widgets. Local only (`transports: ["local"]`).

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/units.test.js              # one file
node --test --test-name-pattern "offline"   # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store --skip-image-check .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on Node 22 and 24,
the store checks and a Docker build on pull requests: run the three commands before pushing.

## Architecture

```
index.js                     SDK bootstrap only: registerHandlers, shutdown, connect
src/integration.js           every SDK handler, registered before connect() (testable wiring)
src/service.js               config, go2rtc client, refresh loop, availability, scene events
src/cameras.js               one device per stream: ids, discovery payload, state, image cache
src/go2rtc/client.js         go2rtc HTTP API (/api, /api/streams, /api/frame.jpeg), errors
src/go2rtc/snapshot.js       one image under 150 KB (asks go2rtc for narrower frames)
src/capabilities/scenes.js   scene actions (manifest `scene_actions`)
src/capabilities/widgets.js  dashboard widgets `cameras` and `camera` (manifest `widgets`)
src/messages.js              every user-facing message, { en, fr, de, es }
src/i18n.js                  LANGUAGES, pick(), localize()
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/logging.js               "Detailed logs" switch (LOG_LEVEL at runtime)
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys
test/                        node --test; fake Gladys from the SDK, fake go2rtc on 127.0.0.1
.github/scripts/changelog-release.mjs   changelog roll used by the Release workflow
```

### Invariants worth knowing

- **External ids are forever.** A camera id is `gladys.externalIds('camera', encodeURIComponent(streamName))`.
  The stream name is also stored in the `GO2RTC_STREAM` device param. Never change this scheme:
  it would create new devices and orphan the old ones (history, scenes, dashboards).
- **Images ≤ 150 KB**, measured on the whole `image/jpg;base64,...` string. There is no image
  library in the container: `snapshot.js` asks go2rtc for a narrower `width` instead.
- **Widget images** are served by `onWidgetGetImage` under a key that changes at every snapshot
  (`snap-<hash>-<seq>`): the core caches an image one hour by key.
- **Availability**: a camera turns offline after 2 failed images in a row, at once when go2rtc
  itself does not answer. A trigger fires on a **change** only (not for a camera already down
  at startup).
- **No scene loops**: images taken by a scene action, a widget button or a configuration
  action never fire a scene trigger (`events: false`).
- **Secrets**: the go2rtc password and the camera URLs listed by `/api/streams` (they often hold
  passwords) are never logged nor sent to Gladys. Only stream names leave `client.js`.
- **Every feature declares `name`, `min`, `max`, `read_only`, `has_feedback`** (NOT NULL in
  Gladys); the image feature uses `0`/`0`.
- **The container rootfs is read-only.** Nothing is written to disk (images stay in memory).
- Trigger, action, widget and config keys are stored by users: never rename them.

## Rules

- **Versions belong to the Release workflow** (Actions → Release). Never edit `version` in
  `package.json` or in the manifest, nor the `docker_image` tag, by hand.
  `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version
  heading: the Release workflow moves the section, and it becomes the GitHub Release notes.
- **Manifest.** Texts are multi-language objects `{ en, fr, de, es }`: `label`, `description`
  and `placeholder` alike. The catalog `description` holds 10 to 100 characters per language.
  `test/manifest.test.js` ties the manifest to the code (defaults, actions, scenes, widgets,
  the four languages): change both sides together.
- **Catalog fields**: `categories` (store vocabulary), `keywords` (≤ 10), `countries` (≤ 20
  ISO codes, absent would mean worldwide), `transports: ["local"]`.
- **User-facing text** is in English, French, German and Spanish: action messages, widget
  texts, manifest texts and `docs/*.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English.
  Tests never touch the network (the fake go2rtc listens on the loopback only).
