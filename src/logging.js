// -----------------------------------------------------------------------------
// The log level, switchable from the Configuration screen.
//
// The SDK logger re-reads `process.env.LOG_LEVEL` on every line, so writing
// that variable is enough: it takes effect at once, for every logger already
// created, the SDK's own included. No restart.
//
// A `LOG_LEVEL` set on the container by the operator is the baseline: the
// switch raises the level to debug while it is on, and puts that value back
// (not `info`) when it goes off.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'logging' });

/** `LOG_LEVEL` as the container was started with, read once. */
const BASELINE = process.env.LOG_LEVEL;

/**
 * Apply the log level a configuration asks for.
 * @param {{ debug_logs?: boolean }} config normalized configuration
 * @returns {string} the level in force afterwards
 */
export function applyLogLevel(config) {
  const wanted = config?.debug_logs ? 'debug' : BASELINE;
  const current = process.env.LOG_LEVEL;
  if (wanted === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = wanted;
  }
  if (current !== process.env.LOG_LEVEL) {
    // Said at info, so the line survives the level it announces.
    logger.info(
      config?.debug_logs
        ? 'Detailed logs turned on'
        : `Detailed logs turned off (level: ${process.env.LOG_LEVEL ?? 'info'})`,
    );
  }
  return process.env.LOG_LEVEL ?? 'info';
}
