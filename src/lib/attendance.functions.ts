import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const checkInByCard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ card: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { checkIn } = await import("./attendance.server");
    return checkIn({ card: data.card });
  });

export const checkInByPin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin: z.string().regex(/^\d{8}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { checkIn } = await import("./attendance.server");
    return checkIn({ pin: data.pin });
  });

export const getKioskInfo = createServerFn({ method: "GET" }).handler(async () => {
  const { loadSettings } = await import("./attendance.server");
  const { localClock } = await import("./attendance-rules");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const s = await loadSettings();
  const today = localClock(new Date(), s.timezone).date;
  const [{ count: present }, { count: total }] = await Promise.all([
    supabaseAdmin.from("attendance").select("id", { count: "exact", head: true }).eq("attendance_date", today),
    supabaseAdmin.from("students").select("id", { count: "exact", head: true }).eq("active", true),
  ]);
  return { schoolName: s.school_name, schoolStart: s.school_start_time.slice(0, 5), present: present ?? 0, total: total ?? 0 };
});

const adminPin = z.string().min(4).max(12);

async function assertAdmin(pin: string) {
  const { loadSettings } = await import("./attendance.server");
  const s = await loadSettings();
  if (s.admin_pin !== pin) throw new Error("Wrong admin PIN");
  return s;
}

export const getSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminPin }).parse(d))
  .handler(async ({ data }) => {
    const s = await assertAdmin(data.adminPin);
    const { whatsappConfigured } = await import("./whatsapp.server");
    const { admin_pin: _omit, ...rest } = s;
    return {
      ...rest,
      school_start_time: s.school_start_time.slice(0, 5),
      absent_alert_time: s.absent_alert_time.slice(0, 5),
      whatsappConnected: whatsappConfigured(),
      schoolApiConfigured: Boolean(process.env["SCHOOL_API_URL"]),
    };
  });

const time = z.string().regex(/^\d{2}:\d{2}$/);

export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        adminPin,
        school_name: z.string().trim().min(1).max(100),
        school_start_time: time,
        absent_alert_time: time,
        school_days: z.array(z.number().int().min(1).max(7)),
        arrival_template: z.string().regex(/^[a-z0-9_]+$/),
        absent_template: z.string().regex(/^[a-z0-9_]+$/),
        template_language: z.string().min(2).max(10),
        new_admin_pin: z.string().regex(/^\d{4,12}$/).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await assertAdmin(data.adminPin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { adminPin: _a, new_admin_pin, ...fields } = data;
    const { error } = await supabaseAdmin
      .from("settings")
      .update({ ...fields, ...(new_admin_pin ? { admin_pin: new_admin_pin } : {}), updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;
    return { ok: true };
  });

export const syncStudents = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminPin }).parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminPin);
    const { syncStudentsFromSchool } = await import("./attendance.server");
    try {
      return { ok: true as const, ...(await syncStudentsFromSchool()) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const sendAbsentNow = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminPin }).parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminPin);
    const { runAbsentCheck } = await import("./attendance.server");
    return runAbsentCheck(true);
  });

export const createTemplates = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminPin }).parse(d))
  .handler(async ({ data }) => {
    const s = await assertAdmin(data.adminPin);
    const { createNotificationTemplates } = await import("./whatsapp.server");
    try {
      return { ok: true as const, results: await createNotificationTemplates(s.arrival_template, s.absent_template, s.template_language) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const getTodayRecords = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminPin }).parse(d))
  .handler(async ({ data }) => {
    const s = await assertAdmin(data.adminPin);
    const { localClock } = await import("./attendance-rules");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = localClock(new Date(), s.timezone).date;
    const [{ data: students }, { data: att }] = await Promise.all([
      supabaseAdmin.from("students").select("id,name,class_name").eq("active", true).order("name"),
      supabaseAdmin.from("attendance").select("student_id,checked_in_at,method,is_late").eq("attendance_date", today),
    ]);
    const byId = new Map((att ?? []).map((a) => [a.student_id, a]));
    const fmt = new Intl.DateTimeFormat("en-MY", { timeZone: s.timezone, hour: "numeric", minute: "2-digit" });
    return {
      date: today,
      rows: (students ?? []).map((st) => {
        const a = byId.get(st.id);
        return { name: st.name, className: st.class_name, time: a ? fmt.format(new Date(a.checked_in_at)) : null, method: a?.method ?? null, late: a?.is_late ?? false };
      }),
    };
  });
