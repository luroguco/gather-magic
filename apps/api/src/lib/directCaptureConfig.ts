const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export const resolveDirectCaptureEnabled = (
  host: string,
  setting: string | undefined
) => {
  if (setting === "1") {
    return true;
  }
  if (setting === "0") {
    return false;
  }
  return LOOPBACK_HOSTS.has(host);
};
