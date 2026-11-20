// -----------------------------------------------------------------------------
// The running integration: configuration, go2rtc client, cameras, refresh
// loop, scene events. index.js only wires this to the SDK handlers.
//
// The refresh loop, every `refresh_interval` seconds (every 5 minutes when it
// is 0):
//   1. read the stream list of go2rtc → new cameras are published to Gladys;
//   2. take a snapshot of every camera and send it to Gladys (skipped when
//      `refresh_interval` is 0): this is also the availability test;
//   3. on a change, update the transport badge of the camera and fire the
//      camera_offline / camera_online scene triggers;
//   4. nudge the dashboard widgets.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, wantedStreams } from './config.js';
import { applyLogLevel } from './logging.js';
import { createCameraRegistry, streamNameOf } from './cameras.js';
import { createGo2rtcClient, ERROR_CODES, Go2rtcError, safeUrl } from './go2rtc/client.js';
import { takeSnapshot } from './go2rtc/snapshot.js';
import {
  connectionErrorMessage,
  connectionReport,
  snapshotReport,
  UNKNOWN_CAMERA,
} from './messages.js';

const logger = createLogger({ name: 'webrtc-camera' });

/** Scene trigger keys, as declared in the manifest `scene_triggers`. */
export const SCENE_TRIGGERS = {
  CAMERA_OFFLINE: 'camera_offline',
  CAMERA_ONLINE: 'camera_online',
};

/** Widget keys, as declared in the manifest `widgets`. */
export const WIDGET_KEYS = ['cameras', 'camera'];

/** Pace of the stream list check when the periodic snapshots are off. */
export const LIST_REFRESH_SECONDS = 300;

function toGo2rtcError(err) {
  if (err instanceof Go2rtcError) {
    return err;
  }
  return new Go2rtcError(ERROR_CODES.UNREACHABLE, err?.message ?? String(err), { cause: err });
}

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ fetch?: typeof fetch }} [options] fetch is injectable for the tests
 */
