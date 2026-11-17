export type ProbeRequest = {
  pid?: number;
};

export const parseProbeRequest = (value: unknown): ProbeRequest => {
  if (value == null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Probe request must be an object.");
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "pid")) {
    throw new Error("Probe request contains unsupported fields.");
  }
  if (record.pid === undefined) {
    return {};
  }
  if (!Number.isInteger(record.pid) || (record.pid as number) <= 0) {
    throw new Error("Probe PID must be a positive integer.");
  }
  return {
    pid: record.pid as number
  };
};
