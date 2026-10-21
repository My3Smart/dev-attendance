import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Delete,
  Nfc,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { schoolCardList, schoolCheckCard, schoolCheckPin } from "@/lib/school-db.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Attendance Kiosk — Tap Your Card" },
      {
        name: "description",
        content:
          "Tap an NFC card or enter your IC PIN on the school attendance kiosk.",
      },
      {
        property: "og:title",
        content: "Attendance Kiosk",
      },
      {
        property: "og:description",
        content: "Tap your NFC card to check in at school.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary",
      },
    ],
  }),
  component: Kiosk,
});

type Tap = {
  id: string;
  ref: string;
  name: string | null;
  time: string;
  at: string;
  method: "card" | "pin";
  reader?: string;
  error?: string;
};

function errorText(r: { reason: string; detail?: string }) {
  if (r.reason === "db_error") return `Database error: ${r.detail ?? "unknown"}`;
  if (r.reason === "multiple") return "More than one student matches";
  return "Not registered in the school database";
}

const STORAGE_KEY = "attendance_entries_v1";

function readEntries(): Tap[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Tap[]) : [];
  } catch {
    return [];
  }
}

// Read-modify-write synchronously so rapid back-to-back taps never overwrite each other.
function appendEntry(t: Tap) {
  const all = readEntries();
  all.push(t);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

// USB NFC readers act like keyboards, so readers tapping together merge into
// one stream — concatenated or interleaved character-by-character. We split
// the stream back into known cards by treating each card as a subsequence.
// Filled from the school database on startup (longest first).
let KNOWN_CARDS: string[] = [];
function setKnownCards(list: string[]) {
  KNOWN_CARDS = [...list].sort((a, b) => b.length - a.length);
}

// Remove `card` from `s` as a subsequence (earliest positions), starting at index 0.
function removeSubsequence(s: string, card: string): string | null {
  if (s[0] !== card[0]) return null;
  const used = new Array(s.length).fill(false);
  let j = 0;
  for (let i = 0; i < s.length && j < card.length; i++) {
    if (s[i] === card[j]) {
      used[i] = true;
      j++;
    }
  }
  if (j < card.length) return null;
  return s
    .split("")
    .filter((_, i) => !used[i])
    .join("");
}

// Fully decompose a buffer into known cards (backtracking). Null if impossible.
function decomposeBuffer(s: string, depth = 0): string[] | null {
  if (s.length === 0) return [];
  if (depth > 8) return null;
  for (const card of KNOWN_CARDS) {
    const rest = removeSubsequence(s, card);
    if (rest === null) continue;
    const tail = decomposeBuffer(rest, depth + 1);
    if (tail) return [card, ...tail];
  }
  return null;
}

// Best-effort split when the buffer can't be fully explained: pull out every
// known card we can find, return the leftover as one unknown entry.
function extractCardsFromBuffer(raw: string): string[] {
  const s = raw.trim().toUpperCase();
  const full = decomposeBuffer(s);
  if (full) return full;

  let remaining = s;
  const found: string[] = [];
  let progress = true;
  while (progress && remaining.length > 0) {
    progress = false;
    for (const card of KNOWN_CARDS) {
      const idx = remaining.indexOf(card);
      if (idx !== -1) {
        found.push(card);
        remaining = remaining.slice(0, idx) + remaining.slice(idx + card.length);
        progress = true;
        break;
      }
    }
  }
  if (remaining.length >= 4) found.push(remaining);
  return found;
}

function Kiosk() {
  const [activeTaps, setActiveTaps] = useState<Tap[]>([]);
  const [history, setHistory] = useState<Tap[]>([]);
  const [pinMode, setPinMode] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  const buffer = useRef({ text: "", last: 0 });
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setHistory(readEntries().slice().reverse());
    const load = () => schoolCardList().then(setKnownCards).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    const map = timers.current;
    return () => {
      clearInterval(iv);
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  // Each tap gets its own pop-up with an independent auto-dismiss timer,
  // so simultaneous taps all show side by side.
  const showTap = useCallback((partial: Omit<Tap, "id" | "at">) => {
    const t: Tap = {
      ...partial,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
    };

    appendEntry(t);
    setActiveTaps((list) => [...list, t]);
    setHistory((h) => [t, ...h]);

    const timer = setTimeout(() => {
      setActiveTaps((list) => list.filter((x) => x.id !== t.id));
      timers.current.delete(t.id);
    }, 3500);

    timers.current.set(t.id, timer);
  }, []);

  const recordCardBurst = useCallback(
    (raw: string) => {
      const cards = raw.includes("|") ? raw.split("|") : extractCardsFromBuffer(raw);
      for (const card of cards) {
        const time = new Date().toLocaleTimeString("en-MY");
        schoolCheckCard({ data: { card } })
          .then((r) =>
            showTap({
              ref: card,
              name: r.ok ? r.name : null,
              time,
              method: "card",
              ...(r.ok ? {} : { error: errorText(r) }),
            }),
          )
          .catch((e: unknown) =>
            showTap({ ref: card, name: null, time, method: "card", error: `Connection error: ${String(e)}` }),
          );
      }
    },
    [showTap]
  );

  // Clear all saved attendance records from localStorage.
  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
    setActiveTaps([]);
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
  }, []);

  // Ask for confirmation before clearing everything.
  const handleClearAll = useCallback(() => {
    if (history.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Clear all ${history.length} saved attendance records?\n\n` +
        "This will permanently remove them from this browser's local storage."
    );

    if (confirmed) {
      clearAll();
    }
  }, [history.length, clearAll]);

  const submitPin = useCallback(
    async (value: string) => {
      setPin("");
      let name: string | null = null;
      let error: string | undefined;
      try {
        const r = await schoolCheckPin({ data: { pin: value } });
        if (r.ok) name = r.name;
        else error = errorText(r);
      } catch (e) {
        error = `Connection error: ${String(e)}`;
      }
      showTap({ ref: value, name, time: new Date().toLocaleTimeString("en-MY"), method: "pin", ...(error ? { error } : {}) });
      setPinError(!name);
      if (name) setPinMode(false);
    },
    [showTap]
  );

  // Ref keeps the latest PIN so several digits in a row never use a stale value.
  const pinRef = useRef("");
  pinRef.current = pin;
  const pressKey = useCallback(
    (k: string) => {
      setPinError(false);
      const cur = pinRef.current;
      if (k === "del") {
        pinRef.current = cur.slice(0, -1);
        setPin(pinRef.current);
      } else if (cur.length < 8) {
        const next = cur + k;
        pinRef.current = next;
        setPin(next);
        if (next.length === 8) {
          pinRef.current = "";
          submitPin(next);
        }
      }
    },
    [submitPin]
  );

  // USB NFC readers type the card number followed by Enter, very fast.
  // Physical keyboard input ALWAYS goes to the card reader path — the PIN is
  // entered only on the on-screen keypad — so a card tap never lands in a PIN.
  // Enter doesn't wipe the buffer: we try to split it into whole cards and
  // keep any half-typed card from another reader until it finishes.
  const pinModeRef = useRef(pinMode);
  pinModeRef.current = pinMode;
  const pressKeyRef = useRef(pressKey);
  pressKeyRef.current = pressKey;

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const tryFlush = (force: boolean) => {
      const b = buffer.current;
      if (!b.text) return;
      // On the PIN screen, short typed input (cards are 10+ chars) is the PIN.
      if (pinModeRef.current && b.text.length < 10 && /^\d+$/.test(b.text)) {
        const digits = b.text;
        b.text = "";
        for (const d of digits) pressKeyRef.current(d);
        return;
      }
      const full = decomposeBuffer(b.text.toUpperCase());
      if (full && full.length > 0) {
        b.text = "";
        recordCardBurst(full.join("|"));
        return;
      }
      if (force) {
        const raw = b.text;
        b.text = "";
        if (raw.length >= 4) recordCardBurst(raw);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const b = buffer.current;
      b.last = Date.now();
      // Stop reader keystrokes (esp. Enter) from "clicking" a focused keypad button.
      if (e.key === "Enter" || /^[0-9a-zA-Z]$/.test(e.key)) e.preventDefault();

      if (pinModeRef.current && !b.text) {
        if (e.key === "Backspace") { pressKeyRef.current("del"); return; }
        if (e.key === "Escape") { setPinMode(false); return; }
      }


      if (e.key === "Enter") {
        // Enter always ends a tap: send whatever is in the buffer, never keep it.
        tryFlush(true);
        clearTimeout(idleTimer);
        return;
      } else if (/^[0-9a-zA-Z]$/.test(e.key)) {
        b.text += e.key;
      } else {
        return;
      }

      clearTimeout(idleTimer);
      // After a quiet gap, flush whatever is left (unknown cards included).
      idleTimer = setTimeout(() => tryFlush(true), 250);
    };

    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener("keydown", onKey);
    };
  }, [recordCardBurst]);

  return (
    <main className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <header className="bg-primary px-8 py-5 text-primary-foreground">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Attendance Kiosk
        </h1>

        <p className="text-sm opacity-80">
          Test mode · card and PIN
        </p>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-10">
        {pinMode ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-6">
            <h2 className="font-display text-3xl font-bold tracking-tight">
              Enter your PIN
            </h2>

            <p className="text-center text-muted-foreground">
              First 4 digits + last 4 digits of your IC number.
              <br />
              Example: IC 000307-02-0031 → PIN 00030031
            </p>

            <div className="flex gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className={`flex h-12 w-9 items-center justify-center rounded-lg border-2 font-display text-2xl font-bold tabular-nums ${
                    pinError
                      ? "border-destructive text-destructive"
                      : "border-border"
                  }`}
                >
                  {pin[i] ?? ""}
                </span>
              ))}
            </div>

            {pinError && (
              <p className="text-sm font-semibold text-destructive">
                PIN not recognised — try again
              </p>
            )}

            <div className="grid grid-cols-3 gap-3">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
              ].map((k) => (
                <Button
                  key={k}
                  variant="outline"
                  size="lg"
                  className="h-16 w-20 text-2xl"
                  onClick={() => pressKey(k)}
                >
                  {k}
                </Button>
              ))}

              <Button
                variant="ghost"
                size="lg"
                className="h-16 w-20"
                onClick={() => {
                  setPinMode(false);
                  setPin("");
                  setPinError(false);
                }}
              >
                Cancel
              </Button>

              <Button
                variant="outline"
                size="lg"
                className="h-16 w-20 text-2xl"
                onClick={() => pressKey("0")}
              >
                0
              </Button>

              <Button
                variant="outline"
                size="lg"
                className="h-16 w-20"
                onClick={() => pressKey("del")}
              >
                <Delete className="h-6 w-6" />
              </Button>
            </div>
          </div>
        ) : null}
        {activeTaps.length > 0 && (
          <div
            className={`flex w-full max-w-5xl flex-wrap items-stretch justify-center gap-6 ${
              pinMode
                ? "pointer-events-none fixed inset-x-0 bottom-6 z-50 mx-auto px-6"
                : ""
            }`}
          >
            {activeTaps.map((tap) => (
              <div
                key={tap.id}
                className={`flex w-full max-w-md flex-1 flex-col items-center gap-3 rounded-3xl p-10 text-center shadow-xl ${
                  tap.name
                    ? "bg-success text-success-foreground"
                    : "bg-destructive text-destructive-foreground"
                }`}
              >
                {tap.name ? (
                  <CheckCircle2 className="h-16 w-16" />
                ) : (
                  <XCircle className="h-16 w-16" />
                )}

                <p className="text-lg opacity-80">
                  {tap.name
                    ? "Attendance captured"
                    : tap.method === "card"
                      ? "Unknown card"
                      : "Unknown PIN"}
                </p>

                <h3 className="font-display text-3xl font-bold">
                  {tap.name ?? "No record"}
                </h3>
                {!tap.name && tap.error && (
                  <p className="break-words text-sm font-semibold">{tap.error}</p>
                )}
                <h3 className="hidden">
                </h3>

                <p className="text-sm opacity-80">
                  {tap.method === "card" ? "Card number" : "PIN"}
                </p>

                <h2 className="break-all font-display text-2xl font-bold tabular-nums">
                  {tap.ref}
                </h2>

                <p className="text-lg opacity-90">
                  {tap.time} · by {tap.method === "card" ? "card" : "PIN"}
                </p>
              </div>
            ))}
          </div>
        )}
        {!pinMode && activeTaps.length === 0 && (
          <>
            <div className="relative flex h-56 w-56 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />

              <span className="relative flex h-48 w-48 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl">
                <Nfc className="h-24 w-24" strokeWidth={1.5} />
              </span>
            </div>

            <h2 className="font-display text-5xl font-bold tracking-tight">
              Tap your card
            </h2>

            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setPinMode(true);
                setPin("");
                setPinError(false);
              }}
            >
              Forget your card? Enter PIN
            </Button>
          </>
        )}
      </section>

      {history.length > 0 && (
        <footer className="border-t px-8 py-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="text-sm font-semibold">
              Saved attendance ({history.length})
            </p>

            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAll}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Reset / Clear All
            </Button>
          </div>

          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-muted-foreground">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex justify-between tabular-nums"
              >
                <span>
                  {h.ref}{" "}
                  {h.name ? `· ${h.name}` : "· unknown"} · by{" "}
                  {h.method === "card" ? "card" : "PIN"}
                  {h.reader ? ` · ${h.reader}` : ""}
                </span>

                <span>{h.time}</span>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </main>
  );
}
