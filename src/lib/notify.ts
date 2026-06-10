// ===================================================================
// Stupid Simple — desktop notifications + date helpers
// ===================================================================
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { GEvent, isBirthday } from "./google";

// --- DATES -------------------------------------------------------------
export const DAY_MS = 86_400_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
export function eventStart(e: GEvent): Date {
  return e.start.dateTime ? new Date(e.start.dateTime) : new Date(e.start.date + "T00:00:00");
}
export function eventEnd(e: GEvent): Date {
  return e.end.dateTime ? new Date(e.end.dateTime) : new Date(e.end.date + "T00:00:00");
}
export function isAllDay(e: GEvent): boolean {
  return !!e.start.date;
}
/** Whether the event overlaps the given day. */
export function touchesDay(e: GEvent, day: Date): boolean {
  const d0 = startOfDay(day).getTime();
  const d1 = d0 + DAY_MS;
  const s = eventStart(e).getTime();
  const en = eventEnd(e).getTime();
  return s < d1 && en > d0;
}
let hour12 = false;
/** Set by the store from settings — affects all displayed times. */
export function setHour12(v: boolean): void {
  hour12 = v;
}
export function fmtTime(d: Date): string {
  return d.toLocaleTimeString(hour12 ? "en-US" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  });
}
export function fmtDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
export function fmtTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday of the week containing d. */
export function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - dow);
  return x;
}

// --- NOTIFICATIONS ------------------------------------------------------
let granted = false;
const fired = new Set<string>(); // keys of notifications already sent

export async function initNotifications(): Promise<void> {
  granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
}

/**
 * Called every 30 s: sends a notification when an event starts
 * (and 10 minutes before), plus a cake one for birthdays.
 */
export function checkNotifications(events: GEvent[]): void {
  if (!granted) return;
  const now = Date.now();

  for (const e of events) {
    if (!e.id || isAllDay(e)) continue;
    const start = eventStart(e).getTime();

    for (const [lead, label] of [
      [10 * 60_000, "in 10 minutes"],
      [0, "starting now"],
    ] as const) {
      const t = start - lead;
      const key = `${e.id}:${lead}`;
      if (now >= t && now < t + 60_000 && !fired.has(key)) {
        fired.add(key);
        sendNotification({
          title: isBirthday(e) ? "🎂 Stupid Simple" : "🍬 Stupid Simple",
          body: `${e.summary ?? "Event"} — ${label}`,
        });
      }
    }
  }

  // Birthday today — one reminder after the app starts
  for (const e of events) {
    if (!e.id || !isBirthday(e)) continue;
    const s = eventStart(e);
    const key = `bday:${e.id}:${s.toDateString()}`;
    if (sameDay(s, new Date()) && !fired.has(key)) {
      fired.add(key);
      sendNotification({
        title: "🎂 Birthday today!",
        body: e.summary ?? "Someone's celebrating — don't forget to send wishes!",
      });
    }
  }
}
