"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { NextActionIcon } from "@/components/next-action-icon";
import { QuickLogModal } from "@/components/quick-log-modal";
import {
  CaffeineQuickLog,
  NutritionQuickLog,
  revalidateAfterLog,
} from "@/components/quick-log-forms";
import { SectionTheme } from "@/components/section-theme";
import { RowActionsMenu, TaskRow, type TaskRowAction } from "@/components/tasks";
import {
  completeChore,
  completeTask,
  deferChore,
  toggleHabit,
  toggleSupplement,
  type ChoreDeferMode,
  type SectionMeta,
} from "@/lib/api";
import { SECTIONS, type SectionKey } from "@/lib/sections";
import { useSelectedDate } from "@/hooks/use-selected-date";
import { useSectionColor, useSections } from "@/hooks/use-sections";
import {
  useNextActions,
  type ModalKey,
  type NextAction,
} from "@/hooks/use-next-actions";
import { cn } from "@/lib/utils";

function sectionMeta(sections: SectionMeta[], key: SectionKey): SectionMeta {
  return sections.find((s) => s.key === key) ?? {
    ...SECTIONS[key],
    enabled: true,
    show_in_nav: true,
    show_on_dashboard: true,
    order: 0,
  };
}

function NextActionRow({
  action,
  color,
  pending,
  primary,
  onComplete,
  onOpenModal,
  onNavigate,
  onSkip,
  onDefer,
}: {
  action: NextAction;
  color: string;
  pending: boolean;
  primary?: boolean;
  onComplete: (action: NextAction) => void;
  onOpenModal: (key: ModalKey) => void;
  onNavigate: (href: string) => void;
  onSkip?: (action: NextAction) => void;
  onDefer?: (action: NextAction, mode: ChoreDeferMode) => void;
}) {
  const isChore = action.task?.type === "chore";
  const rowActions: TaskRowAction[] | undefined =
    action.bucket !== "done"
      ? isChore && onDefer
        ? [
            { label: "Defer to tomorrow", onSelect: () => onDefer(action, "day") },
            { label: "Defer to weekend", onSelect: () => onDefer(action, "weekend") },
          ]
        : onSkip
          ? [{ label: "Skip for now", onSelect: () => onSkip(action) }]
          : undefined
      : undefined;

  if (action.task) {
    return (
      <TaskRow
        label={action.title}
        emoji={action.emoji}
        sublabel={[action.detail, action.reason].filter(Boolean).join(" · ")}
        sublabelTone={action.detail.includes("late") ? "warn" : undefined}
        done={action.bucket === "done"}
        pending={pending}
        accent={color}
        muted={action.muted}
        onClick={() => onComplete(action)}
        actions={rowActions}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-w-0 items-stretch overflow-hidden rounded-xl border transition-colors",
        primary
          ? "border-transparent text-white"
          : "border-border bg-card hover:border-[color:var(--action-accent)]",
        pending && "opacity-60",
      )}
      style={
        {
          backgroundColor: primary ? color : undefined,
          ["--action-accent" as string]: color,
        } as React.CSSProperties
      }
    >
      {!primary && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1"
          style={{ backgroundColor: color }}
        />
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (action.modal) onOpenModal(action.modal);
          else if (action.href) onNavigate(action.href);
        }}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left text-sm"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            primary ? "bg-white/20" : "bg-muted",
          )}
        >
          <NextActionIcon action={action} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{action.title}</span>
          <span className={cn("block text-xs", primary ? "text-white/80" : "text-muted-foreground")}>
            {[action.detail, action.reason].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold",
            primary ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
          )}
        >
          {action.buttonLabel ?? "Open"}
        </span>
      </button>
      {rowActions && (
        <div className="flex shrink-0 items-center">
          <RowActionsMenu
            tone={primary ? "on-accent" : "default"}
            disabled={pending}
            actions={rowActions}
          />
        </div>
      )}
    </div>
  );
}

function ActionPanel({
  title,
  icon,
  actions,
  colors,
  pending,
  empty,
  onComplete,
  onOpenModal,
  onNavigate,
  onSkip,
  onDefer,
}: {
  title: string;
  icon: React.ReactNode;
  actions: NextAction[];
  colors: Map<string, string>;
  pending: Set<string>;
  empty?: string;
  onComplete: (action: NextAction) => void;
  onOpenModal: (key: ModalKey) => void;
  onNavigate: (href: string) => void;
  onSkip?: (action: NextAction) => void;
  onDefer?: (action: NextAction, mode: ChoreDeferMode) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h2 className="truncate text-sm font-semibold">{title}</h2>
        </div>
        {actions.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">{actions.length}</span>
        )}
      </div>
      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty ?? "Nothing here."}</p>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <NextActionRow
              key={action.id}
              action={action}
              color={colors.get(action.section) ?? "var(--section-accent)"}
              pending={pending.has(action.id)}
              onComplete={onComplete}
              onOpenModal={onOpenModal}
              onNavigate={onNavigate}
              onSkip={onSkip}
              onDefer={onDefer}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function NextDashboard() {
  const { date: selectedDate, isToday } = useSelectedDate();
  const router = useRouter();
  const sections = useSections();
  const nextAccent = useSectionColor("next");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [openModal, setOpenModal] = useState<ModalKey | null>(null);

  const { data, isLoading, mutate, computed, skips } = useNextActions(selectedDate, isToday);
  const skip = (action: NextAction) => skips.skip(action.id);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sections) map.set(s.key, s.color);
    return map;
  }, [sections]);


  async function deferAction(action: NextAction, mode: ChoreDeferMode) {
    if (action.task?.type !== "chore" || pending.has(action.id)) return;
    setPending((prev) => new Set(prev).add(action.id));
    try {
      await deferChore(action.task.id, mode);
      revalidateAfterLog("chores");
      await mutate();
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(action.id);
        return next;
      });
    }
  }

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
      } else if (action.task.type === "task") {
        await completeTask(action.task.id);
        revalidateAfterLog("tasks");
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

  const openAccent = openModal ? colorMap.get(openModal) ?? nextAccent : nextAccent;
  const OpenForm = openModal === "nutrition" ? NutritionQuickLog : openModal === "caffeine" ? CaffeineQuickLog : null;

  return (
    <SectionTheme sectionKey="next" className="space-y-6">
      {isLoading && !data ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            {computed.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">All clear — nothing due.</p>
            ) : (
              computed.upcoming.map((action) => (
                <NextActionRow
                  key={action.id}
                  action={action}
                  color={colorMap.get(action.section) ?? nextAccent}
                  pending={pending.has(action.id)}
                  onComplete={completeAction}
                  onOpenModal={setOpenModal}
                  onNavigate={(href) => router.push(href)}
                  onSkip={skip}
                  onDefer={deferAction}
                />
              ))
            )}
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Check className="h-4 w-4" style={{ color: nextAccent }} />
                <h2 className="truncate text-sm font-semibold">Done Today</h2>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{computed.done.length}</span>
            </div>
            {computed.done.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing checked off yet.</p>
            ) : (
              <div className="space-y-2">
                {computed.done.map((action) => {
                  const accent = colorMap.get(action.section) ?? nextAccent;
                  return (
                    <TaskRow
                      key={action.id}
                      label={action.title}
                      emoji={action.emoji}
                      sublabel={action.detail}
                      done
                      pending={false}
                      accent={accent}
                      onClick={() => {}}
                    />
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>
      )}

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
