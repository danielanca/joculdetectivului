import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatNode } from "../data/assistantChatData";
import { CHAT_NODES, FALLBACK_NODE } from "../data/assistantChatData";
import { firestore } from "../firestore";
import { expandEventDates } from "../utils/expandEventDates";
import { sendEmail } from "../notifications/mailer";
import { adminUser } from "../constants/credentials";
import { renderChatbotLeadTemplate } from "../notifications/templates/chatbotLeadTemplate";
import { renderDateCheckTemplate } from "../notifications/templates/dateCheckTemplate";

/** ============================================================
 *  CONSTANTS
 * ============================================================ */
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const MIN_VALID_YEAR = 2024;
const MIN_MONTH = 1;
const MAX_MONTH = 12;
const MIN_DAY = 1;
const MAX_DAY = 31;

const MONTHS_RO = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];

export function parseDate(input: string): string | null {
  const datePartsMatch = input.trim().match(DATE_RE);
  if (!datePartsMatch) return null;

  const dayNumber = parseInt(datePartsMatch[1]);
  const monthNumber = parseInt(datePartsMatch[2]);
  const yearNumber = parseInt(datePartsMatch[3]);

  if (
    monthNumber < MIN_MONTH
    || monthNumber > MAX_MONTH
    || dayNumber < MIN_DAY
    || dayNumber > MAX_DAY
    || yearNumber < MIN_VALID_YEAR
  ) {
    return null;
  }

  return `${yearNumber}-${String(monthNumber).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
}

async function getBookedDates(): Promise<string[]> {
  try {
    const db = firestore();
    const snapshot = await db.collection("adminEvents").get();
    const confirmed = new Set(["confirmat", "finalizat"]);
    const dates: string[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!confirmed.has(data.status)) continue;
      dates.push(...expandEventDates(data));
    }

    return dates;
  } catch (error) {
    console.error("[assistant] getBookedDates failed:", error);
    return [];
  }
}

const router = Router();

let anthropicClient: Anthropic | null = null;
const getAnthropic = (): Anthropic => {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
};

const CHAT_ASSISTANT_SYSTEM = `Ești asistentul virtual Anca Visuals. Răspunzi în română, natural, prietenos și concis (maximum 3 paragrafe).

Informații obligatorii despre noi:
- Suntem bazați în Turda, județul Cluj.
- Facem evenimente oriunde în România și, la cerere, și în străinătate.
- Pentru Turda nu percepem taxă de deplasare; pentru alte locații discutăm costul de deplasare.
- Oferim fotografie, videografie, fotocabină, Video Booth 360 și QR Moments pentru nunți, botezuri, petreceri și evenimente corporate.
- Nu inventa prețuri, disponibilitate sau servicii. Pentru ofertă și rezervare, direcționează clientul la /contact.

Dacă cineva întreabă dacă suntem dintr-un alt oraș/județ (de exemplu Mureș), răspunde clar că suntem din Turda, dar ne deplasăm și facem evenimente oriunde.`;

router.get("/init", (_req, res) => {
  res.json(CHAT_NODES.get("welcome") ?? FALLBACK_NODE);
});

router.post("/transcript", async (req, res) => {
  const messages: unknown[] = Array.isArray(req.body?.messages) ? req.body.messages.slice(-100) : [];
  const validMessages = messages.filter((message: unknown): message is { sender: "bot" | "user"; text: string } => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as Record<string, unknown>;
    return (candidate.sender === "bot" || candidate.sender === "user") && typeof candidate.text === "string";
  });
  if (!validMessages.some(message => message.sender === "user")) return res.status(400).json({ error: "Conversația nu conține mesaje de la client." });
  if (!adminUser.email) return res.status(503).json({ error: "Emailul administratorului nu este configurat." });

  const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const transcript = validMessages.map(message => `<div style="margin:0 0 14px;padding:12px 14px;border-radius:10px;background:${message.sender === "user" ? "#fef3c7" : "#f3f4f6"}"><strong>${message.sender === "user" ? "Client" : "Anca Visuals"}</strong><div style="margin-top:5px;white-space:pre-wrap">${escapeHtml(message.text)}</div></div>`).join("");
  try {
    await sendEmail({ to: adminUser.email, subject: "💬 Transcript conversație chatbot Anca Visuals", html: `<h2 style="color:#111">Conversație chatbot încheiată prin inactivitate</h2><p style="color:#555">Clientul nu a mai trimis mesaje timp de 5 minute.</p>${transcript}` });
    return res.json({ sent: true });
  } catch (error) {
    console.error("[chatbot] transcript email failed:", error);
    return res.status(500).json({ error: "Transcriptul nu a putut fi trimis." });
  }
});

