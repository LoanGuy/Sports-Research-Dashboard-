/**
 * Server-side application settings backed by the app_settings table, so
 * preferences like grading weights actually drive the live grading (the
 * old localStorage sliders changed nothing — an honesty bug).
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { appSettings } from "@shared/schema";
import { getDb, isDbConfigured } from "./db";

export const gradeWeightsSchema = z.object({
  market: z.number().min(0).max(60),
  matchup: z.number().min(0).max(60),
  form: z.number().min(0).max(60),
  conditions: z.number().min(0).max(60),
  data: z.number().min(0).max(60),
  risk: z.number().min(0).max(60),
});

export type GradeWeights = z.infer<typeof gradeWeightsSchema>;

/** Spec §27 default weights. */
export const DEFAULT_GRADE_WEIGHTS: GradeWeights = {
  market: 30,
  matchup: 25,
  form: 15,
  conditions: 10,
  data: 15,
  risk: 5,
};

const KEY = "gradeWeights";

export async function getGradeWeights(): Promise<GradeWeights> {
  if (!isDbConfigured()) return DEFAULT_GRADE_WEIGHTS;
  try {
    const db = getDb();
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
    if (rows.length === 0) return DEFAULT_GRADE_WEIGHTS;
    const parsed = gradeWeightsSchema.safeParse(rows[0].value);
    return parsed.success ? parsed.data : DEFAULT_GRADE_WEIGHTS;
  } catch {
    return DEFAULT_GRADE_WEIGHTS;
  }
}

export async function saveGradeWeights(weights: GradeWeights): Promise<GradeWeights> {
  const db = getDb();
  await db
    .insert(appSettings)
    .values({ key: KEY, value: weights, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: weights, updatedAt: new Date() } });
  return weights;
}
