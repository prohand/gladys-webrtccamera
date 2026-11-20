// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+), keyed like the manifest `widgets`.
//
//   - `cameras`: every camera as a poster (last image, online badge, live view
//     link), the go2rtc status, and a button to refresh all the images;
//   - `camera`: ONE camera chosen in the widget settings, its last image in
//     large, its status, a "New image" button and a "Live view" link.
//
// The images are served by the integration (onWidgetGetImage) under a key
// that changes with every snapshot: the core caches an image one hour by key.
// Links must be https: the "Live view" (go2rtc WebRTC player) only shows when
// an https address of go2rtc is known (see liveViewUrl).
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { liveViewUrl } from '../go2rtc/client.js';
import { localize, pick } from '../i18n.js';
import {
  ageText,
  shortReason,
  TOAST_REFRESHED,
  toastSnapshotFailed,
  UNKNOWN_CAMERA,
} from '../messages.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_ACTIONS = {
  REFRESH_ALL: 'refresh_all',
  SNAPSHOT: 'snapshot',
};

const T = {
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  unknown: { en: 'Not tested', fr: 'Non testée', de: 'Nicht getestet', es: 'Sin probar' },
  server: { en: 'go2rtc server', fr: 'Serveur go2rtc', de: 'go2rtc-Server', es: 'Servidor go2rtc' },
  connected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  cameras: {
    en: 'Cameras online',
    fr: 'Caméras en ligne',
    de: 'Kameras online',
    es: 'Cámaras en línea',
  },
  camera: { en: 'Camera', fr: 'Caméra', de: 'Kamera', es: 'Cámara' },
  lastImage: { en: 'Last image', fr: 'Dernière image', de: 'Letztes Bild', es: 'Última imagen' },
  noImage: { en: 'None yet', fr: 'Aucune', de: 'Noch keins', es: 'Ninguna' },
  refreshAll: { en: 'Refresh images', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  newImage: { en: 'New image', fr: 'Nouvelle image', de: 'Neues Bild', es: 'Nueva imagen' },
  liveView: { en: 'Live view', fr: 'Direct', de: 'Live-Ansicht', es: 'En directo' },
  liveViewLink: {
    en: 'Live view (WebRTC)',
    fr: 'Direct (WebRTC)',
    de: 'Live (WebRTC)',
    es: 'Directo (WebRTC)',
  },
  noCamera: {
    en: 'No camera yet. Fill in the go2rtc address in the integration configuration, then use "Test the connection".',
    fr: "Aucune caméra pour l'instant. Renseignez l'adresse go2rtc dans la configuration de l'intégration, puis utilisez « Tester la connexion ».",
    de: 'Noch keine Kamera. Trage die go2rtc-Adresse in der Konfiguration der Integration ein und nutze dann „Verbindung testen“.',
    es: 'Todavía no hay cámaras. Indique la dirección de go2rtc en la configuración de la integración y luego use «Probar la conexión».',
  },
  noImageYet: {
    en: 'No image yet: tap "New image".',
    fr: "Pas encore d'image : touchez « Nouvelle image ».",
    de: 'Noch kein Bild: tippe auf „Neues Bild“.',
    es: 'Aún no hay imagen: pulse «Nueva imagen».',
  },
};

function badgeOf(camera) {
  if (camera.online === true) {
    return { text: T.online, color: WIDGET_COLORS.SUCCESS };
  }
  if (camera.online === false) {
    return { text: T.offline, color: WIDGET_COLORS.DANGER };
  }
  return { text: T.unknown, color: WIDGET_COLORS.NEUTRAL };
}

function cameraStatus(camera) {
  const { text, color } = badgeOf(camera);
  if (camera.online === false && camera.lastError) {
    const code = camera.lastError.code;
    return {
      value: localize((language) => `${pick(language, text)}: ${shortReason(code, language)}`),
      color,
    };
  }
  return { value: text, color };
}

function imageAge(camera, now) {
  return camera.image ? localize((language) => ageText(camera.image.at, language, now)) : T.noImage;
}

function serverStatus(service) {
  const { server } = service;
  if (server.reachable) {
    return {
      label: T.server,
      icon: 'server',
      value: server.version
        ? localize((language) => `${pick(language, T.connected)} (${server.version})`)
        : T.connected,
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  const code = server.error?.code;
  return {
    label: T.server,
    icon: 'server',
    value: localize((language) => shortReason(code, language)),
    color: server.reachable === false ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
  };
}

export const WIDGETS = {
  cameras: {
    async get(service, { now = new Date() } = {}) {
      const cameras = service.registry.list();
      const components = [];
      if (cameras.length === 0) {
        components.push({ type: 'text', variant: 'body', text: T.noCamera });
      } else {
        components.push({
          type: 'card-list',
          display: 'grid',
          items: cameras.slice(0, 12).map((camera) => {
            const item = {
              title: camera.name,
              subtitle: imageAge(camera, now),
              badge: badgeOf(camera),
            };
            if (camera.image) {
              item.image = camera.image.key;
            }
            const url = liveViewUrl(service.config, camera.name);
            if (url) {
              item.links = [{ url, label: T.liveViewLink }];
            }
            return item;
          }),
        });
      }
      const online = cameras.filter((camera) => camera.online === true).length;
      components.push({
        type: 'status',
        items: [
          serverStatus(service),
          {
            label: T.cameras,
            icon: 'video',
            value: `${online} / ${cameras.length}`,
            color:
              cameras.length > 0 && online === cameras.length
                ? WIDGET_COLORS.SUCCESS
                : online === 0
                  ? WIDGET_COLORS.NEUTRAL
                  : WIDGET_COLORS.WARNING,
          },
        ],
      });
      if (cameras.length > 0) {
        components.push({
          type: 'button',
          label: T.refreshAll,
          icon: 'refresh-cw',
          style: 'secondary',
          action: { key: WIDGET_ACTIONS.REFRESH_ALL },
        });
      }
      // The images change with the refresh loop, which nudges the widget:
      // the TTL is only a safety net (and keeps the "2 min ago" fresh).
      return { ttl_seconds: 120, components };
    },

    async action(service, { actionKey }) {
      logger.info(`Widget cameras <- ${actionKey}`);
      if (actionKey !== WIDGET_ACTIONS.REFRESH_ALL) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      await service.refresh({ snapshots: true, events: false });
      return TOAST_REFRESHED;
    },
  },

  camera: {
    async get(service, { settings = {}, now = new Date() } = {}) {
      const cameras = service.registry.list();
      const camera = (settings.camera && service.cameraOf(settings.camera)) || cameras[0] || null;
      if (!camera) {
        return {
          ttl_seconds: 120,
          components: [
            {
              type: 'text',
              variant: 'body',
              text: settings.camera ? UNKNOWN_CAMERA : T.noCamera,
            },
          ],
        };
      }
      const components = [{ type: 'text', variant: 'heading', text: camera.name.slice(0, 40) }];
      if (camera.image) {
        components.push({ type: 'image', key: camera.image.key, alt: camera.name, fit: 'cover' });
      } else {
        components.push({ type: 'text', variant: 'caption', text: T.noImageYet });
      }
      components.push({
        type: 'status',
        items: [
          { label: T.camera, icon: 'video', ...cameraStatus(camera) },
          {
            label: T.lastImage,
            icon: 'clock',
            value: imageAge(camera, now),
            color: WIDGET_COLORS.NEUTRAL,
          },
        ],
      });
      components.push({
        type: 'button',
        label: T.newImage,
        icon: 'camera',
        style: 'primary',
        action: { key: WIDGET_ACTIONS.SNAPSHOT, params: { device: camera.ids.device } },
      });
      const url = liveViewUrl(service.config, camera.name);
      if (url) {
        components.push({
          type: 'button',
          label: T.liveView,
          icon: 'play-circle',
          style: 'secondary',
          link: { url },
        });
      }
      return { ttl_seconds: 120, components };
    },

    async action(service, { actionKey, params }) {
      logger.info(`Widget camera <- ${actionKey}`);
      if (actionKey !== WIDGET_ACTIONS.SNAPSHOT) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const camera = service.cameraOf(params?.device);
      if (!camera) {
        return UNKNOWN_CAMERA;
      }
      try {
        await service.snapshot(camera, { publish: true, events: false });
        return TOAST_REFRESHED;
      } catch (err) {
        return toastSnapshotFailed(err.code);
      }
    },
  },
};
