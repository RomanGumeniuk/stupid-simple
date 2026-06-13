// ===================================================================
// Stupid Simple — Google Calendar API client (OAuth loopback + REST)
// All HTTP traffic goes through the Tauri plugin (bypasses webview CORS).
//
// NOTE ON AUTH: Google's Device Flow does NOT support the Calendar
// scope (only Drive/YouTube/profile scopes are allowed), so desktop
// apps must use the loopback flow: bind 127.0.0.1:<random port>,
// open the system browser, catch the redirect. This requires the
// OAuth client in Google Cloud Console to be of type "Desktop app" —
// a "Web application" client rejects the random port with
// "Error 400: redirect_uri_mismatch".
// ===================================================================
import { fetch as tFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

// --- CREDENTIALS ----------------------------------------------------
// Two sources, in priority order:
//   1. Keys pasted in the app (localStorage) — works with the installer
//      from GitHub Releases, no rebuild needed.
//   2. Build-time env vars (VITE_GOOGLE_CLIENT_ID / _SECRET from .env).
const LS_CREDS = "ss.creds";

export interface Creds {
  clientId: string;
  clientSecret: string;
}

export function getCreds(): Creds | null {
  // Always trim — keys baked in at build time (or pasted) can carry a stray
  // newline/space, which makes Google reject them with "OAuth client was not
  // found" (invalid_client).
  const clean = (c: Creds): Creds | null => {
    const clientId = c.clientId?.trim();
    const clientSecret = c.clientSecret?.trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  };

  const raw = localStorage.getItem(LS_CREDS);
  if (raw) {
    try {
      const c = clean(JSON.parse(raw) as Creds);
      if (c) return c;
    } catch {
      /* corrupted — fall through to env */
    }
  }
  return clean({
    clientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ?? "",
    clientSecret: (import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string) ?? "",
  });
}

export function saveCreds(c: Creds): void {
  localStorage.setItem(LS_CREDS, JSON.stringify(c));
}

export function hasCreds(): boolean {
  return getCreds() !== null;
}

const SCOPES = "https://www.googleapis.com/auth/calendar";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const API = "https://www.googleapis.com/calendar/v3";

// --- TYPES ----------------------------------------------------------
export interface GDate {
  date?: string; // all-day: YYYY-MM-DD
  dateTime?: string; // timed: RFC3339
  timeZone?: string;
}

export interface GEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  colorId?: string;
  start: GDate;
  end: GDate;
  recurrence?: string[];
  reminders?: {
    useDefault: boolean;
    overrides?: { method: "popup" | "email"; minutes: number }[];
  };
  extendedProperties?: { private?: Record<string, string> };
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
}

// --- TOKEN STORAGE ---------------------------------------------------
const LS_TOKENS = "ss.tokens";
const LS_TOKENS_LEGACY = "zelek.tokens";

function loadTokens(): Tokens | null {
  const raw = localStorage.getItem(LS_TOKENS) ?? localStorage.getItem(LS_TOKENS_LEGACY);
  return raw ? (JSON.parse(raw) as Tokens) : null;
}
function saveTokens(t: Tokens) {
  localStorage.setItem(LS_TOKENS, JSON.stringify(t));
}
export function clearTokens() {
  localStorage.removeItem(LS_TOKENS);
  localStorage.removeItem(LS_TOKENS_LEGACY);
}
export function isSignedIn(): boolean {
  return loadTokens() !== null;
}

