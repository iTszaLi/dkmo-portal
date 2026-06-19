import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createSessionMiddleware } from "./lib/session";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);

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

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

app.use(createSessionMiddleware());

app.use("/api", router);

// Convert body-parser and other errors into JSON so clients never receive an
// HTML error page (which surfaces as an unhelpful runtime overlay in the SPA).
app.use(
  (
    err: Error & { type?: string; status?: number },
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    if (err?.type === "entity.too.large") {
      res.status(413).json({
        error:
          "The uploaded photo is too large. Please choose a smaller image (under 5MB) and try again.",
      });
      return;
    }
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid request format. Please try again." });
      return;
    }
    req.log?.error({ err }, "Unhandled request error");
    res.status(err?.status ?? 500).json({
      error: "Something went wrong on our end. Please try again.",
    });
  },
);

export default app;
