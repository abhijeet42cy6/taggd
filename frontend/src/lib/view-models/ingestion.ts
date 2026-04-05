export function ingestionEvent(message: string, level: "info" | "error" = "info") {
  return {
    timestamp: new Date().toISOString(),
    message,
    level,
  };
}

