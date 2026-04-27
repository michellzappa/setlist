import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gut" };

import dynamic from "next/dynamic";

const GutDashboard = dynamic(() =>
  import("@/components/gut-dashboard").then((m) => m.GutDashboard),
);

export default function GutPage() {
  return <GutDashboard />;
}
