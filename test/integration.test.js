// -----------------------------------------------------------------------------
// The whole wiring (src/integration.js) on the SDK's fake Gladys, against a
// fake go2rtc on the loopback.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/integration.js';
import { cameraIds } from '../src/cameras.js';
import { SCENE_TRIGGERS } from '../src/service.js';
import { LANGUAGES } from '../src/i18n.js';
import { DEAD_URL, startFakeGo2rtc } from './helpers/fakeGo2rtc.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const cleanups = [];
afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()();
  }
});

async function setup({ config = {}, go2rtc = {}, devices } = {}) {
  const fake = await startFakeGo2rtc(go2rtc);
  cleanups.push(() => fake.close());
  const gladys = createFakeGladys({
    config: { go2rtc_url: fake.url, ...config },
    ...(devices ? { devices } : {}),
  });
  const service = registerHandlers(gladys);
  cleanups.push(() => service.stop());
  return { fake, gladys, service };
}

const deviceOf = (gladys, name) =>
  gladys.fake.discoveredDevices.find((d) => d.external_id === cameraIds(gladys, name).device);

const declared = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

test('on connection, every go2rtc stream is published as a camera, with its image and badge', async () => {
  const { gladys } = await setup();
  await gladys.connect();

  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['entrance', 'garden'],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.cameraImages.length, 2, 'one image per camera');
  assert.match(gladys.fake.cameraImages[0].image, /^image\/jpg;base64,\/9j\//);
  assert.deepEqual(
    gladys.fake.transports.map((t) => t.transport),
    ['local', 'local'],
  );
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first test of a camera fires nothing');
});

test('the Cameras field keeps only the named streams', async () => {
  const { gladys } = await setup({ config: { streams: 'garden, unknown' } });
  await gladys.connect();
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['garden'],
  );
});

test('refresh_interval 0: the cameras are listed, but no image is taken', async () => {
  const { gladys, fake } = await setup({ config: { refresh_interval: 0 } });
  await gladys.connect();
  assert.equal(gladys.fake.discoveredDevices.length, 2);
  assert.equal(fake.frameRequests().length, 0);
  assert.equal(gladys.fake.cameraImages.length, 0);
});

test('a camera is offline after two failures in a row, and fires camera_offline once', async () => {
  const { gladys, fake, service } = await setup();
  await gladys.connect();
  fake.state.frames.set('garden', 'fail');

  await service.refresh();
  assert.equal(gladys.fake.sceneEvents.length, 0, 'one failure is a hiccup');

  await service.refresh();
  await service.refresh();
  const offline = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.CAMERA_OFFLINE);
  assert.equal(offline.length, 1, 'one event per change, not per failure');
  assert.deepEqual(offline[0].data, {
    device: cameraIds(gladys, 'garden').device,
    device_name: 'garden',
    reason: 'http_error',
  });
  const badge = gladys.fake.transports.findLast(
    (t) => t.device_external_id === cameraIds(gladys, 'garden').device,
  );
  assert.equal(badge.transport, 'unreachable');

  fake.state.frames.delete('garden');
  await service.refresh();
  const online = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.CAMERA_ONLINE);
  assert.equal(online.length, 1);
  assert.equal(online[0].data.device_name, 'garden');
  assert.equal(typeof online[0].data.offline_seconds, 'number');
});

test('scene event data only carries keys the trigger declares, as primitives', async () => {
  const { gladys, fake, service } = await setup();
  await gladys.connect();
  fake.state.frames.set('garden', 'fail');
  await service.refresh();
  await service.refresh();
  fake.state.frames.delete('garden');
  await service.refresh();

  assert.equal(gladys.fake.sceneEvents.length, 2);
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = declared('scene_triggers', key);
    assert.ok(trigger, `trigger "${key}" is not declared`);
    const allowed = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(allowed.includes(name), `${key}.${name} is not declared, the core would drop it`);
      assert.ok(value === null || typeof value !== 'object', `${key}.${name} must be a primitive`);
    }
  }
});

test('go2rtc down: not connected, every camera offline at once, and back when it returns', async () => {
  const { gladys, fake, service } = await setup();
  await gladys.connect();

  const url = fake.url;
  await fake.close();
  await service.refresh();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  for (const language of LANGUAGES) {
    assert.ok(gladys.fake.connectionStatus.message[language], `status message in ${language}`);
  }
  const offline = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.CAMERA_OFFLINE);
  assert.equal(offline.length, 2, 'both cameras, without waiting for a second failure');
  assert.ok(offline.every((e) => e.data.reason === 'server_unreachable'));

  // Same address again (a fresh server on another port stands for it).
  const back = await startFakeGo2rtc();
  cleanups.push(() => back.close());
  assert.notEqual(back.url, url);
  service.configure({ go2rtc_url: back.url });
  await service.refresh();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const online = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.CAMERA_ONLINE);
  assert.equal(online.length, 2);
});

test('go2rtc down at startup: the cameras Gladys already holds are kept, shown unreachable', async () => {
  const known = createFakeGladys();
  const ids = cameraIds(known, 'garage');
  const gladys = createFakeGladys({
    config: { go2rtc_url: DEAD_URL },
    devices: [{ name: 'garage', external_id: ids.device, params: [], features: [] }],
  });
  const service = registerHandlers(gladys);
  cleanups.push(() => service.stop());
  await gladys.connect();

  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['garage'],
  );
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'down at start is a state, not a change');
});

