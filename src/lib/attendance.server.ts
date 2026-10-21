import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isLate, localClock, normalizePhone, shouldSendAbsentAlerts } from "./attendance-rules";
import { sendTemplate, whatsappConfigured } from "./whatsapp.server";
import { fetchSchoolStudents } from "./school-api.server";
import { icToPin } from "./attendance-rules";

export async function loadSettings() {
  const { data, error } = await supabaseAdmin.from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

type Student = { id: string; name: string; class_name: string | null; parent_phone: string | null };

async function notify(student: Student, kind: "arrival" | "absent", params: string[], settings: Awaited<ReturnType<typeof loadSettings>>) {
  const to = normalizePhone(student.parent_phone);
  if (!to) {
    await supabaseAdmin.from("whatsapp_messages").insert({ student_id: student.id, kind, status: "failed", error: "No parent phone number" });
    return;
  }
  if (!whatsappConfigured()) {
    await supabaseAdmin.from("whatsapp_messages").insert({ student_id: student.id, kind, to_phone: to, status: "skipped", error: "WhatsApp not connected" });
    return;
  }
  const result = await sendTemplate({
    to,
    template: kind === "arrival" ? settings.arrival_template : settings.absent_template,
    language: settings.template_language,
    params,
  });
  if (result.ok) {
    await supabaseAdmin.from("whatsapp_messages").insert({ student_id: student.id, kind, to_phone: to, provider_message_id: result.messageId, status: "accepted" });
    await reconcilePendingStatuses();
  } else {
    await supabaseAdmin.from("whatsapp_messages").insert({ student_id: student.id, kind, to_phone: to, status: "failed", error: result.error });
  }
}

export type CheckInResult =
  | { ok: true; already: boolean; name: string; className: string | null; time: string; method: "card" | "pin"; late: boolean }
  | { ok: false; error: string };

export async function checkIn(by: { card?: string; pin?: string }): Promise<CheckInResult> {
  const settings = await loadSettings();
  let q = supabaseAdmin.from("students").select("id,name,class_name,parent_phone").eq("active", true);
  q = by.card ? q.eq("card_uid", by.card.trim().toUpperCase()) : q.eq("pin", (by.pin ?? "").trim());
  const { data: matches, error } = await q.limit(2);
  if (error) throw error;
  if (!matches || matches.length === 0) return { ok: false, error: by.card ? "Card not registered" : "PIN not found" };
  if (matches.length > 1) return { ok: false, error: "PIN matches more than one student. Please see the office." };
  const student = matches[0]!;
  const method = by.card ? "card" : "pin";

  const now = new Date();
  const clock = localClock(now, settings.timezone);
  const late = isLate(clock.time, settings.school_start_time.slice(0, 5));

  const { data: existing } = await supabaseAdmin
    .from("attendance")
    .select("checked_in_at,method,is_late")
    .eq("student_id", student.id)
    .eq("attendance_date", clock.date)
    .maybeSingle();
  const displayTime = (d: Date) =>
    new Intl.DateTimeFormat("en-MY", { timeZone: settings.timezone, hour: "numeric", minute: "2-digit" }).format(d);

  if (existing) {
    return { ok: true, already: true, name: student.name, className: student.class_name, time: displayTime(new Date(existing.checked_in_at)), method: existing.method as "card" | "pin", late: existing.is_late };
  }

  const { error: insErr } = await supabaseAdmin
    .from("attendance")
    .insert({ student_id: student.id, attendance_date: clock.date, checked_in_at: now.toISOString(), method, is_late: late });
  if (insErr) {
    if (insErr.code === "23505") return { ok: true, already: true, name: student.name, className: student.class_name, time: displayTime(now), method, late };
    throw insErr;
  }

  await notify(student, "arrival", [student.name, displayTime(now)], settings);
  return { ok: true, already: false, name: student.name, className: student.class_name, time: displayTime(now), method, late };
}

/** Sends one absent alert per student per day, once the alert time has passed. */
export async function runAbsentCheck(force = false) {
  const settings = await loadSettings();
  const clock = localClock(new Date(), settings.timezone);
  if (!force && !shouldSendAbsentAlerts(clock, settings.absent_alert_time.slice(0, 5), settings.school_days)) {
    return { sent: 0, skipped: "Not time yet or not a school day" };
  }
  const [{ data: students }, { data: present }, { data: alerted }] = await Promise.all([
    supabaseAdmin.from("students").select("id,name,class_name,parent_phone").eq("active", true),
    supabaseAdmin.from("attendance").select("student_id").eq("attendance_date", clock.date),
    supabaseAdmin.from("absence_alerts").select("student_id").eq("alert_date", clock.date),
  ]);
  const done = new Set([...(present ?? []), ...(alerted ?? [])].map((r) => r.student_id));
  const dateLabel = new Intl.DateTimeFormat("en-MY", { timeZone: settings.timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  let sent = 0;
  for (const s of (students ?? []).filter((s) => !done.has(s.id))) {
    // Claim first so overlapping runs never double-send.
    const { error } = await supabaseAdmin.from("absence_alerts").insert({ student_id: s.id, alert_date: clock.date });
    if (error) continue;
    await notify(s, "absent", [s.name, dateLabel], settings);
    sent++;
  }
  return { sent };
}

export async function syncStudentsFromSchool() {
  const list = await fetchSchoolStudents();
  const rows = list.map((s) => ({
    ...s,
    card_uid: s.card_uid ? s.card_uid.toUpperCase() : null,
    pin: icToPin(s.ic_number),
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return { synced: 0 };
  const { error } = await supabaseAdmin.from("students").upsert(rows, { onConflict: "external_id" });
  if (error) throw error;
  return { synced: rows.length };
}

// ---------- WhatsApp delivery status reconciliation ----------

const RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

type StatusItem = { id: string; status: string; timestamp?: string; errors?: { title?: string; message?: string }[] };

/** Applies status callbacks in an event; returns false when a message isn't stored yet. */
async function applyStatusEvent(payload: unknown): Promise<boolean> {
  const value = (payload as { entry?: { changes?: { value?: { statuses?: StatusItem[] } }[] }[] })?.entry?.[0]?.changes?.[0]?.value;
  let allMatched = true;
  for (const st of value?.statuses ?? []) {
    const { data: msg, error } = await supabaseAdmin.from("whatsapp_messages").select("id,status").eq("provider_message_id", st.id).maybeSingle();
    if (error) throw error;
    if (!msg) {
      allMatched = false;
      continue;
    }
    const newer = (RANK[st.status] ?? 0) >= (RANK[msg.status] ?? 0);
    if (!newer) continue;
    const err = st.errors?.map((e) => e.message ?? e.title).join("; ") || null;
    const { error: upErr } = await supabaseAdmin
      .from("whatsapp_messages")
      .update({ status: st.status, status_at: st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : null, ...(err ? { error: err } : {}) })
      .eq("id", msg.id);
    if (upErr) throw upErr;
  }
  return allMatched;
}

export async function processWebhookEvent(row: { id: string; event: string; payload: unknown; attempts: number }) {
  try {
    let done = true;
    if (row.event === "whatsapp.status") done = await applyStatusEvent(row.payload);
    await supabaseAdmin
      .from("whatsapp_webhook_events")
      .update(done ? { processed_at: new Date().toISOString(), processing_error: null, attempts: row.attempts + 1 } : { processing_error: "waiting for outbound message", attempts: row.attempts + 1 })
      .eq("id", row.id);
    return true;
  } catch (e) {
    await supabaseAdmin
      .from("whatsapp_webhook_events")
      .update({ processing_error: e instanceof Error ? e.message : String(e), attempts: row.attempts + 1 })
      .eq("id", row.id);
    return false;
  }
}

/** Bounded retry of unfinished events, least-attempted first so no row starves others. */
export async function reconcilePendingStatuses() {
  const { data } = await supabaseAdmin
    .from("whatsapp_webhook_events")
    .select("id,event,payload,attempts")
    .is("processed_at", null)
    .lt("attempts", 50)
    .order("attempts", { ascending: true })
    .order("received_at", { ascending: true })
    .limit(10);
  for (const row of data ?? []) await processWebhookEvent(row);
}
