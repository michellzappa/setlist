/** Shared stat card used across all dashboard sections. */
export type StatCardSize = "sm" | "md" | "lg";

const STAT_CARD_RADIUS: Record<StatCardSize, string> = {
  sm: "rounded-xl",
  md: "rounded-2xl",
  lg: "rounded-3xl",
};

type StatCardProps = {
  label: string;
  value: string | number | null;
  sublabel?: string;
  unit?: string;
  /** 0..1 — renders a progress bar below the value. */
  progress?: number;
  /** Color for the progress bar (CSS color string). */
  color?: string;
  /** Desired direction: "up" = higher is better, "down" = lower is better. */
  direction?: "up" | "down";
  /** Optional target value shown as muted text. */
  target?: string;
  /** Card radius tier. sm=entry rows, md=stat cards, lg=overview tiles. Default md. */
  size?: StatCardSize;
  /** Optional histogram bars (e.g. 7-day sparkline). Replaces progress bar when provided. */
  histogramData?: { date: string; value: number }[];
  histogramColor?: string;
  histogramTarget?: number;
};

export function StatCard({ label, value, sublabel, unit, progress, color, direction, target, size = "md", histogramData, histogramColor, histogramTarget }: StatCardProps) {
  const clamped = progress !== undefined ? Math.min(1, Math.max(0, progress)) : null;
  const display = value === null ? "—" : value;
  const displayWithUnit = value !== null && unit ? `${display}${unit}` : display;
  const maxVal = histogramData && histogramData.length > 0 ? Math.max(...histogramData.map(d => d.value), 1) : 1;

  return (
    <div className={STAT_CARD_RADIUS[size] + " border border-border bg-card p-4"}>
      <div className="flex items-center gap-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {direction && (
          <span className="text-[10px] text-muted-foreground/60" title={direction === "up" ? "Higher is better" : "Lower is better"}>
            {direction === "up" ? "↑" : "↓"}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold" style={color ? { color } : undefined}>
        {displayWithUnit}
      </p>
      {sublabel && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
      {target && <p className="mt-0.5 text-[10px] text-muted-foreground/60">Target: {target}</p>}
      {histogramData && histogramData.length > 0 ? (
        <div className="mt-3 flex items-end gap-0.5" style={{ height: 32 }}>
          {histogramData.map((d, i) => {
            const h = Math.max(2, Math.round((d.value / maxVal) * 32));
            const isTarget = histogramTarget != null && d.value >= histogramTarget;
            return (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: h,
                  backgroundColor: isTarget ? (histogramColor ?? color ?? "hsl(220,10%,70%)") : "hsl(220,10%,70%)",
                  opacity: isTarget ? 1 : 0.5,
                  minWidth: 3,
                }}
              />
            );
          })}
        </div>
      ) : clamped !== null ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${clamped * 100}%`, backgroundColor: color }}
          />
        </div>
      ) : null}
    </div>
  );
}
