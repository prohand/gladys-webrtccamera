// -----------------------------------------------------------------------------
// The small modules: configuration, go2rtc client, snapshot sizing, cameras.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DEFAULT_CONFIG, normalizeConfig, wantedStreams } from '../src/config.js';
import {
  createGo2rtcClient,
  ERROR_CODES,
  liveViewUrl,
  parseBaseUrl,
  safeUrl,
} from '../src/go2rtc/client.js';
import { MAX_IMAGE_STRING_LENGTH, takeSnapshot, widthsToTry } from '../src/go2rtc/snapshot.js';
import {
  buildCameraDevice,
  cameraIds,
  createCameraRegistry,
  OFFLINE_AFTER_FAILURES,
  streamNameOf,
} from '../src/cameras.js';
import { DEAD_URL, jpegOfSize, startFakeGo2rtc } from './helpers/fakeGo2rtc.js';

const cleanups = [];
afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()();
  }
});

async function fakeServer(options) {
  const fake = await startFakeGo2rtc(options);
  cleanups.push(() => fake.close());
  return fake;
}

// --- config -------------------------------------------------------------------

test('an empty configuration gives the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('numbers typed as strings are read, and kept within their bounds', () => {
  const config = normalizeConfig({ snapshot_width: '5000', refresh_interval: '5' });
  assert.equal(config.snapshot_width, 1920);
  assert.equal(config.refresh_interval, 10, '1 to 9 s is raised to the minimum, not "off"');
  assert.equal(normalizeConfig({ refresh_interval: 0 }).refresh_interval, 0);
  assert.equal(normalizeConfig({ refresh_interval: 'abc' }).refresh_interval, 60);
});

test('the Cameras field is split on commas, semicolons and new lines', () => {
  assert.equal(wantedStreams(normalizeConfig({ streams: '  ' })), null);
  assert.deepEqual(
    [...wantedStreams(normalizeConfig({ streams: 'a, b;c\nd,' }))],
    ['a', 'b', 'c', 'd'],
  );
});

// --- client -------------------------------------------------------------------

test('the go2rtc address: scheme added, credentials moved out, trailing slash dropped', () => {
  assert.deepEqual(parseBaseUrl('192.168.1.20:1984/'), {
    base: 'http://192.168.1.20:1984',
    username: '',
    password: '',
  });
  assert.deepEqual(parseBaseUrl('https://admin:p%40ss@cams.local/go2rtc/'), {
    base: 'https://cams.local/go2rtc',
    username: 'admin',
    password: 'p@ss',
  });
  assert.equal(parseBaseUrl(''), null);
  assert.throws(() => parseBaseUrl('ftp://host'), { code: ERROR_CODES.INVALID_URL });
  assert.equal(safeUrl('http://admin:secret@host:1984'), 'http://host:1984');
});

test('the client classifies the failures', async () => {
  const fake = await fakeServer({ auth: { username: 'u', password: 'p' } });

  await assert.rejects(createGo2rtcClient({ go2rtc_url: '' }).streamNames(), {
    code: ERROR_CODES.NOT_CONFIGURED,
  });
  await assert.rejects(createGo2rtcClient({ go2rtc_url: DEAD_URL }).streamNames(), {
    code: ERROR_CODES.UNREACHABLE,
  });
  await assert.rejects(createGo2rtcClient({ go2rtc_url: fake.url }).streamNames(), {
    code: ERROR_CODES.AUTH,
  });

  const client = createGo2rtcClient({ go2rtc_url: fake.url, username: 'u', password: 'p' });
  assert.deepEqual(await client.streamNames(), ['entrance', 'garden']);
  assert.equal((await client.info()).version, '1.9.9');
  await assert.rejects(client.frame('nope'), { code: ERROR_CODES.NOT_FOUND });

  fake.state.frames.set('garden', 'fail');
  await assert.rejects(client.frame('garden'), (err) => {
    assert.equal(err.code, ERROR_CODES.HTTP);
    assert.match(err.message, /i\/o timeout/, 'the go2rtc reason is kept for the logs');
    return true;
  });

  fake.state.frames.set('garden', Buffer.from('<html>not an image</html>'));
  await assert.rejects(client.frame('garden'), { code: ERROR_CODES.INVALID_IMAGE });
});

test('credentials written in the URL are sent as Basic auth', async () => {
  const fake = await fakeServer({ auth: { username: 'u', password: 'p' } });
  const client = createGo2rtcClient({ go2rtc_url: fake.url.replace('http://', 'http://u:p@') });
  assert.deepEqual(await client.streamNames(), ['entrance', 'garden']);
});

