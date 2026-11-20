// -----------------------------------------------------------------------------
// The cameras: one Gladys device per go2rtc stream.
//
// What this module remembers, per camera:
//   - whether it answers (online / offline), with the moment it changed;
//   - its last snapshot, served to the dashboard widgets by key.
//
// External ids are forever: they are built from the go2rtc stream NAME (the
// only stable id go2rtc gives), never from a label. Renaming a stream in
// go2rtc creates a new camera in Gladys.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'camera';
export const IMAGE_FEATURE = 'image';
/** Device param holding the go2rtc stream name, to find it back. */
export const STREAM_PARAM = 'GO2RTC_STREAM';

// One failed snapshot is often a hiccup (key frame not yet received, camera
// busy): a camera is only declared offline after this many failures in a row.
export const OFFLINE_AFTER_FAILURES = 2;

/**
 * The Gladys ids of a camera. A stream name may hold any character, a colon
 * included, which would mix with the `device:feature` separator: it is
 * URI-encoded, which keeps it stable and readable.
 *
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {string} name stream name
 */
export function cameraIds(gladys, name) {
  return gladys.externalIds(DEVICE_TYPE, encodeURIComponent(name));
}

/**
 * The discovery payload of one camera.
 */
export function buildCameraDevice(gladys, name) {
  const ids = cameraIds(gladys, name);
  return {
    name,
    external_id: ids.device,
    params: [{ name: STREAM_PARAM, value: name }],
    features: [
      {
        name: 'Image',
        external_id: ids.feature(IMAGE_FEATURE),
        category: DEVICE_FEATURE_CATEGORIES.CAMERA,
        type: DEVICE_FEATURE_TYPES.CAMERA.IMAGE,
        // No range for an image, but Gladys stores min/max as NOT NULL.
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
    ],
  };
}

/**
 * The stream name of a Gladys device of this integration: its param first,
 * the external id otherwise (devices created before the param existed).
 */
export function streamNameOf(gladys, device) {
  const param = device?.params?.find((p) => p.name === STREAM_PARAM);
  if (param?.value) {
    return String(param.value);
  }
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (typeof device?.external_id === 'string' && device.external_id.startsWith(prefix)) {
    try {
      return decodeURIComponent(device.external_id.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

function shortHash(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 10);
}

export function createCameraRegistry(gladys) {
  /** @type {Map<string, any>} stream name → camera */
  const cameras = new Map();
  /** @type {Map<string, string>} image key → stream name */
  const imageKeys = new Map();
  let sequence = 0;

  function create(name) {
    const ids = cameraIds(gladys, name);
    return {
      name,
      ids,
      hash: shortHash(name),
      online: null, // null: not tested yet
      since: null,
      failures: 0,
      lastError: null,
      image: null, // { jpeg, key, at, width }
    };
  }

  return {
    /**
     * Replace the list of cameras. Known cameras keep their state.
     * @param {string[]} names
     * @returns {boolean} true when the list changed
     */
    setStreams(names) {
      const wanted = new Set(names);
      let changed = false;
      for (const name of [...cameras.keys()]) {
        if (!wanted.has(name)) {
          const camera = cameras.get(name);
          if (camera.image) {
            imageKeys.delete(camera.image.key);
          }
          cameras.delete(name);
          changed = true;
        }
      }
      for (const name of names) {
        if (!cameras.has(name)) {
          cameras.set(name, create(name));
          changed = true;
        }
      }
      return changed;
    },

    list() {
      return [...cameras.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    get size() {
      return cameras.size;
    },

    byName(name) {
      return cameras.get(name) ?? null;
    },

    byExternalId(externalId) {
      return [...cameras.values()].find((camera) => camera.ids.device === externalId) ?? null;
    },

    devices() {
      return this.list().map((camera) => buildCameraDevice(gladys, camera.name));
    },

    /**
     * Keep the last snapshot of a camera, under a NEW image key: the Gladys
     * core caches a widget image one hour by key.
     */
    storeImage(camera, { jpeg, width }, at = new Date()) {
      if (camera.image) {
        imageKeys.delete(camera.image.key);
      }
      sequence += 1;
      const key = `snap-${camera.hash}-${sequence.toString(36)}`;
      camera.image = { jpeg, key, at, width };
      imageKeys.set(key, camera.name);
      return key;
    },

    /**
     * Raw base64 of a widget image key. An outdated key of a known camera
     * still gets that camera's latest image rather than an error.
     */
    imageByKey(key) {
      let name = imageKeys.get(key);
      if (!name) {
        const match = /^snap-([0-9a-f]{10})-/.exec(key);
        name = match && [...cameras.values()].find((c) => c.hash === match[1])?.name;
      }
      const image = name ? cameras.get(name)?.image : null;
      return image ? image.jpeg.toString('base64') : null;
    },

    /**
     * Record a successful snapshot or contact.
     * @returns {{ changed: boolean, wasOffline: boolean, offlineSeconds: number }}
     */
    markOnline(camera, at = new Date()) {
      const wasOffline = camera.online === false;
      const offlineSeconds =
        wasOffline && camera.since ? Math.round((at - camera.since) / 1000) : 0;
      const changed = camera.online !== true;
      camera.failures = 0;
      camera.lastError = null;
      if (changed) {
        camera.online = true;
        camera.since = at;
      }
      return { changed, wasOffline, offlineSeconds };
    },

    /**
     * Record a failure. The camera turns offline after OFFLINE_AFTER_FAILURES
     * failures in a row, at once when `immediate` (go2rtc itself is down).
     * @returns {{ changed: boolean, wasOnline: boolean }}
     */
    markFailure(camera, error, { immediate = false, at = new Date() } = {}) {
      camera.failures += 1;
      camera.lastError = error;
      if (camera.online === false) {
        return { changed: false, wasOnline: false };
      }
      if (!immediate && camera.failures < OFFLINE_AFTER_FAILURES) {
        return { changed: false, wasOnline: false };
      }
      const wasOnline = camera.online === true;
      camera.online = false;
      camera.since = at;
      return { changed: true, wasOnline };
    },

    /** The transport badge of a camera, for publishTransports. */
    transportEntry(camera) {
      return {
        external_id: camera.ids.device,
        transport:
          camera.online === false ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL,
      };
    },
  };
}
