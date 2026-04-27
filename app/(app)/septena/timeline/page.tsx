import type { Metadata } from "next";

export const metadata: Metadata = { title: "Timeline" };

import { TimelineDashboard } from "@/components/timeline-dashboard";

export default function TimelinePage() {
  return <TimelineDashboard />;
}
