import { cn } from "@/lib/utils";

const CIRCLES = [
  { cx: 256, cy: 107, r: 49 },
  { cx: 373, cy: 162, r: 49 },
  { cx: 402, cy: 290, r: 49 },
  { cx: 321, cy: 391, r: 49 },
  { cx: 191, cy: 391, r: 49 },
  { cx: 110, cy: 290, r: 49 },
  { cx: 139, cy: 162, r: 49 },
] as const;

export function SeptenaMark({
  className,
  variant = "spectrum",
}: {
  className?: string;
  variant?: "currentColor" | "spectrum";
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      {CIRCLES.map((circle, index) => (
        <circle
          key={`${circle.cx}-${circle.cy}`}
          {...circle}
          fill={variant === "currentColor" ? "currentColor" : `var(--brand-${index + 1})`}
        />
      ))}
    </svg>
  );
}

export function SeptenaSpectrumDots({
  className,
  dotClassName,
}: {
  className?: string;
  dotClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-hidden>
      {Array.from({ length: 7 }, (_, index) => (
        <span
          key={index}
          className={cn("h-2.5 w-2.5 rounded-full", dotClassName)}
          style={{ backgroundColor: `var(--brand-${index + 1})` }}
        />
      ))}
    </div>
  );
}
