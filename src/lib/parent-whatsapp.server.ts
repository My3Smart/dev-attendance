// Sends WhatsApp messages to parents through the school's local WhatsApp API.

const DEFAULT_URL = "http://192.168.1.6:3000/api/sendText";
const TZ = "Asia/Kuala_Lumpur";

export const TEMPLATES = {
  arrival: (name: string, time: string) =>
    ` ${name} telah mengetik pada ${time} di <school id> . Untuk Melihat Butiran Kehadiran Anak Anda , Sila Log Masuk Ke  https://login.skowla.com`,

  absent: (name: string, date: string) =>
    `Hello parent. Our records show that your child ${name} has not checked in at school today, ${date}. Please contact the school if this is unexpected.`,
};  

export function toChatId(num: string): string | null {
  let d = num.replace(/\D/g, "");

  if (!d) return null;

  // 013... -> 6013...
  if (d.startsWith("0")) {
    d = "6" + d;
  }

  return `${d}@c.us`;
}

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

export async function sendText(chatId: string, text: string) {
  const url =
    process.env["WHATSAPP_API_URL"] ?? DEFAULT_URL;

  const apiKey =
    process.env["WHATSAPP_API_KEY"];

  if (!apiKey) {
    throw new Error(
      "WHATSAPP_API_KEY is not configured"
    );
  }

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

/**
 * Sends to every number.
 * Never throws so attendance check-in is never blocked
 * if WhatsApp is unavailable.
 */
export async function notifyParents(
  numbers: string[],
  text: string
) {
  await Promise.all(
    numbers.map(async (n) => {
      const chatId = toChatId(n);

      if (!chatId) {
        console.error("[whatsapp] Invalid phone number:", n);
        return;
      }

      try {
        await sendText(chatId, text);
        console.log(
          "[whatsapp] Message sent:",
          chatId
        );
      } catch (e) {
        console.error(
          "[whatsapp]",
          chatId,
          e instanceof Error ? e.message : e
        );
      }
    })
  );
}