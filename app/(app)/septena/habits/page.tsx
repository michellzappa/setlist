import type { Metadata } from "next";

export const metadata: Metadata = { title: "Habits" };

import dynamic from "next/dynamic";

const HabitsDashboard = dynamic(() => import("@/components/habits-dashboard").then(m => m.HabitsDashboard));

export default function HabitsPage() {
  return <HabitsDashboard />;
}
