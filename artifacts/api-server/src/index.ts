import app from "./app";
import { config } from "./config";
import { logger } from "./lib/logger";
import { startMarketRefresh, stopMarketRefresh } from "./services/market-cache";

startMarketRefresh();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "Server listening");
});

server.on("error", (error) => {
  logger.error({ err: error }, "Error listening on port");
  process.exit(1);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down API server");
  stopMarketRefresh();
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "Error while closing API server");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
