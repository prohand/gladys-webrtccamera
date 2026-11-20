// -----------------------------------------------------------------------------
// HTTP client of the go2rtc API.
//
// go2rtc (https://github.com/AlexxIT/go2rtc) is the camera gateway this
// integration relies on: it reads the cameras (RTSP, ONVIF, HomeKit, Tapo,
// Ring…), serves them over WebRTC to the browsers, and answers a JPEG frame of
// any stream on its HTTP API. Frigate and the Home Assistant add-on ship it
// too, so a user often runs one already.
//
// The three calls used here:
//   GET /api                        → { version, ... }
//   GET /api/streams                → { "<name>": { producers, consumers }, ... }
//   GET /api/frame.jpeg?src=<name>  → one JPEG frame (`width` resizes it)
//
// The producers of /api/streams carry the camera URLs, passwords included:
// only the stream NAMES leave this module, and nothing here logs a URL with
// its credentials.
// -----------------------------------------------------------------------------

/** Error codes, also the `reason` of the camera_offline scene trigger. */
export const ERROR_CODES = {
  NOT_CONFIGURED: 'not_configured',
  INVALID_URL: 'invalid_url',
  UNREACHABLE: 'unreachable',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  NOT_FOUND: 'not_found',
  HTTP: 'http_error',
  INVALID_IMAGE: 'invalid_image',
  TOO_LARGE: 'too_large',
  SERVER_UNREACHABLE: 'server_unreachable',
};

const JSON_TIMEOUT_MS = 5_000;
// A frame may need go2rtc to open the camera and decode a key frame first.
const FRAME_TIMEOUT_MS = 8_000;

export class Go2rtcError extends Error {
  /**
   * @param {string} code one of ERROR_CODES
   * @param {string} message English detail, for the logs
   * @param {{ status?: number, cause?: unknown }} [extra]
   */
  constructor(code, message, { status, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'Go2rtcError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Parse the URL typed by the user. A missing scheme means http://; credentials
 * written in the URL (http://user:pass@host) are moved to the Basic header,
 * since fetch refuses a URL that carries them.
 *
 * @param {string} raw
 * @returns {{ base: string, username: string, password: string } | null}
 */
export function parseBaseUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return null;
  }
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    throw new Go2rtcError(ERROR_CODES.INVALID_URL, 'The go2rtc URL is not a valid address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Go2rtcError(ERROR_CODES.INVALID_URL, 'The go2rtc URL must start with http(s)://');
  }
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return { base: url.href.replace(/\/+$/, ''), username, password };
}

/**
 * The address to show in logs and messages: no credentials, ever.
 * @param {string} raw
 * @returns {string}
 */
export function safeUrl(raw) {
  try {
    return parseBaseUrl(raw)?.base ?? '';
  } catch {
    return '(invalid URL)';
  }
}

function isJpeg(buffer) {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

/**
 * @param {{ go2rtc_url: string, username?: string, password?: string }} config
 * @param {{ fetch?: typeof fetch }} [options] fetch is injectable for the tests
 */
export function createGo2rtcClient(config, { fetch: fetchImpl = globalThis.fetch } = {}) {
  let parsed = null;
  let parseError = null;
  try {
    parsed = parseBaseUrl(config.go2rtc_url);
  } catch (err) {
    parseError = err;
  }

  // The fields of the form win over credentials written in the URL.
  const username = config.username || parsed?.username || '';
  const password = config.password || parsed?.password || '';
  const headers = {};
  if (username || password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  function urlOf(path, query) {
    if (parseError) {
      throw parseError;
    }
    if (!parsed) {
      throw new Go2rtcError(ERROR_CODES.NOT_CONFIGURED, 'No go2rtc URL configured');
    }
    const url = new URL(`${parsed.base}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, String(value));
    }
    return url;
  }

  async function request(path, { query, timeoutMs }) {
    const url = urlOf(path, query);
    let response;
    try {
      response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new Go2rtcError(ERROR_CODES.TIMEOUT, `go2rtc did not answer within ${timeoutMs} ms`);
      }
      const detail = err?.cause?.code ?? err?.message ?? 'network error';
      throw new Go2rtcError(ERROR_CODES.UNREACHABLE, `go2rtc unreachable (${detail})`, {
        cause: err,
      });
    }
    if (response.status === 401 || response.status === 403) {
      throw new Go2rtcError(
        ERROR_CODES.AUTH,
        `go2rtc refused the credentials (${response.status})`,
        {
          status: response.status,
        },
      );
    }
    if (response.status === 404) {
      throw new Go2rtcError(ERROR_CODES.NOT_FOUND, `go2rtc answered 404 on ${path}`, {
        status: 404,
      });
    }
    if (!response.ok) {
      // go2rtc puts the reason in the body as plain text ("streams: ..."): a
      // short excerpt helps, the camera URL is never part of it.
      const body = (await response.text().catch(() => '')).slice(0, 200).trim();
      throw new Go2rtcError(
        ERROR_CODES.HTTP,
        `go2rtc answered ${response.status}${body ? `: ${body}` : ''}`,
        { status: response.status },
      );
    }
    return response;
  }

  return {
    /** True once a URL is filled in (valid or not). */
    get configured() {
      return Boolean(parsed) || Boolean(parseError);
    },

    /** Base URL, without credentials, for the logs. */
    get baseUrl() {
      return parsed?.base ?? '';
    },

    /** GET /api: `{ version, ... }`. */
    async info() {
      const response = await request('/api', { timeoutMs: JSON_TIMEOUT_MS });
      return response.json().catch(() => ({}));
    },

    /**
     * GET /api/streams, reduced to the sorted stream names.
     * @returns {Promise<string[]>}
     */
    async streamNames() {
      const response = await request('/api/streams', { timeoutMs: JSON_TIMEOUT_MS });
      let body;
      try {
        body = await response.json();
      } catch {
        throw new Go2rtcError(ERROR_CODES.HTTP, 'go2rtc /api/streams did not answer JSON');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return [];
      }
      return Object.keys(body).sort((a, b) => a.localeCompare(b));
    },

    /**
     * GET /api/frame.jpeg: one JPEG frame of a stream.
     * @param {string} name stream name
     * @param {{ width?: number }} [options]
     * @returns {Promise<Buffer>}
     */
    async frame(name, { width } = {}) {
      const query = { src: name };
      if (width) {
        query.width = width;
      }
      const response = await request('/api/frame.jpeg', { query, timeoutMs: FRAME_TIMEOUT_MS });
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!isJpeg(buffer)) {
        throw new Go2rtcError(ERROR_CODES.INVALID_IMAGE, 'go2rtc did not return a JPEG image');
      }
      return buffer;
    },
  };
}

/**
 * Address of the go2rtc WebRTC player of a stream, or `null` when no https
 * address is known (the Gladys widgets only open https links).
 *
 * @param {{ go2rtc_url: string, live_view_url: string }} config
 * @param {string} name stream name
 * @returns {string | null}
 */
export function liveViewUrl(config, name) {
  let base = null;
  for (const candidate of [config.live_view_url, config.go2rtc_url]) {
    try {
      const parsed = parseBaseUrl(candidate);
      if (parsed?.base.startsWith('https://')) {
        base = parsed.base;
        break;
      }
    } catch {
      // An invalid address is simply not a live view address.
    }
  }
  if (!base) {
    return null;
  }
  const url = new URL(`${base}/stream.html`);
  url.searchParams.set('src', name);
  url.searchParams.set('mode', 'webrtc');
  return url.href;
}
