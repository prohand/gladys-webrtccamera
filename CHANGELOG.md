# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release workflow moves that
section under the version it ships, and the section becomes the notes of the version's GitHub
Release.

## [Unreleased]

## [1.0.1] - 2026-11-20

### Added

- First version of the WebRTC Camera integration: every stream of a go2rtc server becomes a
  camera in Gladys.
- Periodic images sent to Gladys (configurable, 0 to turn them off), fresh image on demand,
  automatic narrowing to stay under the 150 KB Gladys accepts.
- Camera availability: transport badge (local / unreachable) and connection status of go2rtc.
- Scene triggers: a camera stops answering, a camera answers again.
- Scene actions: take a camera image, read the go2rtc cameras again.
- Dashboard widgets: all the cameras (images, state, go2rtc status), and one camera in large
  with a "New image" button and a WebRTC live view link.
- Configuration actions: test the connection, test an image.
- English, French, German and Spanish texts and documentation.
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks, Docker build), multi-arch image
  build, Release workflow, GitHub Releases, Dependabot.

[Unreleased]: https://github.com/prohand/gladys-webrtccamera/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-webrtccamera/releases/tag/v1.0.1