test('the live view link exists only for an https address', () => {
  const config = normalizeConfig({ go2rtc_url: 'http://10.0.0.2:1984' });
  assert.equal(liveViewUrl(config, 'garden'), null);
  assert.equal(
    liveViewUrl({ ...config, live_view_url: 'https://cams.example.com/' }, 'front door'),
    'https://cams.example.com/stream.html?src=front+door&mode=webrtc',
  );
  assert.equal(
    liveViewUrl(normalizeConfig({ go2rtc_url: 'https://go2rtc.lan' }), 'garden'),
    'https://go2rtc.lan/stream.html?src=garden&mode=webrtc',
  );
});

// --- snapshot -----------------------------------------------------------------

test('the widths tried go down by about 30 %, three at most', () => {
  assert.deepEqual(widthsToTry(640), [640, 448, 320]);
  assert.deepEqual(widthsToTry(160), [160]);
});

test('a too heavy image is asked again, narrower, until it fits under 150 KB', async () => {
  const fake = await fakeServer();
  // 200 KB at 640 px, 100 KB below: the second try fits.
  fake.state.frames.set('garden', (width) => jpegOfSize(width >= 640 ? 200_000 : 100_000));
  const client = createGo2rtcClient({ go2rtc_url: fake.url });
  const shot = await takeSnapshot(client, 'garden', 640);
  assert.equal(shot.width, 448);
  assert.ok(shot.image.length <= MAX_IMAGE_STRING_LENGTH);
  assert.deepEqual(
    fake.frameRequests().map((r) => r.query.width),
    ['640', '448'],
  );
});

test('an image that never fits is an explicit error', async () => {
  const fake = await fakeServer();
  fake.state.frames.set('garden', () => jpegOfSize(300_000));
  const client = createGo2rtcClient({ go2rtc_url: fake.url });
  await assert.rejects(takeSnapshot(client, 'garden', 640), { code: ERROR_CODES.TOO_LARGE });
});

// --- cameras ------------------------------------------------------------------

test('camera ids come from the stream name, encoded, and are stable', () => {
  const gladys = createFakeGladys();
  assert.equal(cameraIds(gladys, 'garden').device, 'ext:test-integration:camera:garden');
  assert.equal(
    cameraIds(gladys, 'front:door 2').device,
    'ext:test-integration:camera:front%3Adoor%202',
    'no colon from the name, so the feature separator stays unambiguous',
  );
});

test('every feature carries name, min, max, read_only and has_feedback', () => {
  const device = buildCameraDevice(createFakeGladys(), 'garden');
  for (const feature of device.features) {
    for (const key of ['name', 'min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[key], undefined, `feature ${feature.external_id} misses ${key}`);
    }
  }
  assert.deepEqual(device.params, [{ name: 'GO2RTC_STREAM', value: 'garden' }]);
});

test('the stream name of a Gladys device: from its param, else from its external id', () => {
  const gladys = createFakeGladys();
  assert.equal(streamNameOf(gladys, buildCameraDevice(gladys, 'a:b')), 'a:b');
  assert.equal(streamNameOf(gladys, { external_id: cameraIds(gladys, 'a:b').device }), 'a:b');
  assert.equal(streamNameOf(gladys, { external_id: 'ext:other:switch:1' }), null);
});

test('a camera turns offline after OFFLINE_AFTER_FAILURES failures, at once when immediate', () => {
  const registry = createCameraRegistry(createFakeGladys());
  registry.setStreams(['a', 'b']);
  const a = registry.byName('a');
  const error = { code: 'http_error' };
  for (let i = 1; i < OFFLINE_AFTER_FAILURES; i += 1) {
    assert.equal(registry.markFailure(a, error).changed, false);
  }
  assert.deepEqual(registry.markFailure(a, error), { changed: true, wasOnline: false });
  assert.equal(registry.markOnline(a).wasOffline, true);

  const b = registry.byName('b');
  registry.markOnline(b);
  assert.deepEqual(registry.markFailure(b, error, { immediate: true }), {
    changed: true,
    wasOnline: true,
  });
});

test('every snapshot gets a new widget image key, and an old key still serves the latest image', () => {
  const registry = createCameraRegistry(createFakeGladys());
  registry.setStreams(['a']);
  const camera = registry.byName('a');
  const first = registry.storeImage(camera, { jpeg: Buffer.from('one'), width: 640 });
  const second = registry.storeImage(camera, { jpeg: Buffer.from('two'), width: 640 });
  assert.notEqual(first, second);
  for (const key of [first, second]) {
    assert.match(key, /^[a-z0-9][a-z0-9-]{0,63}$/);
    assert.equal(registry.imageByKey(key), Buffer.from('two').toString('base64'));
  }
  assert.equal(registry.imageByKey('snap-0000000000-1'), null);

  assert.equal(registry.setStreams([]), true);
  assert.equal(registry.imageByKey(second), null, 'a removed camera serves nothing');
});
