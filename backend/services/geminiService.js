import dotenv from "dotenv";

// Thin wrapper around the Gemini API for the barangay AI support chat.
// Requires GEMINI_API_KEY (and optionally GEMINI_MODEL) in your .env.
dotenv.config();

function getGeminiConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  };
}

const BARANGAY_INFO = `Known facts about this barangay — use these exact answers when asked, don't defer to staff for these:
- Office hours: Monday to Thursday, 8:00 AM – 6:00 PM. Closed Friday, Saturday, and Sunday.
- Barangay Clearance requirements: a valid government-issued ID.
- Barangay Indigency Certification requirements: a valid ID.`;

const SYSTEM_PROMPT = `You are the AI assistant for a barangay (local government unit) support chat.
You help residents with questions about barangay services — appointments, complaints, clearances, requirements, and general procedures.

${BARANGAY_INFO}

How to answer:
- If the question matches one of the known facts above, answer directly and confidently with that exact information — no hedging, no "let me connect you with staff" for these.
- For other common, general procedural questions (e.g. how complaints are filed, what an appointment booking looks like, what a document is generally used for), answer using your general knowledge of how Philippine barangay offices typically operate. Most resident questions are common and procedural — answer them directly and helpfully.
- Be concise, warm, and easy to understand. Prefer short answers (2-4 sentences) unless the question needs more detail.
- Only say you don't know and defer to staff for things that genuinely require this specific barangay's own data that isn't listed above — e.g. exact fees, the status of a specific resident's case/request, or anything tied to their personal records. For those, say so honestly and let them know a staff member will follow up with the specifics.
- If the resident explicitly asks for a human/staff member, or raises something urgent, sensitive, or clearly needing a person (disputes, emergencies, personal case details), tell them you're connecting them with a barangay staff member.
- Never invent specific dates, reference numbers, fees, or case statuses you don't actually have — but don't refuse to help just because you lack barangay-specific numbers. Give the general answer, then note which exact detail the resident should confirm with staff.
- Do not respond with a generic "a staff member will follow up" brush-off unless the question truly needs this barangay's specific records — that should be the exception, not the default.`;

/**
 * Generate an AI reply for a resident's message.
 * @param {Array<{sender: string, text: string}>} history - recent messages, oldest first
 * @returns {Promise<string>} the AI's reply text
 */
export async function generateAIReply(history) {
  const { apiKey, model } = getGeminiConfig();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = history
    .filter(m => m.text && m.text.trim())
    .map(m => ({
      role:  m.sender === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: { maxOutputTokens: 300, temperature: 0.4 },
  };

  const res = await fetch(geminiUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  const finishReason = data?.candidates?.[0]?.finishReason;

  if (!text.trim()) {
    console.warn("[geminiService] Empty reply from Gemini. finishReason:", finishReason, "raw:", JSON.stringify(data));
  }

  return text.trim() ||
    "Sorry, I couldn't come up with a reply just now. A staff member will follow up with you shortly.";
}