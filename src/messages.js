// -----------------------------------------------------------------------------
// User-facing texts: connection status, action answers, widget toasts.
//
// Every one of them is a `{ en, fr, de, es }` object (see src/i18n.js):
// Gladys shows the reader's language and falls back to English.
// -----------------------------------------------------------------------------

import { ERROR_CODES } from './go2rtc/client.js';
import { localize, pick } from './i18n.js';

const REASONS = {
  [ERROR_CODES.NOT_CONFIGURED]: {
    en: 'no go2rtc address is configured',
    fr: "aucune adresse go2rtc n'est configurée",
    de: 'keine go2rtc-Adresse konfiguriert',
    es: 'no hay ninguna dirección de go2rtc configurada',
  },
  [ERROR_CODES.INVALID_URL]: {
    en: 'the go2rtc address is not valid',
    fr: "l'adresse go2rtc n'est pas valide",
    de: 'die go2rtc-Adresse ist ungültig',
    es: 'la dirección de go2rtc no es válida',
  },
  [ERROR_CODES.UNREACHABLE]: {
    en: 'go2rtc cannot be reached',
    fr: 'go2rtc est injoignable',
    de: 'go2rtc ist nicht erreichbar',
    es: 'no se puede contactar con go2rtc',
  },
  [ERROR_CODES.SERVER_UNREACHABLE]: {
    en: 'go2rtc cannot be reached',
    fr: 'go2rtc est injoignable',
    de: 'go2rtc ist nicht erreichbar',
    es: 'no se puede contactar con go2rtc',
  },
  [ERROR_CODES.TIMEOUT]: {
    en: 'go2rtc did not answer in time',
    fr: "go2rtc n'a pas répondu à temps",
    de: 'go2rtc hat nicht rechtzeitig geantwortet',
    es: 'go2rtc no respondió a tiempo',
  },
  [ERROR_CODES.AUTH]: {
    en: 'go2rtc refused the user name or password',
    fr: "go2rtc a refusé l'identifiant ou le mot de passe",
    de: 'go2rtc hat Benutzername oder Passwort abgelehnt',
    es: 'go2rtc rechazó el usuario o la contraseña',
  },
  [ERROR_CODES.NOT_FOUND]: {
    en: 'this address is not a go2rtc API (or the camera is unknown)',
    fr: "cette adresse n'est pas une API go2rtc (ou la caméra est inconnue)",
    de: 'diese Adresse ist keine go2rtc-API (oder die Kamera ist unbekannt)',
    es: 'esta dirección no es una API de go2rtc (o la cámara es desconocida)',
  },
  [ERROR_CODES.HTTP]: {
    en: 'go2rtc could not read the camera',
    fr: "go2rtc n'a pas pu lire la caméra",
    de: 'go2rtc konnte die Kamera nicht lesen',
    es: 'go2rtc no pudo leer la cámara',
  },
  [ERROR_CODES.INVALID_IMAGE]: {
    en: 'go2rtc did not return an image',
    fr: "go2rtc n'a pas renvoyé d'image",
    de: 'go2rtc hat kein Bild geliefert',
    es: 'go2rtc no devolvió ninguna imagen',
  },
  [ERROR_CODES.TOO_LARGE]: {
    en: 'the image stays over 150 KB, lower the snapshot width',
    fr: "l'image dépasse 150 Ko, baissez la largeur des images",
    de: 'das Bild bleibt über 150 KB, Bildbreite verringern',
    es: 'la imagen supera 150 KB, reduzca el ancho de las imágenes',
  },
};

/**
 * Short reason of an error code, in one language.
 * @param {string} code ERROR_CODES value
 * @param {string} language
 */
export function reasonText(code, language) {
  return pick(language, REASONS[code] ?? REASONS[ERROR_CODES.UNREACHABLE]);
}

// Short forms (≤ 40 characters) for the widget status rows.
const SHORT_REASONS = {
  [ERROR_CODES.NOT_CONFIGURED]: {
    en: 'Not configured',
    fr: 'Non configuré',
    de: 'Nicht konfiguriert',
    es: 'No configurado',
  },
  [ERROR_CODES.INVALID_URL]: {
    en: 'Invalid address',
    fr: 'Adresse invalide',
    de: 'Ungültige Adresse',
    es: 'Dirección no válida',
  },
  [ERROR_CODES.UNREACHABLE]: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
  [ERROR_CODES.SERVER_UNREACHABLE]: {
    en: 'go2rtc unreachable',
    fr: 'go2rtc injoignable',
    de: 'go2rtc nicht erreichbar',
    es: 'go2rtc inaccesible',
  },
  [ERROR_CODES.TIMEOUT]: {
    en: 'No answer',
    fr: 'Pas de réponse',
    de: 'Keine Antwort',
    es: 'Sin respuesta',
  },
  [ERROR_CODES.AUTH]: {
    en: 'Access refused',
    fr: 'Accès refusé',
    de: 'Zugriff verweigert',
    es: 'Acceso denegado',
  },
  [ERROR_CODES.NOT_FOUND]: {
    en: 'Not found',
    fr: 'Introuvable',
    de: 'Nicht gefunden',
    es: 'No encontrado',
  },
  [ERROR_CODES.HTTP]: {
    en: 'Camera error',
    fr: 'Erreur de la caméra',
    de: 'Kamerafehler',
    es: 'Error de la cámara',
  },
  [ERROR_CODES.INVALID_IMAGE]: {
    en: 'No image',
    fr: "Pas d'image",
    de: 'Kein Bild',
    es: 'Sin imagen',
  },
  [ERROR_CODES.TOO_LARGE]: {
    en: 'Image too large',
    fr: 'Image trop lourde',
    de: 'Bild zu groß',
    es: 'Imagen demasiado grande',
  },
};

