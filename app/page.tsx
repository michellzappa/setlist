import { OverviewDashboard } from "@/components/overview-dashboard";
import { MarketingPage } from "@/components/marketing-page";

export default function Home() {
  if (process.env.NEXT_PUBLIC_PUBLIC_SITE === "1") {
    return <MarketingPage />;
  }
  return <OverviewDashboard />;
}
