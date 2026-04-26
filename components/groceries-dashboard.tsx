"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { ShoppingCart } from "lucide-react";

import {
  getGroceries,
  patchGroceryItem,
  type GroceryItem,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  SectionHeaderAction,
  SectionHeaderActionButton,
} from "@/components/section-header-action";
import { TaskGroup, TaskRow } from "@/components/tasks";
import { StatCard } from "@/components/stat-card";
import { revalidateAfterLog } from "@/components/quick-log-forms";
import { QuickLogModal } from "@/components/quick-log-modal";
import { GroceriesQuickLog } from "@/components/quick-log-forms";
import { usePending } from "@/hooks/use-pending";

const CATEGORIES = ["produce", "dairy", "grains", "meat", "frozen", "household", "other"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_EMOJI: Record<Category, string> = {
  produce: "🥬",
  dairy: "🥛",
  grains: "🌾",
  meat: "🥩",
  frozen: "🧊",
  household: "🧹",
  other: "📦",
};

function relativeDays(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso + "T00:00:00");
  const now = new Date();
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function GroceriesDashboard() {
  const GROCERIES_COLOR = "var(--section-accent)";
  const { data, isLoading, mutate } = useSWR("groceries", getGroceries);
  const { pending, withPending } = usePending<string>();
  const [shopperMode, setShopperMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const items = data?.items ?? [];

  const grouped = useMemo(() => {
    const g: Partial<Record<Category, GroceryItem[]>> = {};
    for (const c of CATEGORIES) g[c] = [];
    for (const it of items) {
      const cat = (CATEGORIES.includes(it.category as Category) ? it.category : "other") as Category;
      g[cat]!.push(it);
    }
    return g;
  }, [items]);

  const lowItems = useMemo(() => items.filter((i) => i.low), [items]);
  const lowCount = lowItems.length;
  const totalCount = items.length;
  const stockedCount = totalCount - lowCount;
  const stockedPct = totalCount > 0 ? (stockedCount / totalCount) * 100 : 0;

  const toggleLow = useCallback(async (it: GroceryItem) => {
    await withPending(it.id, async () => {
      await patchGroceryItem(it.id, { low: !it.low });
      await mutate();
      revalidateAfterLog("groceries");
    });
  }, [mutate, withPending]);

  return (
    <>
      {!shopperMode && (
        <SectionHeaderAction>
          <SectionHeaderActionButton color={GROCERIES_COLOR} onClick={() => setShowAdd((v) => !v)}>
            + Add
          </SectionHeaderActionButton>
        </SectionHeaderAction>
      )}

      <div className="xl:grid xl:grid-cols-2 xl:gap-6 xl:items-start">
        <div className="space-y-6">
        <div className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Need"
          value={lowCount > 0 ? lowCount : null}
          sublabel="items running low"
          color={GROCERIES_COLOR}
        />
        <button
          onClick={() => setShopperMode((m) => !m)}
          disabled={lowCount === 0}
          className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:bg-muted/50 disabled:opacity-50"
          style={shopperMode ? { borderColor: GROCERIES_COLOR, backgroundColor: `${GROCERIES_COLOR}15` } : undefined}
        >
          <ShoppingCart size={18} className="mb-1" style={{ color: shopperMode ? GROCERIES_COLOR : undefined }} />
          <p className="text-xs text-muted-foreground">{shopperMode ? "Exit shopper mode" : "Shopper mode"}</p>
          <p className="text-xs text-muted-foreground">{lowCount === 0 ? "Nothing to buy" : `${lowCount} to check off`}</p>
        </button>
      </div>

      {totalCount > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Stocked</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {stockedCount}/{totalCount}
            </p>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${stockedPct}%`, backgroundColor: GROCERIES_COLOR }}
            />
          </div>
        </div>
      )}

        </div>
        <div className="mt-6 xl:mt-0 space-y-4">
      <QuickLogModal
        open={!shopperMode && showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Grocery"
        accent="var(--section-accent)"
      >
        <GroceriesQuickLog
          onDone={() => {
            setShowAdd(false);
            mutate();
          }}
        />
      </QuickLogModal>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : shopperMode ? (
        lowItems.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nothing on the list. Exit shopper mode to manage items.</CardContent></Card>
        ) : (
          <TaskGroup title="Shopping list" emoji="🛒" accent={GROCERIES_COLOR} doneCount={0} totalCount={lowItems.length}>
            {lowItems.map((it) => (
              <TaskRow
                key={it.id}
                label={it.name}
                emoji={it.emoji}
                done={false}
                pending={pending.has(it.id)}
                accent={GROCERIES_COLOR}
                onClick={() => toggleLow(it)}
              />
            ))}
          </TaskGroup>
        )
      ) : items.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No grocery items yet. Tap "+ Add" to get started.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.map((cat) => {
            const catItems = grouped[cat] ?? [];
            if (catItems.length === 0) return null;
            return (
              <TaskGroup key={cat} title={cat.charAt(0).toUpperCase() + cat.slice(1)} emoji={CATEGORY_EMOJI[cat]} accent={GROCERIES_COLOR} doneCount={catItems.filter((i) => i.low).length} totalCount={catItems.length}>
                {catItems.map((it) => (
                  <TaskRow
                    key={it.id}
                    label={it.name}
                    emoji={it.emoji}
                    sublabel={relativeDays(it.last_bought)}
                    done={it.low}
                    pending={pending.has(it.id)}
                    accent={GROCERIES_COLOR}
                    onClick={() => toggleLow(it)}
                  />
                ))}
              </TaskGroup>
            );
          })}
        </div>
      )}

        </div>
      </div>
    </>
  );
}