export function createService(gladys, { fetch } = {}) {
  let config = normalizeConfig();
  let client = createGo2rtcClient(config, { fetch });
  const registry = createCameraRegistry(gladys);
  const server = { reachable: null, version: null, error: null };
  let lastConnection = null;
  let cycle = null;
  let timer = null;
  // Badges changed during a refresh cycle, published once at its end.
  let pendingBadges = null;

  function filterNames(names) {
    const wanted = wantedStreams(config);
    return wanted ? names.filter((name) => wanted.has(name)) : names;
  }

  function refreshWidgets() {
    for (const key of WIDGET_KEYS) {
      gladys.requestWidgetRefresh(key);
    }
  }

  async function reportConnection() {
    const state = server.reachable ? 'ok' : (server.error?.code ?? ERROR_CODES.NOT_CONFIGURED);
    if (state === lastConnection) {
      return;
    }
    lastConnection = state;
    try {
      if (server.reachable) {
        await gladys.setConnectionStatus(true);
      } else {
        await gladys.setConnectionStatus(false, connectionErrorMessage(state));
      }
    } catch (err) {
      lastConnection = null;
      logger.warn(`Could not publish the connection status: ${err.message}`);
    }
  }

  async function publishTransports(cameras) {
    if (cameras.length === 0) {
      return;
    }
    try {
      await gladys.publishTransports(cameras.map((camera) => registry.transportEntry(camera)));
    } catch (err) {
      logger.warn(`Could not publish the transport badges: ${err.message}`);
    }
  }

  async function fireEvent(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Could not fire the scene trigger ${key}: ${err.message}`);
    }
  }

  /**
   * Publish what a change of availability means: the badge, and the scene
   * trigger unless `events` is false — a snapshot asked by a scene, a widget
   * or a configuration action never fires a trigger, so that a scene bound
   * to it cannot loop through the integration.
   */
  async function onTransition(camera, { online, offlineSeconds = 0 }, { events }) {
    if (pendingBadges) {
      pendingBadges.add(camera);
    } else {
      await publishTransports([camera]);
    }
    if (online) {
      logger.info(`Camera "${camera.name}" is back online`);
      if (events) {
        await fireEvent(SCENE_TRIGGERS.CAMERA_ONLINE, {
          device: camera.ids.device,
          device_name: camera.name,
          offline_seconds: offlineSeconds,
        });
      }
    } else {
      logger.warn(`Camera "${camera.name}" is offline: ${camera.lastError?.message}`);
      if (events) {
        await fireEvent(SCENE_TRIGGERS.CAMERA_OFFLINE, {
          device: camera.ids.device,
          device_name: camera.name,
          reason: camera.lastError?.code ?? ERROR_CODES.UNREACHABLE,
        });
      }
    }
  }

  async function markOnline(camera, { events }) {
    const result = registry.markOnline(camera);
    if (result.changed) {
      // From "not tested yet" to online: only the badge, no trigger.
      await onTransition(
        camera,
        { online: true, offlineSeconds: result.offlineSeconds },
        { events: events && result.wasOffline },
      );
    }
  }

  async function markFailure(camera, error, { events, immediate = false }) {
    const result = registry.markFailure(camera, error, { immediate });
    if (result.changed) {
      // A camera already down when the integration starts is shown offline,
      // but fires nothing: a trigger means a change, not a state.
      await onTransition(camera, { online: false }, { events: events && result.wasOnline });
    }
  }

  /**
   * Read the stream list and publish the cameras. When go2rtc does not
   * answer and no camera is known yet (restart), the cameras Gladys already
   * holds are kept, so they are still shown as unreachable.
   *
   * @returns {Promise<boolean>} true when the list changed
   */
  async function syncCameras({ forcePublish = false } = {}) {
    let names = null;
    try {
      names = filterNames(await client.streamNames());
      if (server.reachable !== true) {
        logger.info(`go2rtc reached at ${client.baseUrl}: ${names.length} camera(s)`);
      }
      server.reachable = true;
      server.error = null;
    } catch (err) {
      const error = toGo2rtcError(err);
      if (server.reachable !== false || server.error?.code !== error.code) {
        logger.warn(`go2rtc not reachable (${safeUrl(config.go2rtc_url)}): ${error.message}`);
      }
      server.reachable = false;
      server.error = error;
      if (registry.size === 0) {
        names = filterNames(
          (gladys.devices ?? []).map((device) => streamNameOf(gladys, device)).filter(Boolean),
        );
      }
    }

    const changed = names ? registry.setStreams(names) : false;
    if ((changed || forcePublish) && registry.size > 0) {
      try {
        await gladys.publishDiscoveredDevices(registry.devices());
      } catch (err) {
        logger.error(`Could not publish the cameras: ${err.message}`);
      }
    }
    await reportConnection();
    return changed;
  }

  /**
   * Take a snapshot of one camera and record the result.
   *
   * @param {object} camera from the registry
   * @param {{ publish?: boolean, events?: boolean }} [options] publish: send it
   *   to Gladys as the camera's new image
   * @returns {Promise<Awaited<ReturnType<typeof takeSnapshot>>>}
   */
  async function snapshot(camera, { publish = true, events = true } = {}) {
    let shot;
    try {
      shot = await takeSnapshot(client, camera.name, config.snapshot_width);
    } catch (err) {
      const error = toGo2rtcError(err);
      logger.debug(`Snapshot of "${camera.name}" failed: ${error.message}`);
      await markFailure(camera, error, {
        events,
        immediate: error.code === ERROR_CODES.UNREACHABLE,
      });
      throw error;
    }
    registry.storeImage(camera, shot);
    logger.debug(`Snapshot of "${camera.name}": ${shot.width} px, ${shot.bytes} bytes`);
    await markOnline(camera, { events });
    if (publish) {
      try {
        await gladys.publishCameraImage(camera.ids.device, shot.image);
      } catch (err) {
        // A Gladys-side problem: the camera itself answered.
        logger.warn(`Could not send the image of "${camera.name}" to Gladys: ${err.message}`);
      }
    }
    return shot;
  }

  /**
   * One refresh cycle (see the header). Concurrent calls share the cycle
   * already running.
   */
  function refresh({ forcePublish = false, snapshots, events = true } = {}) {
    if (cycle) {
      return cycle;
    }
    const withSnapshots = snapshots ?? config.refresh_interval > 0;
    pendingBadges = new Set();
    cycle = (async () => {
      await syncCameras({ forcePublish });
      const cameras = registry.list();
      if (!server.reachable) {
        for (const camera of cameras) {
          await markFailure(
            camera,
            new Go2rtcError(
              ERROR_CODES.SERVER_UNREACHABLE,
              server.error?.message ?? 'go2rtc unreachable',
            ),
            {
              events,
              immediate: true,
            },
          );
        }
      } else if (withSnapshots) {
        // One camera at a time: go2rtc may have to decode every stream.
        for (const camera of cameras) {
          await snapshot(camera, { publish: true, events }).catch(() => {});
        }
      } else {
        // No snapshot to test the cameras: those that were down only because
        // go2rtc was are taken back as soon as it answers again.
        for (const camera of cameras) {
          if (camera.lastError?.code === ERROR_CODES.SERVER_UNREACHABLE) {
            await markOnline(camera, { events });
          }
        }
      }
      const badges = forcePublish ? cameras : [...pendingBadges];
      pendingBadges = null;
      await publishTransports(badges);
      refreshWidgets();
    })().finally(() => {
      cycle = null;
      pendingBadges = null;
    });
    return cycle;
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    const seconds = config.refresh_interval > 0 ? config.refresh_interval : LIST_REFRESH_SECONDS;
    timer = setInterval(() => {
      refresh().catch((err) => logger.error(`Refresh failed: ${err.message}`));
    }, seconds * 1000);
    timer.unref?.();
  }

  return {
    registry,
    server,

    get config() {
      return config;
    },

    /** Apply a (new) configuration. */
    configure(raw) {
      config = normalizeConfig(raw);
      client = createGo2rtcClient(config, { fetch });
      applyLogLevel(config);
      // A new address or new credentials: the status is published again.
      lastConnection = null;
      if (!client.configured) {
        logger.warn('No go2rtc address configured yet: fill it in the Configuration screen');
      }
    },

    refresh,
    start,
    stop,
    syncCameras,
    snapshot,
    refreshWidgets,

    /** The camera of a Gladys device external id, or null. */
    cameraOf(externalId) {
      return registry.byExternalId(externalId);
    },

    /**
     * Fresh image for Gladys (dashboard live view, chat intent). The image is
     * returned to Gladys by the SDK: it is not published a second time.
     */
    async getImage(externalId) {
      const camera = registry.byExternalId(externalId);
      if (!camera) {
        throw new Error(`Unknown camera ${externalId}`);
      }
      const shot = await snapshot(camera, { publish: false });
      refreshWidgets();
      return shot.image;
    },

    /** Handler of the "Test the connection" action. */
    async testConnection() {
      let version = null;
      let names = [];
      let error = null;
      try {
        const info = await client.info();
        version = typeof info?.version === 'string' ? info.version : null;
        server.version = version;
        names = filterNames(await client.streamNames());
      } catch (err) {
        error = toGo2rtcError(err);
      }
      // New cameras show up at once, without waiting for the next cycle.
      await refresh({ forcePublish: true, snapshots: false, events: false }).catch(() => {});
      return connectionReport({
        version,
        names,
        error,
        baseUrl: client.baseUrl || safeUrl(config.go2rtc_url),
      });
    },

    /** Handler of the "Test a snapshot" action. */
    async testSnapshot(externalId) {
      const camera = registry.byExternalId(externalId);
      if (!camera) {
        return UNKNOWN_CAMERA;
      }
      const started = Date.now();
      try {
        const shot = await snapshot(camera, { publish: true, events: false });
        refreshWidgets();
        return snapshotReport({ name: camera.name, snapshot: shot, ms: Date.now() - started });
      } catch (err) {
        return snapshotReport({ name: camera.name, error: toGo2rtcError(err) });
      }
    },
  };
}
