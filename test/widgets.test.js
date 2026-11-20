// -----------------------------------------------------------------------------
// Dashboard widgets: every content is rendered exactly as sent (nothing the
// core would drop or truncate), in every state, and every button works.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/integration.js';
import { cameraIds } from '../src/cameras.js';
import { WIDGET_KEYS } from '../src/service.js';
import { LANGUAGES } from '../src/i18n.js';
import { DEAD_URL, startFakeGo2rtc } from './helpers/fakeGo2rtc.js';

const cleanups = [];
afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()();
  }
});

async function setup(config = {}) {
  const fake = await startFakeGo2rtc();
  cleanups.push(() => fake.close());
  const gladys = createFakeGladys({ config: { go2rtc_url: fake.url, ...config } });
  const service = registerHandlers(gladys);
  cleanups.push(() => service.stop());
  await gladys.connect();
  return { fake, gladys, service };
}

async function contentOf(gladys, key, settings = {}, language = 'en') {
  const ack = await gladys.fake.widgetGet(key, { settings, language });
  assert.equal(ack.success, true, `widget ${key}: ${ack.error}`);
  return ack.data.content;
}

async function assertValidEverywhere(gladys, settings = {}) {
  for (const key of WIDGET_KEYS) {
    for (const language of LANGUAGES) {
      const content = await contentOf(gladys, key, settings, language);
      assert.deepEqual(validateWidgetContent(content), [], `widget ${key} (${language})`);
    }
  }
}

test('both widgets are valid with cameras online and a live view address', async () => {
  const { gladys } = await setup({ live_view_url: 'https://cams.example.com' });
  await assertValidEverywhere(gladys);
  await assertValidEverywhere(gladys, { camera: cameraIds(gladys, 'garden').device });

  const camera = await contentOf(gladys, 'camera');
  const link = camera.components.find((c) => c.type === 'button' && c.link);
  assert.match(
    link.link.url,
    /^https:\/\/cams\.example\.com\/stream\.html\?src=entrance&mode=webrtc$/,
  );
  const cameras = await contentOf(gladys, 'cameras');
  const grid = cameras.components.find((c) => c.type === 'card-list');
  assert.equal(grid.items.length, 2);
  assert.ok(grid.items.every((item) => item.image && item.links?.length === 1));
});

test('without an https address, no live view link is offered', async () => {
  const { gladys } = await setup();
  const camera = await contentOf(gladys, 'camera');
  assert.equal(
    camera.components.some((c) => c.link),
    false,
  );
});

test('both widgets are valid with go2rtc down, and with nothing configured', async () => {
  const { gladys, fake, service } = await setup();
  await fake.close();
  await service.refresh();
  await assertValidEverywhere(gladys);

  const empty = createFakeGladys({ config: { go2rtc_url: DEAD_URL } });
  const emptyService = registerHandlers(empty);
  cleanups.push(() => emptyService.stop());
  await empty.connect();
  await assertValidEverywhere(empty);
  await assertValidEverywhere(empty, { camera: 'ext:test-integration:camera:gone' });
});

test('the camera widget follows its setting', async () => {
  const { gladys } = await setup();
  const content = await contentOf(gladys, 'camera', {
    camera: cameraIds(gladys, 'garden').device,
  });
  assert.equal(content.components[0].text, 'garden');
});

test('every image key of a content is served, and is a valid widget image', async () => {
  const { gladys } = await setup();
  const keys = [];
  for (const key of WIDGET_KEYS) {
    const content = await contentOf(gladys, key);
    for (const component of content.components) {
      if (component.type === 'image') {
        keys.push(component.key);
      }
      for (const item of component.items ?? []) {
        if (item.image) {
          keys.push(item.image);
        }
      }
    }
  }
  assert.ok(keys.length >= 3);
  for (const key of keys) {
    const ack = await gladys.fake.widgetGetImage(key);
    assert.equal(ack.success, true, `image ${key}`);
    assert.deepEqual(validateWidgetImage(ack.data.image), [], `image ${key}`);
  }
  const unknown = await gladys.fake.widgetGetImage('snap-unknown-1');
  assert.equal(unknown.success, false);
});

test('every button action is handled and answers a short toast in every language', async () => {
  const { gladys } = await setup();
  for (const key of WIDGET_KEYS) {
    const content = await contentOf(gladys, key);
    const buttons = content.components.filter((c) => c.type === 'button' && c.action);
    assert.ok(buttons.length > 0, `widget ${key} has an action button`);
    for (const { action } of buttons) {
      const ack = await gladys.fake.widgetAction(key, action.key, action.params ?? {});
      assert.equal(ack.success, true, `${key}.${action.key}: ${ack.error}`);
      for (const language of LANGUAGES) {
        assert.ok(ack.data.message[language], `${key}.${action.key} toast in ${language}`);
        assert.ok(ack.data.message[language].length <= 200);
      }
    }
  }
});

test('a widget action never fires a scene trigger', async () => {
  const { gladys, fake } = await setup();
  fake.state.frames.set('entrance', 'fail');
  for (let i = 0; i < 3; i += 1) {
    await gladys.fake.widgetAction('cameras', 'refresh_all');
    await gladys.fake.widgetAction('camera', 'snapshot', {
      device: cameraIds(gladys, 'entrance').device,
    });
  }
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('an unknown widget action fails, so the user sees the error', async () => {
  const { gladys } = await setup();
  for (const key of WIDGET_KEYS) {
    const ack = await gladys.fake.widgetAction(key, 'unknown');
    assert.equal(ack.success, false);
  }
});

test('every refresh cycle nudges both widgets', async () => {
  const { gladys, service } = await setup();
  const before = gladys.fake.widgetRefreshes.length;
  await service.refresh();
  assert.deepEqual(gladys.fake.widgetRefreshes.slice(before), WIDGET_KEYS);
});
