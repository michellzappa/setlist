import type { Metadata } from "next";

export const metadata: Metadata = { title: "Caffeine" };

import dynamic from "next/dynamic";

const CaffeineDashboard = dynamic(() => import("@/components/caffeine-dashboard").then(m => m.CaffeineDashboard));

export default function CaffeinePage() {
  return <CaffeineDashboard />;
}
