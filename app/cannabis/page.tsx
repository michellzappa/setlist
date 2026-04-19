import dynamic from "next/dynamic";

const CannabisDashboard = dynamic(() => import("@/components/cannabis-dashboard").then(m => m.CannabisDashboard));

export default function CannabisPage() {
  return <CannabisDashboard />;
}
