// -----------------------------------------------------------------------------
// Consistency between `gladys-assistant-integration.json` and the code. The
// store indexer validates the manifest, but only these tests know which
// handlers the code registers and which keys it fires.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { ACTIONS } from '../src/integration.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import { WIDGETS } from '../src/capabilities/widgets.js';
import { SCENE_TRIGGERS, WIDGET_KEYS } from '../src/service.js';
import { LANGUAGES } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Every form field the manifest declares (same grammar everywhere).
const allFields = [
  ...manifest.config_schema,
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// Every multi-language text of the manifest, with its path.
function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      yield* texts(item, `${path}[${index}]`);
    }
    return;
  }
  if (!node || typeof node !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (['label', 'description', 'placeholder'].includes(key) && typeof value === 'object') {
      yield [`${path}.${key}`, value];
    } else {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every text of the manifest exists in English, French, German and Spanish', () => {
  let count = 0;
  for (const [path, value] of texts(manifest)) {
    count += 1;
    for (const language of LANGUAGES) {
      assert.equal(typeof value[language], 'string', `${path}.${language} is missing`);
      assert.ok(value[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
  assert.ok(count > 50);
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const language of LANGUAGES) {
    const text = manifest.description[language];
    assert.ok(text.length >= 10 && text.length <= 100, `description.${language}: ${text.length}`);
  }
});

test('the integration is local only', () => {
  // go2rtc runs on the user's network: no cloud channel, so no "prefer local"
  // toggle either (it only shows when both are declared).
  assert.deepEqual(manifest.transports, ['local']);
});

test('keywords and countries follow the store rules, and require Gladys >= 5.3.0', () => {
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10);
  const normalized = manifest.keywords.map((k) => k.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'keywords are unique');
  for (const keyword of manifest.keywords) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }

  assert.ok(manifest.countries.length >= 1 && manifest.countries.length <= 20);
  assert.equal(new Set(manifest.countries).size, manifest.countries.length, 'countries are unique');
  for (const country of manifest.countries) {
    assert.match(country, /^[A-Z]{2}$/, `country "${country}" is an ISO 3166-1 alpha-2 code`);
  }
  assert.ok(isAtLeast(minGladysVersion(), [5, 3, 0]), manifest.gladys_version);
});

test('categories come from the store vocabulary', () => {
  const vocabulary = [
    'climate',
    'lighting',
    'energy',
    'security',
    'multimedia',
    'appliances',
    'environment',
    'protocols',
    'network',
    'notifications',
    'assistants',
    'services',
    'transport',
    'vehicles',
    'servers',
    'leisure',
  ];
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(vocabulary.includes(category), `unknown category "${category}"`);
  }
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
});

test('every scene action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widget has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  assert.deepEqual([...WIDGET_KEYS].sort(), Object.keys(WIDGETS).sort());
});

test('every scene trigger the code fires is declared, and every declared one is fired', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(SCENE_TRIGGERS).sort());
});

test('config_schema defaults match DEFAULT_CONFIG, and every value field has a default there', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.ok(!(field.key in DEFAULT_CONFIG), `section "${field.key}" stores no value`);
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `"${field.key}" is missing from DEFAULT_CONFIG`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of "${field.key}"`);
    }
  }
});

test('fields: known types, snake_case keys, dynamic selects without options', () => {
  const types = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'section'];
  for (const field of allFields) {
    assert.ok(types.includes(field.type), `field "${field.key}": type "${field.type}"`);
    assert.match(field.key, /^[a-z0-9_]+$/);
    if (field.source !== undefined) {
      assert.equal(field.source, 'devices');
      assert.equal(field.options, undefined, `field "${field.key}": source and options`);
    }
    if (field.placeholder !== undefined) {
      assert.ok(['string', 'number', 'secret'].includes(field.type));
    }
    if (field.min !== undefined || field.max !== undefined) {
      assert.equal(field.type, 'number', `field "${field.key}": min/max are number-only`);
    }
  }
  // The password is never shown back in the form.
  assert.equal(manifest.config_schema.find((f) => f.key === 'password').type, 'secret');
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-webrtccamera:${pkg.version}`);
});

test('the user documentation exists in the four languages', async () => {
  for (const language of LANGUAGES) {
    await access(new URL(`../docs/${language}.md`, import.meta.url));
  }
});
