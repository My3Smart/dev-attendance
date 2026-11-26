// import mysql from "mysql2/promise";

// // Direct connection to the school's MySQL database (students + records tables).
// let pool: mysql.Pool | null = null;

// function getPool() {
//   if (!pool) {
//     pool = mysql.createPool({
//       host: process.env["DB_HOST"] ?? "72.61.151.99",
//       port: Number(process.env["DB_PORT"] ?? 3306),
//       database: process.env["DB_DATABASE"] ?? "skoola",
//       user: process.env["DB_USERNAME"] ?? "root",
//       password: process.env["DB_PASSWORD"] ?? "root",
//       connectionLimit: 3,
//       connectTimeout: 10000,
//       disableEval: true,
//     });
//   }
//   return pool;
// }

import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

function getPool() {
  if (!pool) {
    const host = process.env["DB_HOST"];
    const database = process.env["DB_DATABASE"];
    const user = process.env["DB_USERNAME"];
    const password = process.env["DB_PASSWORD"];

    if (!host || !database || !user || password === undefined) {
      throw new Error("Missing school database environment configuration");
    }

    pool = mysql.createPool({
      host,
      port: Number(process.env["DB_PORT"] ?? 3306),
      database,
      user,
      password,
      connectionLimit: 3,
      connectTimeout: 10000,
      disableEval: true,
    });

    console.log("[school-db] Database configured:", {
      host,
      database,
      user,
    });
  }

  return pool;
}

type StudentRow = { id: number; name: string; card_id: string | null; short_card_id: string | null };

export type CheckResult = { ok: true; name: string } | { ok: false; reason: "no_record" | "multiple" };

function nowMalaysia() {
  // e.g. 2026-10-06 10:38:12 in Malaysia time
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
}

async function saveRecord(cardId: string, name: string, type: "card" | "pin") {
  // records.card_id is limited to 15 characters.
  await getPool().execute(
    "INSERT INTO records (card_id, time, nama_pelajar, type) VALUES (?, ?, ?, ?)",
    [cardId.slice(0, 15), nowMalaysia(), name, type],
  );
}

export async function guardianNumbers(studentId: number): Promise<string[]> {
  const [rows] = await getPool().execute(
    "SELECT whatsapp_num FROM guardians WHERE student_id = ? AND whatsapp_num IS NOT NULL AND TRIM(whatsapp_num) <> ''",
    [studentId],
  );
  return [...new Set((rows as { whatsapp_num: string }[]).map((r) => r.whatsapp_num.trim()))];
}

async function sendArrival(s: StudentRow) {
  try {
    const { notifyParents, TEMPLATES, arrivalTime } = await import("./parent-whatsapp.server");
    const nums = await guardianNumbers(s.id);
    await notifyParents(nums, TEMPLATES.arrival(s.name, arrivalTime()));
  } catch (e) {
    console.error("[whatsapp] arrival failed:", e instanceof Error ? e.message : e);
  }
}

// Readers can be set to output the full 18-digit number or only the first 10
// digits, so the short form (first 10 digits) also counts as the same card.
const SHORT_LEN = 10;

export async function listCardNumbers(): Promise<string[]> {
  const [rows] = await getPool().query(
    "SELECT card_id, short_card_id FROM students WHERE deleted_at IS NULL",
  );
  const out = new Set<string>();
  for (const r of rows as StudentRow[]) {
    for (const v of [r.card_id, r.short_card_id]) {
      const c = v?.trim().toUpperCase();
      if (!c) continue;
      out.add(c);
      if (c.length > SHORT_LEN) out.add(c.slice(0, SHORT_LEN));
    }
  }
  return [...out];
}

export async function checkInCard(card: string): Promise<CheckResult> {
  const c = card.trim().toUpperCase();
  const [rows] = await getPool().execute(
    `SELECT id, name, card_id, short_card_id FROM students
     WHERE deleted_at IS NULL AND (
       UPPER(TRIM(card_id)) = ? OR UPPER(TRIM(short_card_id)) = ?
       OR (CHAR_LENGTH(?) >= ? AND (UPPER(TRIM(card_id)) LIKE CONCAT(?, '%') OR UPPER(TRIM(short_card_id)) LIKE CONCAT(?, '%')))
     )
     LIMIT 2`,
    [c, c, c, SHORT_LEN, c, c],
  );
  const list = rows as StudentRow[];
  if (list.length !== 1) return { ok: false, reason: list.length ? "multiple" : "no_record" };
  const s = list[0]!;
  await saveRecord(c, s.name, "card");
  await sendArrival(s);
  return { ok: true, name: s.name };
}

export async function checkInPin(pin: string): Promise<CheckResult> {
  // PIN = first 4 + last 4 digits of the IC (ignoring dashes/spaces).
  const [rows] = await getPool().execute(
    `SELECT id, name, card_id, short_card_id FROM students
     WHERE deleted_at IS NULL
       AND CONCAT(LEFT(REPLACE(REPLACE(ic,'-',''),' ',''),4), RIGHT(REPLACE(REPLACE(ic,'-',''),' ',''),4)) = ?
     LIMIT 2`,
    [pin],
  );
  const list = rows as StudentRow[];
  if (list.length === 0) return { ok: false, reason: "no_record" };
  if (list.length > 1) return { ok: false, reason: "multiple" };
  const s = list[0]!;
  await saveRecord(s.short_card_id || s.card_id || "", s.name, "pin");
  await sendArrival(s);
  return { ok: true, name: s.name };
}
