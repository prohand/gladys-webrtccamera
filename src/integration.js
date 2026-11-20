// -----------------------------------------------------------------------------
// SDK wiring: every Gladys handler, registered BEFORE connect().
//
// Kept apart from index.js so the tests can run the exact same wiring on the
// SDK's fake Gladys (`@gladysassistant/integration-sdk/testing`).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { createService } from './service.js';
import { SCENE_ACTIONS } from './capabilities/scenes.js';
import { WIDGETS } from './capabilities/widgets.js';

const logger = createLogger({ name: 'webrtc-camera' });

/** Configuration-screen actions, keyed like the manifest `actions`. */
export const ACTIONS = {
  test_connection: (service) => service.testConnection(),
  test_snapshot: (service, fields) => service.testSnapshot(fields.device),
};

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ fetch?: typeof fetch }} [options]
 * @returns {ReturnType<typeof createService>}
 */
export function registerHandlers(gladys, options = {}) {
  const service = createService(gladys, options);

  // --- Discovery: the user opens "Discover" in Gladys ---------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> reading the go2rtc cameras');
    await service.syncCameras({ forcePublish: true });
  });

  // --- Camera: Gladys needs a FRESH image (dashboard, chat) ---------------
  // Acked under 15 s; the image is ≤ 150 KB (see src/go2rtc/snapshot.js).
  gladys.onGetImage(async (device) => {
    logger.debug(`onGetImage <- ${device.external_id}`);
    return service.getImage(device.external_id);
  });

  // --- Configuration-screen actions ---------------------------------------
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields = {}) => handler(service, fields));
  }

  // --- Scene actions -------------------------------------------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields = {}) => handler(service, { fields }));
  }

  // --- Dashboard widgets ---------------------------------------------------
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request = {}) => widget.get(service, request));
    gladys.onWidgetAction(key, (actionKey, params, context = {}) =>
      widget.action(service, { actionKey, params, settings: context.settings }),
    );
  }
  gladys.onWidgetGetImage(async (imageKey) => {
    const base64 = service.registry.imageByKey(imageKey);
    if (!base64) {
      throw new Error(`Unknown image ${imageKey}`);
    }
    return base64;
  });

  // --- Configuration updated by the user ----------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('Configuration updated');
    service.configure(newConfig);
    service.start();
    await service.refresh({ forcePublish: true }).catch((err) => {
      logger.error(`Refresh after the configuration update failed: ${err.message}`);
    });
  });

  // --- Connection lifecycle -----------------------------------------------
  gladys.on('connected', async () => {
    try {
      service.configure(await gladys.getConfig());
      await service.refresh({ forcePublish: true });
      service.start();
    } catch (err) {
      logger.error(`Initialization after connection failed: ${err.message}`);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
          de: 'Initialisierung fehlgeschlagen, bitte die Protokolle der Integration prüfen.',
          es: 'La inicialización falló, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    service.stop();
  });

  return service;
}
