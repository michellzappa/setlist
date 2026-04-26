"use client";

import { cn } from "@/lib/utils";

function lastGrapheme(str: string): string {
  if (!str) return "";
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const segs = Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(str));
    return segs.length ? segs[segs.length - 1].segment : "";
  }
  const cps = Array.from(str);
  return cps.length ? cps[cps.length - 1] : "";
}

export function EmojiInput({
  value,
  onChange,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  "aria-label"?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(lastGrapheme(e.target.value))}
      className={cn(
        "rounded-md border border-input bg-background px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-ring",
        className,
      )}
      {...rest}
    />
  );
}
