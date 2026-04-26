import { saveNutritionEntry, type NutritionEntry } from "@/lib/api";
import { nowHHMM } from "@/lib/date-utils";
import { revalidateAfterLog } from "@/components/quick-log-forms";

export async function duplicateNutritionEntry(entry: NutritionEntry, date: string) {
  await saveNutritionEntry({
    date,
    time: nowHHMM(),
    emoji: entry.emoji ?? "",
    protein_g: entry.protein_g,
    fat_g: entry.fat_g ?? 0,
    carbs_g: entry.carbs_g ?? 0,
    kcal: entry.kcal ?? 0,
    foods: entry.foods,
  });
  revalidateAfterLog("nutrition");
}
