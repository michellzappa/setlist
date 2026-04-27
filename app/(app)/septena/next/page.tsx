import type { Metadata } from "next";

export const metadata: Metadata = { title: "Next" };

import dynamic from "next/dynamic";

const NextDashboard = dynamic(() =>
  import("@/components/next-dashboard").then((m) => m.NextDashboard),
);

export default function NextPage() {
  return <NextDashboard />;
}
