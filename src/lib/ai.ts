// ===================================================================
// Stupid Simple — AI quick-add
// Turns natural language ("gym tomorrow 18:00") into events/tasks.
// Provider: Google Gemini for now (free API key from
// https://aistudio.google.com/apikey) — the interface is provider-
// agnostic so something else can slot in later.
// ===================================================================
import { fetch as tFetch } from "@tauri-apps/plugin-http";

export interface AiItem {
  action: "event" | "task";
  title: string;
  /** YYYY-MM-DD; tasks without a date land in the backlog */
  date?: string;
  /** HH:MM, 24h — only for events */
  startTime?: string;
  endTime?: string;
  description?: string;
}

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function instructions(): string {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  return `You convert a calendar request into JSON. Today is ${weekday}, ${today}.
Reply with ONLY a JSON array of items, each item:
{"action":"event"|"task","title":string,"date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","description":string}
Rules:
- "event" = something happening at a time/day (meeting, gym, dentist). Include "date"; include startTime/endTime when a time is given or implied (default duration 1 hour). No times = all-day event.
- "task" = a to-do (buy milk, email someone). Include "date" only if the user names a day; otherwise omit it (it goes to the backlog).
- Resolve relative dates ("tomorrow", "next Friday") against today.
- Keep titles short; put extra details in "description". Omit fields you don't need. Use the user's language for title/description.`;
}

/** Sends the prompt to Gemini and returns parsed items. */
export async function aiParse(prompt: string, apiKey: string, model: string): Promise<AiItem[]> {
  const res = await tFetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${instructions()}\n\nRequest: ${prompt}` }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error("AI key rejected — check the API key in Settings.");
  }
  if (res.status === 429) {
    throw new Error("AI rate limit hit — try again in a minute.");
  }
  if (!res.ok) throw new Error(`AI request failed (${res.status})`);

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  let parsed: unknown;
  try {
    // strip accidental code fences, just in case
    parsed = JSON.parse(text.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim());
  } catch {
    throw new Error("AI returned something unparseable — try rephrasing.");
  }

  const arr = (Array.isArray(parsed) ? parsed : [parsed]) as Partial<AiItem>[];
  const items = arr
    .filter((it) => it && typeof it.title === "string" && it.title.trim())
    .map((it) => ({
      action: it.action === "task" ? ("task" as const) : ("event" as const),
      title: it.title!.trim(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(it.date ?? "") ? it.date : undefined,
      startTime: /^\d{2}:\d{2}$/.test(it.startTime ?? "") ? it.startTime : undefined,
      endTime: /^\d{2}:\d{2}$/.test(it.endTime ?? "") ? it.endTime : undefined,
      description: typeof it.description === "string" && it.description.trim()
        ? it.description.trim()
        : undefined,
    }));
  if (!items.length) throw new Error("AI didn't find anything to add — try rephrasing.");
  return items;
}
