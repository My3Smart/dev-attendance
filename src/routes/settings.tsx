import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createTemplates, getSettings, getTodayRecords, saveSettings, sendAbsentNow, syncStudents } from "@/lib/attendance.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Attendance Settings — School Times & Alerts" },
      { name: "description", content: "Set school start time, absent alert time, WhatsApp templates and sync students." },
      { property: "og:title", content: "Attendance Settings" },
      { property: "og:description", content: "Manage school times, parent alerts and student data." },
    ],
  }),
  component: SettingsPage,
});

type S = Awaited<ReturnType<typeof getSettings>>;
type Records = Awaited<ReturnType<typeof getTodayRecords>>;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function SettingsPage() {
  const [adminPin, setAdminPin] = useState("");
  const [s, setS] = useState<S | null>(null);
  const [records, setRecords] = useState<Records | null>(null);
  const [newPin, setNewPin] = useState("");
  const getFn = useServerFn(getSettings);
  const saveFn = useServerFn(saveSettings);
  const syncFn = useServerFn(syncStudents);
  const absentFn = useServerFn(sendAbsentNow);
  const tplFn = useServerFn(createTemplates);
  const recFn = useServerFn(getTodayRecords);

  const unlock = async () => {
    try {
      setS(await getFn({ data: { adminPin } }));
      setRecords(await recFn({ data: { adminPin } }));
    } catch {
      toast.error("Wrong admin PIN");
    }
  };

  if (!s) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 font-sans">
        <form className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-8" onSubmit={(e) => { e.preventDefault(); unlock(); }}>
          <h1 className="font-display text-2xl font-bold">Settings</h1>
          <Label htmlFor="pin">Admin PIN</Label>
          <Input id="pin" type="password" inputMode="numeric" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} />
          <Button className="w-full" type="submit">Unlock</Button>
          <Link to="/" className="block text-center text-sm text-muted-foreground">Back to kiosk</Link>
        </form>
      </main>
    );
  }

  const save = async () => {
    try {
      await saveFn({
        data: {
          adminPin,
          school_name: s.school_name,
          school_start_time: s.school_start_time,
          absent_alert_time: s.absent_alert_time,
          school_days: s.school_days,
          arrival_template: s.arrival_template,
          absent_template: s.absent_template,
          template_language: s.template_language,
          ...(newPin ? { new_admin_pin: newPin } : {}),
        },
      });
      if (newPin) { setAdminPin(newPin); setNewPin(""); }
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  return (
    <main className="min-h-screen bg-background p-6 font-sans">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Back to kiosk</Link>
        <h1 className="font-display text-3xl font-bold">Settings</h1>

        <section className="space-y-4 rounded-2xl border bg-card p-6">
          <h2 className="font-display text-xl font-semibold">School times</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label>School name</Label><Input value={s.school_name} onChange={(e) => setS({ ...s, school_name: e.target.value })} /></div>
            <div><Label>School starts</Label><Input type="time" value={s.school_start_time} onChange={(e) => setS({ ...s, school_start_time: e.target.value })} /></div>
            <div><Label>Send absent alert at</Label><Input type="time" value={s.absent_alert_time} onChange={(e) => setS({ ...s, absent_alert_time: e.target.value })} /></div>
          </div>
          <div>
            <Label>School days</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const n = i + 1;
                const on = s.school_days.includes(n);
                return (
                  <Button key={d} size="sm" variant={on ? "default" : "outline"} onClick={() => setS({ ...s, school_days: on ? s.school_days.filter((x) => x !== n) : [...s.school_days, n].sort() })}>{d}</Button>
                );
              })}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Check-ins after the start time are marked "Late". Parents of students who haven't checked in get a WhatsApp message at the alert time (checked every 10 minutes).</p>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-6">
          <h2 className="font-display text-xl font-semibold">WhatsApp parent messages</h2>
          <p className="text-sm">Status: {s.whatsappConnected ? <span className="font-semibold text-success">Connected</span> : <span className="font-semibold text-destructive">Not connected yet</span>}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label>Arrival template</Label><Input value={s.arrival_template} onChange={(e) => setS({ ...s, arrival_template: e.target.value })} /></div>
            <div><Label>Absent template</Label><Input value={s.absent_template} onChange={(e) => setS({ ...s, absent_template: e.target.value })} /></div>
            <div><Label>Language code</Label><Input value={s.template_language} onChange={(e) => setS({ ...s, template_language: e.target.value })} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!s.whatsappConnected} onClick={async () => {
              const r = await tplFn({ data: { adminPin } });
              if (!r.ok) { toast.error(r.error); return; }
              r.results.forEach((x) => (x.ok ? toast.success(`${x.name} sent to Meta for approval`) : toast.error(`${x.name}: ${x.detail}`)));
            }}>Create message templates</Button>
            <Button variant="outline" onClick={async () => {
              const r = await absentFn({ data: { adminPin } });
              toast.success(`Absent alerts sent: ${r.sent}`);
            }}>Send absent alerts now</Button>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-6">
          <h2 className="font-display text-xl font-semibold">Students</h2>
          <p className="text-sm">School system link: {s.schoolApiConfigured ? "set up" : "not set up yet"}</p>
          <Button variant="outline" onClick={async () => {
            const r = await syncFn({ data: { adminPin } });
            if (r.ok) { toast.success(`Synced ${r.synced} students`); setRecords(await recFn({ data: { adminPin } })); }
            else toast.error(r.error);
          }}>Sync students from school system</Button>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-6">
          <h2 className="font-display text-xl font-semibold">Admin PIN</h2>
          <div className="max-w-xs"><Label>New admin PIN (optional)</Label><Input type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} /></div>
        </section>

        <Button size="lg" onClick={save}>Save settings</Button>

        {records && (
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="mb-3 font-display text-xl font-semibold">Today ({records.date})</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2">Student</th><th>Class</th><th>Time</th><th>By</th></tr></thead>
              <tbody>
                {records.rows.map((r) => (
                  <tr key={r.name} className="border-t">
                    <td className="py-2">{r.name}</td>
                    <td>{r.className}</td>
                    <td>{r.time ? <>{r.time}{r.late && <span className="ml-2 rounded bg-accent px-1.5 text-xs text-accent-foreground">Late</span>}</> : <span className="text-destructive">Absent</span>}</td>
                    <td>{r.method === "card" ? "Card" : r.method === "pin" ? "PIN" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
