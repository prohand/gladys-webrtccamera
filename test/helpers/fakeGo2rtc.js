// -----------------------------------------------------------------------------
// A fake go2rtc API on 127.0.0.1 (random port): the three routes the
// integration uses, with knobs to make them fail. Loopback only: the tests
// never touch the network.
// -----------------------------------------------------------------------------

import http from 'node:http';

// A valid 1×1 JPEG.
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcp' +
    'LDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAA' +
    'AAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

/** A "JPEG" of the given size: the JPEG magic, then padding. */
export function jpegOfSize(bytes) {
  const buffer = Buffer.alloc(bytes, 0);
  TINY_JPEG.copy(buffer, 0, 0, Math.min(TINY_JPEG.length, bytes));
  return buffer;
}

/**
 * @param {{ streams?: string[], version?: string, auth?: { username: string, password: string } }} [options]
 */
export async function startFakeGo2rtc({
  streams = ['garden', 'entrance'],
  version = '1.9.9',
  auth,
} = {}) {
  const state = {
    streams: [...streams],
    version,
    // stream name → 'fail' | Buffer (custom frame) | (width) => Buffer
    frames: new Map(),
    requests: [],
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fake');
    state.requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
    if (auth) {
      const expected = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
      if (req.headers.authorization !== expected) {
        res.statusCode = 401;
        return res.end('Unauthorized');
      }
    }
    if (url.pathname === '/api') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ version: state.version, host: 'fake' }));
    }
    if (url.pathname === '/api/streams') {
      res.setHeader('content-type', 'application/json');
      // Like go2rtc: the producers carry the camera URLs, credentials included.
      const body = Object.fromEntries(
        state.streams.map((name) => [
          name,
          { producers: [{ url: `rtsp://admin:s3cret@10.0.0.9/${name}` }], consumers: null },
        ]),
      );
      return res.end(JSON.stringify(body));
    }
    if (url.pathname === '/api/frame.jpeg') {
      const name = url.searchParams.get('src');
      if (!state.streams.includes(name)) {
        res.statusCode = 404;
        return res.end('stream not found');
      }
      const frame = state.frames.get(name);
      if (frame === 'fail') {
        res.statusCode = 500;
        return res.end('streams: dial tcp 10.0.0.9:554: i/o timeout');
      }
      const width = Number(url.searchParams.get('width')) || 0;
      const body = typeof frame === 'function' ? frame(width) : (frame ?? TINY_JPEG);
      res.setHeader('content-type', 'image/jpeg');
      return res.end(body);
    }
    res.statusCode = 404;
    return res.end('404 page not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    state,
    url: `http://127.0.0.1:${port}`,
    frameRequests() {
      return state.requests.filter((r) => r.path === '/api/frame.jpeg');
    },
    close() {
      server.closeAllConnections?.();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

/** An address where nothing listens (port 9, "discard", closed on CI). */
export const DEAD_URL = 'http://127.0.0.1:9';