router.post("/message", async (req, res) => {
  const { intentId, text, phone, date } = req.body as { intentId?: string; text?: string; phone?: string; date?: string };

  // Phone number submitted explicitly from the frontend
  if (phone) {
    const dateLabel = date
      ? (() => {
          const [yearNumber, monthNumber, dayNumber] = date.split("-");
          return `${parseInt(dayNumber)} ${MONTHS_RO[parseInt(monthNumber) - 1]} ${yearNumber}`;
        })()
      : "nedefinită";

    sendEmail({
      to: adminUser.email,
      subject: `📞 Lead nou prin chatbot — ${phone}`,
      html: renderChatbotLeadTemplate({ phone, dateLabel }),
    }).then(() => {
      console.log(`[chatbot] lead email sent for ${phone}`);
    }).catch((err: Error) => {
      console.error("[chatbot] email lead failed:", err.message);
    });

    return res.json(CHAT_NODES.get("phone_confirmed") ?? FALLBACK_NODE);
  }

  if (intentId) {
    const node = CHAT_NODES.get(intentId);
    if (node) return res.json(node);
  }

  if (text) {
    const lower = text.toLowerCase();

    // Check date availability (format DD/MM/YYYY)
    const dateKey = parseDate(text.trim());
    if (dateKey) {
      const bookedDates = await getBookedDates();
      const [yearNumber, monthNumber, dayNumber] = dateKey.split("-");
      const humanDate = `${parseInt(dayNumber)} ${MONTHS_RO[parseInt(monthNumber) - 1]} ${yearNumber}`;
      const isBooked = bookedDates.includes(dateKey);
      const node: ChatNode = isBooked
        ? {
            id: "data_ocupata",
            botMessage: `Ne pare rău, data de **${humanDate}** este deja rezervată. 😔\nTe rugăm să alegi o altă dată.`,
            suggestions: [
              { label: "Verifică altă dată", intentId: "check_date" },
              { label: "Alte întrebări", intentId: "welcome" },
            ],
          }
        : {
            id: "date_available",
            botMessage: `✅ Data de **${humanDate}** este disponibilă!\n\nPoți lăsa numărul tău de telefon și te contactăm noi, sau deschide formularul pentru a configura pachetul.`,
            suggestions: [
              { label: "📞 Lasă numărul tău", intentId: "leave_phone" },
              { label: "Deschide formularul →", intentId: "link_contact" },
              { label: "Verifică altă dată", intentId: "check_date" },
            ],
          };

      // Send notification email (fire-and-forget, does not block the response)
      sendEmail({
        to: adminUser.email,
        subject: `📅 Verificare disponibilitate: ${humanDate}`,
        html: renderDateCheckTemplate({ humanDate, isBooked }),
      }).then(() => {
        console.log(`[chatbot] availability email sent for ${humanDate}`);
      }).catch((err: Error) => {
        console.error("[chatbot] email notify failed:", err.message);
      });

      return res.json(node);
    }

    if (/fotocabin|photo.?booth/.test(lower)) {
      return res.json(CHAT_NODES.get("photobooth_pricing") ?? FALLBACK_NODE);
    }
    if (/pret|cost|cat cost|pachet|tarif/.test(lower)) {
      return res.json(CHAT_NODES.get("pricing") ?? FALLBACK_NODE);
    }
    if (/nunta|botez|logodna|cununie|eveniment|servicii|fotografiez|filmez/.test(lower)) {
      return res.json(CHAT_NODES.get("services") ?? FALLBACK_NODE);
    }
    if (/rezerv|disponibil|data|cand/.test(lower)) {
      return res.json(CHAT_NODES.get("booking") ?? FALLBACK_NODE);
    }
    if (/livr|termen|cand primesc|galerie|album/.test(lower)) {
      return res.json(CHAT_NODES.get("delivery") ?? FALLBACK_NODE);
    }
    if (/zona|deplasare|bucuresti|mures|turda|oras|judet|unde lucr|unde sunte|de unde|loca/.test(lower)) {
      return res.json(CHAT_NODES.get("coverage") ?? FALLBACK_NODE);
    }
    if (/cum|proces|functioneaz|pasi|etape/.test(lower)) {
      return res.json(CHAT_NODES.get("process") ?? FALLBACK_NODE);
    }
  }

  if (text && process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await getAnthropic().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: CHAT_ASSISTANT_SYSTEM,
        messages: [{ role: "user", content: text.trim() }],
      });
      const reply = response.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text.trim();
      if (reply) return res.json({ id: "ai_answer", botMessage: reply, suggestions: [{ label: "Vorbește direct cu noi pe WhatsApp", intentId: "whatsapp" }, { label: "Vreau să rezerv", intentId: "booking" }, { label: "Alte întrebări", intentId: "welcome" }] satisfies ChatNode["suggestions"] });
    } catch (error) {
      console.error("[assistant] AI answer failed:", error);
    }
  }

  return res.json(FALLBACK_NODE);
});

export default router;
