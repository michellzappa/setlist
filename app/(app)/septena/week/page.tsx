import type { Metadata } from "next";

export const metadata: Metadata = { title: "Week" };

import { WeekDashboard } from "@/components/week-dashboard";

export default function WeekPage() {
  return <WeekDashboard />;
}
