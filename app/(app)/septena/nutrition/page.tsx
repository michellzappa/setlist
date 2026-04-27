import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nutrition" };

import dynamic from "next/dynamic";

const NutritionDashboard = dynamic(() => import("@/components/nutrition-dashboard").then(m => m.NutritionDashboard));

export default function NutritionPage() {
  return <NutritionDashboard />;
}
