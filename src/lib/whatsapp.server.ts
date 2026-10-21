// WhatsApp API: sends parent notifications through the Lovable connector gateway.
// Business-initiated messages need Meta-approved templates (names set on the Settings page).

const GATEWAY_URL = "http://192.168.1.6:3000";

export function whatsappConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["WHATSAPP_API_KEY"]);
}

function headers() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const wa = process.env["WHATSAPP_API_KEY"];
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!wa) throw new Error("WhatsApp is not connected yet");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": wa, "Content-Type": "application/json" };
}

export async function sendTemplate(opts: {
  to: string;
  template: string;
  language: string;
  params: string[];
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: opts.to,
        type: "template",
        template: {
          name: opts.template,
          language: { code: opts.language },
          components: [{ type: "body", parameters: opts.params.map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`WhatsApp send failed [${res.status}]: ${body}`);
      return { ok: false, error: `WhatsApp ${res.status}: ${body.slice(0, 500)}` };
    }
    const json = JSON.parse(body) as { messages?: { id: string }[] };
    const id = json.messages?.[0]?.id;
    if (!id) return { ok: false, error: `No message id returned: ${body.slice(0, 300)}` };
    return { ok: true, messageId: id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Creates the two notification templates in the WhatsApp Business account (Meta reviews them). */
export async function createNotificationTemplates(arrival: string, absent: string, language: string) {
  const defs = [
    {
      name: arrival,
      text: "Assalamualaikum and hello. Your child {{1}} has arrived safely at school at {{2}} today. Thank you for your cooperation.",
      example: [["Aisyah binti Ahmad", "7:15 AM"]],
    },
    {
      name: absent,
      text: "Hello parent. Our records show that your child {{1}} has not checked in at school today, {{2}}. Please contact the school if this is unexpected.",
      example: [["Aisyah binti Ahmad", "Monday 5 October"]],
    },
  ];
  const results: { name: string; ok: boolean; detail: string }[] = [];
  for (const d of defs) {
    const res = await fetch(`${GATEWAY_URL}/message_templates`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: d.name,
        language,
        category: "UTILITY",
        components: [{ type: "BODY", text: d.text, example: { body_text: d.example } }],
      }),
    });
    const body = await res.text();
    results.push({ name: d.name, ok: res.ok, detail: body.slice(0, 300) });
  }
  return results;
}
