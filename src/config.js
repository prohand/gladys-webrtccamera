// -----------------------------------------------------------------------------
// Integration configuration.
//
// The values are filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module holds the defaults (they
// MUST match the manifest `default` values, see test/manifest.test.js) and
// turns the raw object into typed values, so the rest of the code never deals
// with `undefined` or with a number typed as a string.
// -----------------------------------------------------------------------------

/** Below this, a periodic snapshot would load go2rtc for little gain. */
export const MIN_REFRESH_SECONDS = 10;

/** Snapshot width bounds, in pixels (manifest `min` / `max`). */
export const MIN_SNAPSHOT_WIDTH = 160;
export const MAX_SNAPSHOT_WIDTH = 1920;

export const DEFAULT_CONFIG = {
  // Base URL of the go2rtc server, e.g. http://192.168.1.20:1984
  go2rtc_url: '',
  // HTTP Basic credentials of the go2rtc API (its `api.username` /
  // `api.password` settings). Empty: no authentication.
  username: '',
  password: '',
  // Comma-separated stream names to publish. Empty: every go2rtc stream.
  streams: '',
  // Width of the snapshots sent to Gladys, in pixels.
  snapshot_width: 640,
  // Seconds between two periodic snapshots of every camera. 0: none, the
  // images are only taken when Gladys asks for one.
  refresh_interval: 60,
  // https address of go2rtc as seen from a browser (reverse proxy), for the
  // "Live view" buttons of the widgets. Empty: the go2rtc URL when it is https.
  live_view_url: '',
  debug_logs: false,
};

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback) {
  const number = Number(value);
  return value === '' || value === null || value === undefined || !Number.isFinite(number)
    ? fallback
    : number;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Merge the user config with the defaults and force the types.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 * @returns {typeof DEFAULT_CONFIG}
 */
export function normalizeConfig(raw = {}) {
  const refresh = Math.round(toNumber(raw.refresh_interval, DEFAULT_CONFIG.refresh_interval));
  return {
    go2rtc_url: toText(raw.go2rtc_url),
    username: toText(raw.username),
    // A password may legitimately start or end with a space: keep it as is.
    password: typeof raw.password === 'string' ? raw.password : '',
    streams: toText(raw.streams),
    snapshot_width: clamp(
      Math.round(toNumber(raw.snapshot_width, DEFAULT_CONFIG.snapshot_width)),
      MIN_SNAPSHOT_WIDTH,
      MAX_SNAPSHOT_WIDTH,
    ),
    // 0 turns the periodic snapshots off; anything between 1 and 9 seconds is
    // raised to the minimum rather than read as "off".
    refresh_interval: refresh <= 0 ? 0 : clamp(refresh, MIN_REFRESH_SECONDS, 3600),
    live_view_url: toText(raw.live_view_url),
    debug_logs: raw.debug_logs === true || raw.debug_logs === 'true',
  };
}

/**
 * The stream names the user asked for, or `null` for "every stream".
 * @param {typeof DEFAULT_CONFIG} config
 * @returns {Set<string> | null}
 */
export function wantedStreams(config) {
  const names = config.streams
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}
