// -----------------------------------------------------------------------------
// One snapshot that Gladys accepts.
//
// Gladys refuses a camera image over 150 KB, measured on the whole
// `image/jpg;base64,...` string (about 112 KB of JPEG once in base64). There
// is no image library in the container: the size is controlled by asking
// go2rtc for a narrower frame, which it resizes itself, until it fits.
// -----------------------------------------------------------------------------

import { ERROR_CODES, Go2rtcError } from './client.js';

/** The Gladys bound, on the full data string. */
export const MAX_IMAGE_STRING_LENGTH = 150 * 1024;

const PREFIX = 'image/jpg;base64,';

// Never go below this width: a smaller image says nothing anymore.
const SMALLEST_WIDTH = 160;

// Three tries at most: the Gladys ack of a fresh image waits 15 s, and every
// frame can take a few seconds when go2rtc has to open the camera.
const MAX_ATTEMPTS = 3;

/**
 * The `image/jpg;base64,...` string Gladys expects.
 * @param {Buffer} jpeg
 * @returns {string}
 */
export function toImageString(jpeg) {
  return `${PREFIX}${jpeg.toString('base64')}`;
}

/**
 * The widths to try, widest first, each about 30 % narrower than the last.
 * @param {number} width the configured width
 * @returns {number[]}
 */
export function widthsToTry(width) {
  const widths = [width];
  while (widths.length < MAX_ATTEMPTS) {
    const next = Math.max(SMALLEST_WIDTH, Math.round((widths.at(-1) * 0.7) / 16) * 16);
    if (next >= widths.at(-1)) {
      break;
    }
    widths.push(next);
  }
  return widths;
}

/**
 * Take a snapshot of a stream, narrow enough for Gladys.
 *
 * @param {ReturnType<import('./client.js').createGo2rtcClient>} client
 * @param {string} name stream name
 * @param {number} width the configured width
 * @returns {Promise<{ jpeg: Buffer, image: string, width: number, bytes: number }>}
 */
export async function takeSnapshot(client, name, width) {
  let bytes = 0;
  for (const tryWidth of widthsToTry(width)) {
    const jpeg = await client.frame(name, { width: tryWidth });
    const image = toImageString(jpeg);
    if (image.length <= MAX_IMAGE_STRING_LENGTH) {
      return { jpeg, image, width: tryWidth, bytes: jpeg.length };
    }
    bytes = jpeg.length;
  }
  throw new Go2rtcError(
    ERROR_CODES.TOO_LARGE,
    `The snapshot of "${name}" stays over 150 KB (${Math.round(bytes / 1024)} KB of JPEG): lower the snapshot width`,
  );
}
