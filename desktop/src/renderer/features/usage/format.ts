export function formatEstimatedCost(value: number): string {
  return `≈${new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: value < 1 ? 2 : 0,
    minimumFractionDigits: value < 1 ? 2 : 0,
    style: "currency",
  }).format(value)}`;
}

export function formatUsageTokens(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(
    value,
  );
}