/**
 * Very short reason of an error code, for the widgets.
 * @param {string} code ERROR_CODES value
 * @param {string} language
 */
export function shortReason(code, language) {
  return pick(language, SHORT_REASONS[code] ?? SHORT_REASONS[ERROR_CODES.UNREACHABLE]);
}

/** Message of the connection badge when go2rtc does not answer. */
export function connectionErrorMessage(code) {
  return localize((language) => {
    const reason = reasonText(code, language);
    return pick(language, {
      en: `Not connected: ${reason}.`,
      fr: `Non connecté : ${reason}.`,
      de: `Nicht verbunden: ${reason}.`,
      es: `No conectado: ${reason}.`,
    });
  });
}

/** Answer of "Test the connection". */
export function connectionReport({ version, names, error, baseUrl }) {
  if (error) {
    return localize((language) => {
      const reason = reasonText(error.code, language);
      const where = baseUrl ? ` (${baseUrl})` : '';
      return pick(language, {
        en: `Failure${where}: ${reason}.`,
        fr: `Échec${where} : ${reason}.`,
        de: `Fehlgeschlagen${where}: ${reason}.`,
        es: `Error${where}: ${reason}.`,
      });
    });
  }
  const list = names.slice(0, 20).join(', ') + (names.length > 20 ? ', …' : '');
  const v = version ? ` ${version}` : '';
  return localize((language) => {
    if (names.length === 0) {
      return pick(language, {
        en: `go2rtc${v} answers, but publishes no camera (or none matches the Cameras field).`,
        fr: `go2rtc${v} répond, mais ne publie aucune caméra (ou aucune ne correspond au champ Caméras).`,
        de: `go2rtc${v} antwortet, stellt aber keine Kamera bereit (oder keine passt zum Feld Kameras).`,
        es: `go2rtc${v} responde, pero no publica ninguna cámara (o ninguna coincide con el campo Cámaras).`,
      });
    }
    return pick(language, {
      en: `go2rtc${v} answers. ${names.length} camera(s): ${list}.`,
      fr: `go2rtc${v} répond. ${names.length} caméra(s) : ${list}.`,
      de: `go2rtc${v} antwortet. ${names.length} Kamera(s): ${list}.`,
      es: `go2rtc${v} responde. ${names.length} cámara(s): ${list}.`,
    });
  });
}

/** Answer of "Test a snapshot". */
export function snapshotReport({ name, snapshot, error, ms }) {
  if (error) {
    return localize((language) => {
      const reason = reasonText(error.code, language);
      return pick(language, {
        en: `No image from "${name}": ${reason}.`,
        fr: `Pas d'image de « ${name} » : ${reason}.`,
        de: `Kein Bild von „${name}“: ${reason}.`,
        es: `No hay imagen de «${name}»: ${reason}.`,
      });
    });
  }
  const kb = Math.round(snapshot.bytes / 1024);
  return localize((language) =>
    pick(language, {
      en: `Image of "${name}" received: ${snapshot.width} px wide, ${kb} KB, in ${ms} ms. It is now on the camera in Gladys.`,
      fr: `Image de « ${name} » reçue : ${snapshot.width} px de large, ${kb} Ko, en ${ms} ms. Elle est maintenant sur la caméra dans Gladys.`,
      de: `Bild von „${name}“ empfangen: ${snapshot.width} px breit, ${kb} KB, in ${ms} ms. Es ist jetzt an der Kamera in Gladys.`,
      es: `Imagen de «${name}» recibida: ${snapshot.width} px de ancho, ${kb} KB, en ${ms} ms. Ya está en la cámara en Gladys.`,
    }),
  );
}

export const UNKNOWN_CAMERA = {
  en: 'This camera is not (or no longer) published by go2rtc.',
  fr: "Cette caméra n'est pas (ou plus) publiée par go2rtc.",
  de: 'Diese Kamera wird von go2rtc nicht (mehr) bereitgestellt.',
  es: 'Esta cámara no está (o ya no está) publicada por go2rtc.',
};

export const TOAST_REFRESHED = {
  en: 'Images refreshed.',
  fr: 'Images actualisées.',
  de: 'Bilder aktualisiert.',
  es: 'Imágenes actualizadas.',
};

export function toastSnapshotFailed(code) {
  return localize((language) => {
    const reason = reasonText(code, language);
    return pick(language, {
      en: `No image: ${reason}.`,
      fr: `Pas d'image : ${reason}.`,
      de: `Kein Bild: ${reason}.`,
      es: `Sin imagen: ${reason}.`,
    });
  });
}

/**
 * "2 min ago", in one language, for the widgets.
 * @param {Date} at
 * @param {string} language
 * @param {Date} [now]
 */
export function ageText(at, language, now = new Date()) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  const lang = ['en', 'fr', 'de', 'es'].includes(language) ? language : 'en';
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
  if (seconds < 60) {
    return format.format(0, 'second');
  }
  if (seconds < 3600) {
    return format.format(-Math.round(seconds / 60), 'minute');
  }
  if (seconds < 86400) {
    return format.format(-Math.round(seconds / 3600), 'hour');
  }
  return format.format(-Math.round(seconds / 86400), 'day');
}
