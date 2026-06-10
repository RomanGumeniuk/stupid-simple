// ===================================================================
// Stupid Simple — app state + sync engine
// Local change -> straight to Google (optimistic UI with rollback).
// Remote changes -> polled every 60 s + refreshed after each mutation.
// ===================================================================
import { create } from "zustand";
import {
  GEvent,
  listEvents,
  createEvent,
  patchEvent,
  deleteEvent,
  createBirthday,
  isSignedIn,
  signIn,
  clearTokens,
  hasCreds,
  saveCreds,
} from "./google";

export type ViewMode = "month" | "week" | "day";

export interface Toast {
  id: number;
  kind: "ok" | "err";
  text: string;
}

interface State {
  signedIn: boolean;
  credsReady: boolean;
  connecting: boolean;
  view: ViewMode;
  cursor: Date; // the day we're looking at
  events: GEvent[];
  syncing: boolean;
  lastSync: Date | null;
  toasts: Toast[];
  party: number; // confetti burst id (0 = none)
  modal:
    | { kind: "none" }
    | { kind: "event"; event?: GEvent; presetStart?: Date; presetEnd?: Date; allDay?: boolean }
    | { kind: "birthday" };

  setCreds: (clientId: string, clientSecret: string) => void;
  login: () => Promise<void>;
  logout: () => void;
  setView: (v: ViewMode) => void;
  setCursor: (d: Date) => void;
  goToday: () => void;
  shift: (dir: 1 | -1) => void;
  refresh: () => Promise<void>;
  addEvent: (ev: GEvent) => Promise<void>;
  updateEvent: (id: string, patch: Partial<GEvent>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  addBirthday: (name: string, month: number, day: number) => Promise<void>;
  openModal: (m: State["modal"]) => void;
  closeModal: () => void;
  toast: (kind: Toast["kind"], text: string) => void;
  celebrate: () => void;
}

let toastId = 0;
let partyId = 0;

/** Fetch range: 2 months back, 13 ahead (catches birthdays a year out). */
function fetchRange(cursor: Date): [Date, Date] {
  const min = new Date(cursor.getFullYear(), cursor.getMonth() - 2, 1);
  const max = new Date(cursor.getFullYear(), cursor.getMonth() + 13, 1);
  return [min, max];
}

export const useStore = create<State>((set, get) => ({
  signedIn: isSignedIn(),
  credsReady: hasCreds(),
  connecting: false,
  view: "week",
  cursor: new Date(),
  events: [],
  syncing: false,
  lastSync: null,
  toasts: [],
  party: 0,
  modal: { kind: "none" },

  setCreds: (clientId, clientSecret) => {
    saveCreds({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    set({ credsReady: true });
    get().toast("ok", "API keys saved!");
  },

  login: async () => {
    if (get().connecting) return;
    set({ connecting: true });
    try {
      // Don't leave the button stuck if the user abandons the browser flow
      await Promise.race([
        signIn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Sign-in timed out — try again.")), 180_000)
        ),
      ]);
      set({ signedIn: true });
      get().toast("ok", "Signed in! Syncing…");
      await get().refresh();
    } catch (e) {
      get().toast("err", e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      set({ connecting: false });
    }
  },

  logout: () => {
    clearTokens();
    set({ signedIn: false, events: [] });
  },

  setView: (view) => set({ view }),
  setCursor: (cursor) => {
    set({ cursor });
    void get().refresh();
  },
  goToday: () => get().setCursor(new Date()),

  shift: (dir) => {
    const { view, cursor } = get();
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    get().setCursor(d);
  },

  refresh: async () => {
    if (!get().signedIn || get().syncing) return;
    set({ syncing: true });
    try {
      const [min, max] = fetchRange(get().cursor);
      const events = await listEvents(min, max);
      set({ events, lastSync: new Date() });
    } catch (e) {
      get().toast("err", e instanceof Error ? e.message : "Sync failed");
    } finally {
      set({ syncing: false });
    }
  },

  addEvent: async (ev) => {
    // optimistic
    const temp: GEvent = { ...ev, id: `temp-${Date.now()}` };
    set({ events: [...get().events, temp] });
    try {
      await createEvent(ev);
      get().toast("ok", "Added to Google Calendar 🍬");
      await get().refresh();
    } catch (e) {
      set({ events: get().events.filter((x) => x.id !== temp.id) });
      get().toast("err", e instanceof Error ? e.message : "Couldn't add the event");
    }
  },

  updateEvent: async (id, patch) => {
    const prev = get().events;
    set({ events: prev.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
    try {
      await patchEvent(id, patch);
      get().toast("ok", "Changes saved");
      await get().refresh();
    } catch (e) {
      set({ events: prev });
      get().toast("err", e instanceof Error ? e.message : "Couldn't save changes");
    }
  },

  removeEvent: async (id) => {
    const prev = get().events;
    set({ events: prev.filter((e) => e.id !== id) });
    try {
      await deleteEvent(id);
      get().toast("ok", "Event deleted");
    } catch (e) {
      set({ events: prev });
      get().toast("err", e instanceof Error ? e.message : "Couldn't delete the event");
    }
  },

  addBirthday: async (name, month, day) => {
    try {
      await createBirthday(name, month, day);
      get().toast("ok", `${name}'s birthday added — I'll remind you a week before! 🎂`);
      get().celebrate();
      await get().refresh();
    } catch (e) {
      get().toast("err", e instanceof Error ? e.message : "Couldn't add the birthday");
    }
  },

  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: { kind: "none" } }),

  toast: (kind, text) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4000);
  },

  celebrate: () => {
    const id = ++partyId;
    set({ party: id });
    setTimeout(() => {
      if (useStore.getState().party === id) set({ party: 0 });
    }, 2200);
  },
}));

// Poll remote changes every 60 s
setInterval(() => void useStore.getState().refresh(), 60_000);
