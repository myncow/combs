function readTrimmedEnvValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readEnv(name: string): string | undefined {
  return readTrimmedEnvValue(process.env[name]);
}

export function readFirstEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = readEnv(name);
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function getDatabaseUrl(): string | undefined {
  return readFirstEnv(["DATABASE_URL", "DATABASE_URL_UNPOOLED"]);
}

export function deriveNeonAuthBaseUrl(databaseUrl: string): string | undefined {
  try {
    const parsed = new URL(databaseUrl);
    const hostname = parsed.hostname.replace(/-pooler(?=\.)/, "");
    const dbName = parsed.pathname.replace(/^\//, "");

    if (!hostname || !dbName) {
      return undefined;
    }

    const authHostname = hostname.replace(/^([^.]+)\./, "$1.neonauth.");
    return `https://${authHostname}/${dbName}/auth`;
  } catch {
    return undefined;
  }
}

export function getNeonAuthBaseUrl(): string | undefined {
  return (
    readFirstEnv(["VITE_NEON_AUTH_URL", "NEON_AUTH_BASE_URL"]) ??
    (() => {
      const databaseUrl = getDatabaseUrl();
      return databaseUrl ? deriveNeonAuthBaseUrl(databaseUrl) : undefined;
    })()
  );
}

export function getNeonAuthCookieSecret(): string | undefined {
  return readEnv("NEON_AUTH_COOKIE_SECRET");
}
