export function formatEstimatedCost(value: number): string {
  return `≈${new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value)}`;
}

export function formatDurationMinutes(value: number): string {
  const minutes = Math.max(0, Math.round(value));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0
    ? `${hours}h${remainder.toString().padStart(2, "0")}m`
    : `${remainder}m`;
}

export function formatUsageTime(value: string | number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function billingBlockProgress(
  startTime: string,
  endTime: string,
  now = Date.now(),
): number | undefined {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return undefined;
  }
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export function burnRateExceedsThreshold(
  costPerHour: number,
  enabled: boolean,
  threshold: number,
): boolean {
  return enabled && costPerHour >= threshold;
}

export function formatUsageTokens(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(
    value,
  );
}

export function shouldShowEstimatedCost(
  costUsd: number,
  tokenCount: number,
): boolean {
  return costUsd > 0 || tokenCount <= 0;
}
