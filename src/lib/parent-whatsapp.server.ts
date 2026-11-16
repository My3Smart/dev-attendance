
/**
 * WhatsApp Notification Service
 *
 * Sends WhatsApp messages to parents through the school's local WhatsApp API.
 *
 * HARDCODED TEST STUDENT:
 * NFC Card : 0174146308
 * Student  : Ali bin Abu
 * Parent   : 0122089417
 */

const DEFAULT_URL =
  "https://pda-spots-desert-excessive.trycloudflare.com/api/sendText";

const TZ = "Asia/Kuala_Lumpur";

// ======================================================
// HARDCODED STUDENT CONFIGURATION (not used — data now comes from the database)
// ======================================================

// interface Student {
//   name: string;
//   parentPhone: string;
// }
// 
// const HARDCODED_STUDENTS: Record<string, Student> = {
//   "0174146308": {
//     name: "Ali bin Abu",
//     parentPhone: "0179407006",
//   },
// };

// ======================================================
// MESSAGE TEMPLATES
// ======================================================

export const TEMPLATES = {
  arrival: (name: string, time: string) =>
    `${name} telah mengetik pada ${time} di <school id>. Untuk Melihat Butiran Kehadiran Anak Anda, Sila Log Masuk Ke https://login.skowla.com`,

  absent: (name: string, date: string) =>
    `Hello parent. Our records show that your child ${name} has not checked in at school today, ${date}. Please contact the school if this is unexpected.`,
};

// ======================================================
// STUDENT LOOKUP
// ======================================================

// export function getHardcodedStudent(
//   cardNumber: string
// ): Student | null {
//   const card = cardNumber.replace(/\D/g, "");
// 
//   return HARDCODED_STUDENTS[card] ?? null;
// }

// ======================================================
// WHATSAPP CHAT ID
// ======================================================

export function toChatId(num: string): string | null {
  let d = num.replace(/\D/g, "");

  if (!d) return null;

  // Malaysian phone number: 0123456789 -> 60123456789
  if (d.startsWith("0")) {
    d = "6" + d;
  }

  return `${d}@c.us`;
}

// ======================================================
// DATE AND TIME
// ======================================================

export function arrivalTime(date = new Date()) {
  return date.toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function absentDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ======================================================
// SEND WHATSAPP MESSAGE
// ======================================================

export async function sendText(
  chatId: string,
  text: string
) {
  const url =
    process.env["WHATSAPP_API_URL"] || DEFAULT_URL;

  // Fallback so it works even when the server process doesn't load .env (e.g. PM2).
  const apiKey =
    process.env["WHATSAPP_API_KEY"] ||
    "ce7ab0f122e3b05ffa0a4e80dbfccdd6310ab5c8ae9ea30818657ad2eea025a1";

  const res = await fetch(url, {
    method: "POST",

    headers: {
      accept: "application/json",
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },

    signal: AbortSignal.timeout(5000),

    body: JSON.stringify({
      chatId,
      id: null,
      mentions: null,
      reply_to: null,
      text,
      linkPreview: true,
      linkPreviewHighQuality: false,
      session: "default",
    }),
  });

  if (!res.ok) {
    throw new Error(
      `WhatsApp send failed [${res.status}]: ${await res.text()}`
    );
  }
}

// ======================================================
// NOTIFY PARENTS
// ======================================================

export async function notifyParents(
  numbers: string[],
  text: string
) {
  await Promise.all(
    numbers.map(async (number) => {
      const chatId = toChatId(number);

      if (!chatId) {
        console.error(
          "[whatsapp] Invalid phone number:",
          number
        );
        return;
      }

      try {
        await sendText(chatId, text);

        console.log(
          "[whatsapp] Message sent:",
          chatId
        );
      } catch (error) {
        console.error(
          "[whatsapp]",
          chatId,
          error instanceof Error
            ? error.message
            : error
        );
      }
    })
  );
}

// ======================================================
// AUTOMATIC HARDCODED STUDENT NOTIFICATION
// ======================================================

// export async function notifyHardcodedStudentArrival(
//   cardNumber: string
// ): Promise<boolean> {
//   const student = getHardcodedStudent(cardNumber);
// 
//   if (!student) {
//     return false;
//   }
// 
//   const message = TEMPLATES.arrival(
//     student.name,
//     arrivalTime()
//   );
// 
//   console.log(
//     "[attendance] Student detected:",
//     student.name
//   );
// 
//   console.log(
//     "[attendance] Parent number:",
//     student.parentPhone
//   );
// 
//   await notifyParents(
//     [student.parentPhone],
//     message
//   );
// 
//   return true;
// }
