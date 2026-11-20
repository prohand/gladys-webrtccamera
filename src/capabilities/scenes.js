// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+), keyed like the manifest `scene_actions`.
//
// The scene TRIGGERS (camera_offline, camera_online) are fired by the refresh
// loop, see src/service.js.
//
// Rules: the fields arrive resolved (a `"source": "devices"` field is the
// chosen device external_id); the handler resolves the declared outputs
// (scalars); a scene action is never a condition, so a failure is an output
// the scene author can test, not an exception; and nothing here fires a scene
// trigger (no loop through the integration).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTIONS = {
  /**
   * Take a fresh snapshot and send it to the camera in Gladys, so that the
   * core action "Send a camera image" that follows sends THIS image.
   */
  async take_snapshot(service, { fields }) {
    const camera = service.cameraOf(fields.device);
    if (!camera) {
      logger.warn(`take_snapshot: unknown camera ${fields.device}`);
      return { success: false, size_kb: 0 };
    }
    try {
      const shot = await service.snapshot(camera, { publish: true, events: false });
      service.refreshWidgets();
      return { success: true, size_kb: Math.round(shot.bytes / 1024) };
    } catch (err) {
      logger.warn(`take_snapshot on "${camera.name}" failed: ${err.message}`);
      return { success: false, size_kb: 0 };
    }
  },

  /** Read the go2rtc camera list again and publish the new cameras. */
  async refresh_cameras(service) {
    await service.refresh({ forcePublish: true, snapshots: false, events: false });
    const cameras = service.registry.list();
    return {
      cameras: cameras.length,
      online: cameras.filter((camera) => camera.online !== false).length,
    };
  },
};
