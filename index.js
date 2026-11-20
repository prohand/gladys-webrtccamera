// -----------------------------------------------------------------------------
// Entry point of the "WebRTC Camera" Gladys external integration.
//
// It only instantiates the SDK, registers the handlers (src/integration.js)
// and connects. The SDK reads the variables the Gladys supervisor gives the
// container (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN,
// GLADYS_INTEGRATION_SELECTOR) and handles the reconnection.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/integration.js';

const gladys = new GladysIntegration();
const service = registerHandlers(gladys);

// SIGTERM / SIGINT from the supervisor: stop the timers, the SDK disconnects
// cleanly and exits with code 0.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  service.stop();
});

logger.info('Starting the WebRTC Camera integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
