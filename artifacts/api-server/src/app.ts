import express, { type ErrorRequestHandler, type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { config } from "./config";
import {
  corsMiddleware,
  publicApiRateLimit,
  securityHeaders,
} from "./middlewares/security";


const app: Express = express();

app.disable("x-powered-by");
if (config.trustProxyHops > 0) {
  app.set("trust proxy", config.trustProxyHops);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(securityHeaders);
app.use(corsMiddleware);
// Payment evidence is base64 encoded and strictly capped at 5 MB after the
// server validates its real file signature. Other JSON endpoints stay small.
app.use("/api/payment-requests", express.json({ limit: "8mb" }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use("/api", publicApiRateLimit, router);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
    res.status(413).json({ error: "El comprobante supera el tamaño permitido." });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "Invalid JSON request body." });
    return;
  }

  req.log.error({ err: error }, "Unhandled API error");
  res.status(500).json({ error: "Internal server error." });
};

app.use(errorHandler);

export default app;
