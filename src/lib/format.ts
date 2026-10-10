export function shortSha(sha: string | null | undefined) {
  if (!sha) return "—";
  return sha.slice(0, 7);
}

export function formatWhen(date: Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDuration(start: Date | null | undefined, end: Date | null | undefined) {
  if (!start || !end) return "—";
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatCost(value: number | null | undefined) {
  if (value == null) return "—";
  if (value < 0.01) return "< $0.01";
  return `$${value.toFixed(2)}`;
}

export function statusLabel(status: string) {
  if (status === "rate_limited") return "Rate limited";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
