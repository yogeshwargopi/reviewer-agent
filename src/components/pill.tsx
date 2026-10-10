import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/format";

const tones: Record<string, string> = {
  completed: "bg-good-soft text-good",
  queued: "bg-warn-soft text-warn",
  running: "bg-warn-soft text-warn",
  skipped: "bg-line text-muted",
  failed: "bg-bad-soft text-bad",
  rate_limited: "bg-bad-soft text-bad",
  blocker: "bg-bad-soft text-bad",
  major: "bg-copper-soft text-copper",
  minor: "bg-warn-soft text-warn",
  nit: "bg-line text-muted",
};

export function Pill({ value }: { value: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tones[value] ?? "bg-line text-muted")}>
      {statusLabel(value)}
    </span>
  );
}
