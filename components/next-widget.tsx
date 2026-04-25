"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, Circle, Clock3, SkipForward } from "lucide-react";
import { QuickLogModal } from "@/components/quick-log-modal";
import {
  CaffeineQuickLog,
  NutritionQuickLog,
  revalidateAfterLog,
} from "@/components/quick-log-forms";
import { SectionTheme } from "@/components/section-theme";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { useSectionColor, useSections } from "@/hooks/use-sections";
import {
  useNextActions,
  type ModalKey,
  type NextAction,
} from "@/hooks/use-next-actions";
import { useDemoHref } from "@/hooks/use-demo-href";
import {
  completeChore,
  toggleHabit,
  toggleSupplement,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function PrimaryButton({
  action,
  color,
  pending,
  onComplete,
  onOpenModal,
  onNavigate,
  onSkip,
}: {
  action: NextAction;
  color: string;
  pending: boolean;
  onComplete: (action: NextAction) => void;
  onOpenModal: (key: ModalKey) => void;
  onNavigate: (href: string) => void;
  onSkip: (action: NextAction) => void;
}) {
  const onClick = () => {
    if (action.task) onComplete(action);
    else if (action.modal) onOpenModal(action.modal);
    else if (action.href) onNavigate(action.href);
  };
  return (
    <div className="flex min-w-0 items-stretch gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left text-sm text-white transition-transform active:scale-[0.99]",
          pending && "opacity-60",
        )}
        style={{ backgroundColor: color }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
          {action.task ? <Circle className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{action.title}</span>
          <span className="block truncate text-xs text-white/80">
            {[action.detail, action.reason].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-white/20 px-2 py-1 text-[11px] font-semibold">
          {action.task ? "Do" : action.buttonLabel ?? "Open"}
        </span>
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => onSkip(action)}
        title="Skip — leaves it undone, picks the next item"
        aria-label="Skip"
        className={cn(
          "flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-[color:var(--action-accent)] hover:text-foreground",
          pending && "opacity-60",
        )}
        style={{ ["--action-accent" as string]: color } as React.CSSProperties}
      >
        <SkipForward className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Skip</span>
      </button>
    </div>
  );
}

export function NextWidget() {
  const { date: selectedDate, isToday } = useSelectedDate();
  const router = useRouter();
  const sections = useSections();
  const accent = useSectionColor("next");
  const toHref = useDemoHref();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [openModal, setOpenModal] = useState<ModalKey | null>(null);

  const { isLoading, mutate, computed, skips } = useNextActions(selectedDate, isToday);
  const skip = (action: NextAction) => skips.skip(action.id);

  const colorMap = new Map(sections.map((s) => [s.key, s.color]));
  const primaryColor = computed.primary
    ? colorMap.get(computed.primary.section) ?? accent
    : accent;
  const queueCount = computed.queue.length;
  const laterCount = computed.later.length;

  async function completeAction(action: NextAction) {
    if (!action.task || pending.has(action.id)) return;
    setPending((prev) => new Set(prev).add(action.id));
    try {
      if (action.task.type === "habit") {
        await toggleHabit(selectedDate, action.task.id, !action.task.done);
        revalidateAfterLog("habits");
      } else if (action.task.type === "supplement") {
        await toggleSupplement(selectedDate, action.task.id, !action.task.done);
        revalidateAfterLog("supplements");
      } else {
        await completeChore(action.task.id, { date: selectedDate });
        revalidateAfterLog("chores");
      }
      await mutate();
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(action.id);
        return next;
      });
    }
  }

  const OpenForm =
    openModal === "nutrition" ? NutritionQuickLog : openModal === "caffeine" ? CaffeineQuickLog : null;
  const openAccent = openModal ? colorMap.get(openModal) ?? accent : accent;

  return (
    <SectionTheme sectionKey="next" className="mb-4">
      <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Circle className="h-4 w-4" style={{ color: accent }} />
            <h2 className="truncate text-sm font-semibold">Next</h2>
          </div>
          <Link
            href={toHref("/septena/next")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Open
          </Link>
        </div>

        {isLoading && !computed.primary ? (
          <div className="h-[60px] w-full animate-pulse rounded-xl bg-muted" />
        ) : computed.primary ? (
          <PrimaryButton
            action={computed.primary}
            color={primaryColor}
            pending={pending.has(computed.primary.id)}
            onComplete={completeAction}
            onOpenModal={setOpenModal}
            onNavigate={(href) => router.push(href)}
            onSkip={skip}
          />
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: accent }}
            >
              <Check className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">All clear</p>
              <p className="truncate text-xs text-muted-foreground">
                {skips.skipped.size > 0
                  ? `Nothing left for now. ${skips.skipped.size} skipped today.`
                  : "Nothing needs attention right now."}
              </p>
            </div>
            {skips.skipped.size > 0 && (
              <button
                type="button"
                onClick={skips.clear}
                className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Unskip
              </button>
            )}
          </div>
        )}

        {(queueCount > 0 || laterCount > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {queueCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
                <span className="tabular-nums">{queueCount}</span> in queue
              </span>
            )}
            {laterCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3 w-3" />
                <span className="tabular-nums">{laterCount}</span> later
              </span>
            )}
            {computed.done.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3 w-3" />
                <span className="tabular-nums">{computed.done.length}</span> done
              </span>
            )}
          </div>
        )}
      </section>

      {OpenForm && openModal && (
        <QuickLogModal
          open={!!openModal}
          onClose={() => setOpenModal(null)}
          title={openModal === "nutrition" ? "Log meal" : "Log caffeine"}
          accent={openAccent}
        >
          <OpenForm
            onDone={() => {
              setOpenModal(null);
              mutate();
            }}
          />
        </QuickLogModal>
      )}
    </SectionTheme>
  );
}
