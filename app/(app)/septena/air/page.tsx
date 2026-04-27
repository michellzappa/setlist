import type { Metadata } from "next";

export const metadata: Metadata = { title: "Air" };

import dynamic from "next/dynamic";

const AirDashboard = dynamic(() => import("@/components/air-dashboard").then(m => m.AirDashboard));

export default function AirPage() {
  return <AirDashboard />;
}
