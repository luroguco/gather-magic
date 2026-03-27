import { buildApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

app
  .listen({
    port,
    host
  })
  .then(() => {
    console.log(`MTGA Collection API listening on http://${host}:${port}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
