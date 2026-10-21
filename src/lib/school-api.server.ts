// School system API: fetches the student list.
// Configure SCHOOL_API_URL (and optional SCHOOL_API_KEY) as secrets.
// Expected response: a JSON array (or { students: [...] } / { data: [...] }) of objects.
// Field names are matched loosely so most school systems work without changes.

export type SchoolStudent = {
  external_id: string;
  name: string;
  ic_number: string;
  card_uid: string | null;
  class_name: string | null;
  parent_name: string | null;
  parent_phone: string | null;
};

const pick = (o: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
};

export async function fetchSchoolStudents(): Promise<SchoolStudent[]> {
  const url = process.env["SCHOOL_API_URL"];
  const key = process.env["SCHOOL_API_KEY"];
  if (!url) throw new Error("School system link is not set up yet (SCHOOL_API_URL).");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(key ? { Authorization: `Bearer ${key}`, "x-api-key": key } : {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`School system returned ${res.status}: ${text.slice(0, 300)}`);

  const json = JSON.parse(text) as unknown;
  const list = (Array.isArray(json)
    ? json
    : ((json as Record<string, unknown>)["students"] ?? (json as Record<string, unknown>)["data"] ?? [])) as Record<
    string,
    unknown
  >[];

  return list
    .map((s) => ({
      external_id: pick(s, ["id", "student_id", "studentId", "external_id"]) ?? "",
      name: pick(s, ["name", "student_name", "full_name", "fullName"]) ?? "",
      ic_number: pick(s, ["ic_number", "ic", "mykid", "nric", "icNumber"]) ?? "",
      card_uid: pick(s, ["card_uid", "card_id", "nfc_uid", "rfid", "cardId"]),
      class_name: pick(s, ["class_name", "class", "kelas", "className"]),
      parent_name: pick(s, ["parent_name", "guardian_name", "parentName"]),
      parent_phone: pick(s, ["parent_phone", "guardian_phone", "parent_mobile", "parentPhone", "phone"]),
    }))
    .filter((s) => s.external_id && s.name && s.ic_number);
}
