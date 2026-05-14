type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = {
  msg: string;
  requestId?: string;
  userId?: string;
  slug?: string;
  err?: unknown;
  [key: string]: unknown;
};

function emit(level: LogLevel, fields: LogFields) {
  const { err, ...rest } = fields;
  const payload: Record<string, unknown> = {
    level,
    ts: new Date().toISOString(),
    ...rest,
  };
  if (err) {
    payload.err =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : err;
  }
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (fields: LogFields) => emit("debug", fields),
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => emit("error", fields),
};
