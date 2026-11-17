import { buildApp } from "./app.js";
import { resolveDirectCaptureEnabled } from "./lib/directCaptureConfig.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const host = process.env.HOST ?? "127.0.0.1";
const splitEnvironmentList = (value: string | undefined) =>
  value?.split(",").map((entry) => entry.trim()).filter(Boolean);
const allowedOrigins = splitEnvironmentList(process.env.ALLOWED_API_ORIGINS);
const allowedHosts = splitEnvironmentList(process.env.ALLOWED_API_HOSTS);
const directCaptureSetting =
  process.env.ENABLE_DIRECT_CAPTURE ?? process.env.ENABLE_EXPERIMENTAL_CAPTURE;

const app = buildApp(undefined, {
  directCaptureEnabled: resolveDirectCaptureEnabled(host, directCaptureSetting),
  ...(allowedOrigins ? { allowedOrigins } : {}),
  ...(allowedHosts ? { allowedHosts } : {}),
  ...(process.env.LOCAL_API_TOKEN
    ? { localApiToken: process.env.LOCAL_API_TOKEN }
    : {})
});

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
