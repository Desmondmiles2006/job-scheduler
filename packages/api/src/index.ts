import "dotenv/config";
import { createApp } from "./app";
import pino from "pino";

const log = pino({ name: "api-bootstrap" });
const port = Number(process.env.PORT ?? 3000);

const app = createApp();
app.listen(port, () => {
  log.info({ port }, "API listening");
});
