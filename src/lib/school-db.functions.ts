import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Result =
  | { ok: true; name: string }
  | { ok: false; reason: "no_record" | "multiple" | "db_error"; detail?: string };

function dbError(where: string, e: unknown): Result {
  const detail = e instanceof Error ? e.message : String(e);
  console.error(`[school-db] ${where} failed:`, detail);
  return { ok: false, reason: "db_error", detail };
}

export const schoolCardList = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { listCardNumbers } = await import("./school-db.server");
    return await listCardNumbers();
  } catch (e) {
    dbError("listCardNumbers", e);
    return [] as string[];
  }
});

export const schoolCheckCard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ card: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }): Promise<Result> => {
    try {
      const { checkInCard } = await import("./school-db.server");
      return await checkInCard(data.card);
    } catch (e) {
      return dbError("checkInCard", e);
    }
  });

export const schoolCheckPin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin: z.string().regex(/^\d{8}$/) }).parse(d))
  .handler(async ({ data }): Promise<Result> => {
    try {
      const { checkInPin } = await import("./school-db.server");
      return await checkInPin(data.pin);
    } catch (e) {
      return dbError("checkInPin", e);
    }
  });