test('no address configured: not connected, with a message saying so', async () => {
  const gladys = createFakeGladys({ config: {} });
  const service = registerHandlers(gladys);
  cleanups.push(() => service.stop());
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /no go2rtc address/);
  assert.match(gladys.fake.connectionStatus.message.fr, /aucune adresse go2rtc/);
});

test('Gladys asks for a fresh image: it is returned, not published a second time', async () => {
  const { gladys } = await setup({ config: { refresh_interval: 0 } });
  await gladys.connect();
  const ack = await gladys.fake.getImage(deviceOf(gladys, 'garden'));
  assert.equal(ack.success, true);
  assert.match(ack.data.image, /^image\/jpg;base64,/);
  assert.equal(gladys.fake.cameraImages.length, 0);
});

test('a fresh image of an unknown camera fails', async () => {
  const { gladys } = await setup();
  await gladys.connect();
  const ack = await gladys.fake.getImage({ external_id: 'ext:test-integration:camera:nope' });
  assert.equal(ack.success, false);
});

test('"Test the connection" names the go2rtc version and the cameras', async () => {
  const { gladys } = await setup();
  await gladys.connect();
  const ack = await gladys.fake.action('test_connection');
  assert.equal(ack.success, true);
  for (const language of LANGUAGES) {
    assert.match(ack.data.message[language], /1\.9\.9/);
    assert.match(ack.data.message[language], /entrance, garden/);
  }
});

test('"Test the connection" explains a refused password, without showing it', async () => {
  const { gladys } = await setup({
    config: { username: 'admin', password: 'wrong-pass' },
    go2rtc: { auth: { username: 'admin', password: 'right-pass' } },
  });
  await gladys.connect();
  const ack = await gladys.fake.action('test_connection');
  assert.match(ack.data.message.en, /refused the user name or password/);
  for (const language of LANGUAGES) {
    assert.doesNotMatch(ack.data.message[language], /wrong-pass/);
  }
});

test('the right credentials open the API', async () => {
  const { gladys } = await setup({
    config: { username: 'admin', password: 'right-pass' },
    go2rtc: { auth: { username: 'admin', password: 'right-pass' } },
  });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.cameraImages.length, 2);
});

test('"Test an image" reports the size and publishes the image', async () => {
  const { gladys } = await setup({ config: { refresh_interval: 0 } });
  await gladys.connect();
  const ack = await gladys.fake.action('test_snapshot', {
    device: cameraIds(gladys, 'garden').device,
  });
  assert.match(ack.data.message.en, /Image of "garden" received: 640 px wide/);
  assert.equal(gladys.fake.cameraImages.length, 1);
});

test('the scan request publishes the cameras again', async () => {
  const { gladys, fake } = await setup();
  await gladys.connect();
  fake.state.streams.push('porch');
  await gladys.fake.scanRequest();
  assert.ok(deviceOf(gladys, 'porch'));
});

test('a new go2rtc stream appears at the next refresh', async () => {
  const { gladys, fake, service } = await setup();
  await gladys.connect();
  const before = gladys.fake.discoveredDevices.length;
  fake.state.streams.push('porch');
  await service.refresh();
  assert.ok(gladys.fake.discoveredDevices.length > before);
  assert.ok(deviceOf(gladys, 'porch'));
});

test('take_snapshot publishes an image and returns the declared outputs, firing nothing', async () => {
  const { gladys, fake, service } = await setup({ config: { refresh_interval: 0 } });
  await gladys.connect();
  const ack = await gladys.fake.sceneAction('take_snapshot', {
    device: cameraIds(gladys, 'garden').device,
  });
  assert.deepEqual(ack.data.outputs, { success: true, size_kb: 0 });
  assert.equal(gladys.fake.cameraImages.length, 1);
  for (const key of Object.keys(ack.data.outputs)) {
    assert.ok(keysOf(declared('scene_actions', 'take_snapshot').outputs).includes(key));
  }

  // A failing camera is an output, never an exception, and fires no trigger.
  fake.state.frames.set('garden', 'fail');
  for (let i = 0; i < 3; i += 1) {
    const failed = await gladys.fake.sceneAction('take_snapshot', {
      device: cameraIds(gladys, 'garden').device,
    });
    assert.equal(failed.success, true);
    assert.deepEqual(failed.data.outputs, { success: false, size_kb: 0 });
  }
  assert.equal(service.cameraOf(cameraIds(gladys, 'garden').device).online, false);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'no trigger from a scene action');
});

test('refresh_cameras returns the declared outputs', async () => {
  const { gladys } = await setup();
  await gladys.connect();
  const ack = await gladys.fake.sceneAction('refresh_cameras');
  assert.deepEqual(ack.data.outputs, { cameras: 2, online: 2 });
  for (const key of Object.keys(ack.data.outputs)) {
    assert.ok(keysOf(declared('scene_actions', 'refresh_cameras').outputs).includes(key));
  }
});

test('a configuration update applies at once', async () => {
  const { gladys, fake } = await setup();
  await gladys.connect();
  await gladys.fake.configUpdated({
    go2rtc_url: fake.url,
    streams: 'entrance',
    snapshot_width: 320,
  });
  const last = fake.frameRequests().at(-1);
  assert.equal(last.query.src, 'entrance');
  assert.equal(last.query.width, '320');
});

test('the camera URLs (and their passwords) published by go2rtc never reach Gladys', async () => {
  const { gladys } = await setup();
  await gladys.connect();
  await gladys.fake.action('test_connection');
  const everything = JSON.stringify(gladys.fake.requests);
  assert.doesNotMatch(everything, /s3cret/);
  assert.doesNotMatch(everything, /rtsp:\/\//);
});