// --- OAUTH (desktop loopback) -----------------------------------------
// 1. Rust binds a listener on 127.0.0.1:<random port>
// 2. We open the system browser with Google's consent screen
// 3. Google redirects to localhost — Rust catches ?code=...
// 4. We exchange the code for tokens (here, in TS)
export async function signIn(): Promise<void> {
  const creds = getCreds();
  if (!creds) throw new Error("Add your Google API keys first.");

  const port = await invoke<number>("oauth_start");
  const redirect = `http://127.0.0.1:${port}`;
  const state = crypto.randomUUID();

  const url =
    `${AUTH_URL}?client_id=${encodeURIComponent(creds.clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline&prompt=consent&state=${state}`;

  await openUrl(url);

  const result = await invoke<{ code: string; state: string }>("oauth_wait");
  if (result.state !== state) throw new Error("OAuth state mismatch — sign-in aborted.");

  const body = new URLSearchParams({
    code: result.code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });

  const res = await tFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const data = await res.json();

  saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
}

async function getAccessToken(): Promise<string> {
  const t = loadTokens();
  if (!t) throw new Error("Not signed in");
  if (Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) throw new Error("No refresh token — please sign in again");

  const creds = getCreds();
  if (!creds) {
    throw new Error("Missing Google API keys — please sign in again");
  }

  const body = new URLSearchParams({
    refresh_token: t.refresh_token,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await tFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    clearTokens();
    throw new Error("Session expired — please sign in again");
  }
  const data = await res.json();
  const fresh: Tokens = {
    access_token: data.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  saveTokens(fresh);
  return fresh.access_token;
}

// --- API CALLS ---------------------------------------------------------
async function gcall<T>(path: string, init?: RequestInit & { body?: string }): Promise<T> {
  const token = await getAccessToken();
  const res = await tFetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google API ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Fetches events (expanded recurring occurrences) in a time range. */
export async function listEvents(timeMin: Date, timeMax: Date): Promise<GEvent[]> {
  const items: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gcall<{ items?: GEvent[]; nextPageToken?: string }>(
      `/calendars/primary/events?${params}`
    );
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items.filter((e) => e.status !== "cancelled");
}

export async function createEvent(ev: GEvent): Promise<GEvent> {
  return gcall<GEvent>(`/calendars/primary/events`, {
    method: "POST",
    body: JSON.stringify(ev),
  });
}

export async function patchEvent(id: string, patch: Partial<GEvent>): Promise<GEvent> {
  return gcall<GEvent>(`/calendars/primary/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteEvent(id: string): Promise<void> {
  await gcall<void>(`/calendars/primary/events/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- BIRTHDAYS ----------------------------------------------------------
// A birthday = a yearly all-day event with a reminder 7 days before and
// on the day itself. Tagged in extendedProperties so the app can tell it
// apart from regular events. (The legacy "zelek" tag is still recognized.)
export async function createBirthday(name: string, month: number, day: number): Promise<GEvent> {
  const now = new Date();
  let year = now.getFullYear();
  const thisYear = new Date(year, month - 1, day);
  if (thisYear < new Date(now.getFullYear(), now.getMonth(), now.getDate())) year += 1;

  const startStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const endDate = new Date(year, month - 1, day + 1);
  const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(
    endDate.getDate()
  ).padStart(2, "0")}`;

  // The API requires a timeZone on recurring events — without it the
  // insert fails with 400 and the birthday silently never appears.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return createEvent({
    summary: `🎂 Birthday: ${name}`,
    start: { date: startStr, timeZone: tz },
    end: { date: endStr, timeZone: tz },
    recurrence: ["RRULE:FREQ=YEARLY"],
    colorId: "4",
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 7 * 24 * 60 }, // a week before
        { method: "popup", minutes: 0 }, // on the day
      ],
    },
    extendedProperties: { private: { ss: "birthday", ssName: name } },
  });
}

export function isBirthday(e: GEvent): boolean {
  const p = e.extendedProperties?.private;
  return p?.ss === "birthday" || p?.zelek === "birthday";
}

/** Display name for a birthday event (works for legacy events too). */
export function birthdayName(e: GEvent): string {
  const p = e.extendedProperties?.private;
  return (
    p?.ssName ??
    p?.zelekName ??
    (e.summary ?? "").replace(/^🎂 (Birthday|Urodziny): /, "")
  );
}
