"use client";

import { ArrowRight, Circle, Plus } from "lucide-react";
import { Emoji } from "@/components/ui/emoji";
import type { NextAction } from "@/hooks/use-next-actions";
import { cn } from "@/lib/utils";

export function NextActionIcon({
  action,
  className,
}: {
  action: NextAction;
  className?: string;
}) {
  if (action.emoji) {
    return (
      <span className={cn("inline-grid place-items-center leading-none", className)}>
        <Emoji className="leading-none">{action.emoji}</Emoji>
      </span>
    );
  }
  if (action.task) return <Circle className={className} />;
  if (action.modal) return <Plus className={className} />;
  return <ArrowRight className={className} />;
}
