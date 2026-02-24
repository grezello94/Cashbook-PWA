type TelemetryPayload = Record<string, unknown>;

function normalizeEnvValue(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value.trim().replace(/^['"]|['"]$/g, "").trim();
}

const telemetryEndpoint = normalizeEnvValue(import.meta.env.VITE_TELEMETRY_ENDPOINT as string | undefined);

function buildNetworkContext(): Record<string, unknown> {
  if (typeof navigator === "undefined") {
    return {};
  }
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number };
  };
  return {
    online: navigator.onLine,
    effectiveType: nav.connection?.effectiveType ?? "",
    downlink: nav.connection?.downlink ?? null,
    rtt: nav.connection?.rtt ?? null
  };
}

export function trackTelemetry(event: string, payload: TelemetryPayload = {}): void {
  const body = {
    event,
    at: new Date().toISOString(),
    payload: {
      ...payload,
      ...buildNetworkContext()
    }
  };

  if (import.meta.env.DEV) {
    console.info("[telemetry]", body);
  }

  if (!telemetryEndpoint || typeof window === "undefined") {
    return;
  }

  const json = JSON.stringify(body);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([json], { type: "application/json" });
      navigator.sendBeacon(telemetryEndpoint, blob);
      return;
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch(telemetryEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: json,
    keepalive: true
  }).catch(() => {
    // Never fail user flows because telemetry failed.
  });
}
