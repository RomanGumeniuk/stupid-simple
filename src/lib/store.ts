// ===================================================================
// Stupid Simple — app state + sync engine
// Local change -> straight to Google (optimistic UI with rollback).
// Remote changes -> polled every 60 s + refreshed after each mutation.
// Tasks and settings are local-only (localStorage), not synced.
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
import { fmtDateInput, setHour12 } from "./notify";

export type ViewMode = "month" | "week" | "day";
export type Accent = "bubblegum" | "mango" | "mint" | "berry" | "grape";

export interface Toast {
  id: number;
  kind: "ok" | "err";
  text: string;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export interface Settings {
  defaultView: ViewMode;
  hour12: boolean;
  dark: boolean;
  accent: Accent;
}

const LS_SETTINGS = "ss.settings";
const LS_TODOS = "ss.todos";

const DEFAULT_SETTINGS: Settings = {
  defaultView: "week",
  hour12: false,
  dark: false,
  accent: "bubblegum",
};

function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS_SETTINGS) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadTodos(): Record<string, Todo[]> {
  try {
    return JSON.parse(localStorage.getItem(LS_TODOS) ?? "{}");
  } catch {
    return {};
  }
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
  todos: Record<string, Todo[]>; // keyed by YYYY-MM-DD
  settings: Settings;
  modal:
    | { kind: "none" }
    | { kind: "event"; event?: GEvent; presetStart?: Date; presetEnd?: Date; allDay?: boolean }
    | { kind: "details"; event: GEvent }
    | { kind: "birthday" }
    | { kind: "settings" };

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
  addTodo: (day: Date, text: string) => void;
  toggleTodo: (key: string, id: string) => void;
  editTodo: (key: string, id: string, text: string) => void;
  removeTodo: (key: string, id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
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

const initialSettings = loadSettings();
setHour12(initialSettings.hour12);

export const useStore = create<State>((set, get) => ({
  signedIn: isSignedIn(),
  credsReady: hasCreds(),
  connecting: false,
  view: initialSettings.defaultView,
  cursor: new Date(),
  events: [],
  syncing: false,
  lastSync: null,
  toasts: [],
  party: 0,
  todos: loadTodos(),
  settings: initialSettings,
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

  // --- daily tasks (local-only) ---
  addTodo: (day, text) => {
    const key = fmtDateInput(day);
    const todo: Todo = { id: crypto.randomUUID(), text, done: false };
    const todos = { ...get().todos, [key]: [...(get().todos[key] ?? []), todo] };
    localStorage.setItem(LS_TODOS, JSON.stringify(todos));
    set({ todos });
  },

  toggleTodo: (key, id) => {
    const list = (get().todos[key] ?? []).map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    const todos = { ...get().todos, [key]: list };
    localStorage.setItem(LS_TODOS, JSON.stringify(todos));
    set({ todos });
  },

  editTodo: (key, id, text) => {
    const list = (get().todos[key] ?? []).map((t) => (t.id === id ? { ...t, text } : t));
    const todos = { ...get().todos, [key]: list };
    localStorage.setItem(LS_TODOS, JSON.stringify(todos));
    set({ todos });
  },

  removeTodo: (key, id) => {
    const list = (get().todos[key] ?? []).filter((t) => t.id !== id);
    const todos = { ...get().todos };
    if (list.length) todos[key] = list;
    else delete todos[key];
    localStorage.setItem(LS_TODOS, JSON.stringify(todos));
    set({ todos });
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
    setHour12(settings.hour12);
    set({ settings });
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

// Expose the store in dev so the UI can be driven from the console/tests
if (import.meta.env.DEV) {
  (window as unknown as { __store?: typeof useStore }).__store = useStore;
}
