import { createFileRoute } from "@tanstack/react-router";

// Called on a schedule. Safe to call repeatedly: each student gets at most one absent alert per day.
export const Route = createFileRoute("/api/public/hooks/absent-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("apikey");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        if (!key || !expected || key !== expected) return new Response("Unauthorized", { status: 401 });
        const { runAbsentCheck, reconcilePendingStatuses } = await import("@/lib/attendance.server");
        const result = await runAbsentCheck(false);
        await reconcilePendingStatuses();
        return Response.json(result);
      },
    },
  },
});
