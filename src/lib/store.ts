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
import { aiParse } from "./ai";

export type ViewMode = "month" | "week" | "day" | "tasks";
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
  /** Height of one hour in the week/day grid, px. */
  zoom: number;
  /** Collapsed sidebar cards, by card id. */
  collapsed: Record<string, boolean>;
  /** Gemini API key for AI quick-add (free at aistudio.google.com/apikey). */
  aiKey: string;
  aiModel: string;
  /** Sidebar width in px (drag the right edge). */
  sidebarWidth: number;
}

export const SIDEBAR_MIN = 230;
export const SIDEBAR_MAX = 480;

export const ZOOM_MIN = 28;
export const ZOOM_MAX = 104;

/** Todos under this key have no date yet. */
export const BACKLOG_KEY = "backlog";

const LS_SETTINGS = "ss.settings";
const LS_TODOS = "ss.todos";

const DEFAULT_SETTINGS: Settings = {
  defaultView: "week",
  hour12: false,
  dark: false,
  accent: "bubblegum",
  zoom: 52,
  collapsed: {},
  aiKey: "",
  aiModel: "gemini-2.5-flash",
  sidebarWidth: 280,
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
  /** Mobile drawer state (narrow screens only). */
  sidebarOpen: boolean;
  toggleSidebar: () => void;
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
  addTodo: (key: string, text: string) => void;
  toggleTodo: (key: string, id: string) => void;
  editTodo: (key: string, id: string, text: string) => void;
  removeTodo: (key: string, id: string) => void;
  /** Moves a todo between days / the backlog. */
  moveTodo: (fromKey: string, id: string, toKey: string) => void;
  toggleCollapsed: (cardId: string) => void;
  aiAdd: (prompt: string) => Promise<boolean>;
  aiBusy: boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  setZoom: (px: number) => void;
  /** pass persist=false during a drag, true on the final mouseup */
  setSidebarWidth: (px: number, persist?: boolean) => void;
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

/** Narrow (phone) screens start in day view — week/month don't fit. */
const isNarrow = typeof window !== "undefined" && window.innerWidth < 700;

export const useStore = create<State>((set, get) => ({
  signedIn: isSignedIn(),
  credsReady: hasCreds(),
  connecting: false,
  sidebarOpen: false,
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  view: isNarrow && initialSettings.defaultView !== "tasks" ? "day" : initialSettings.defaultView,
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

  setView: (view) => set({ view, sidebarOpen: false }),
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

  aiBusy: false,

  // --- daily tasks + backlog (local-only) ---
  addTodo: (key, text) => {
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

  moveTodo: (fromKey, id, toKey) => {
    if (fromKey === toKey) return;
    const todo = (get().todos[fromKey] ?? []).find((t) => t.id === id);
    if (!todo) return;
    const fromList = (get().todos[fromKey] ?? []).filter((t) => t.id !== id);
    const todos = { ...get().todos, [toKey]: [...(get().todos[toKey] ?? []), todo] };
    if (fromList.length) todos[fromKey] = fromList;
    else delete todos[fromKey];
    localStorage.setItem(LS_TODOS, JSON.stringify(todos));
    set({ todos });
  },

  toggleCollapsed: (cardId) => {
    const collapsed = { ...get().settings.collapsed, [cardId]: !get().settings.collapsed[cardId] };
    get().updateSettings({ collapsed });
  },

  aiAdd: async (prompt) => {
    const { aiKey, aiModel } = get().settings;
    if (!aiKey) {
      get().toast("err", "Add your (free) Gemini API key in Settings first.");
      return false;
    }
    if (get().aiBusy) return false;
    set({ aiBusy: true });
    try {
      const items = await aiParse(prompt, aiKey, aiModel);
      let events = 0;
      let tasks = 0;
      for (const it of items) {
        if (it.action === "task") {
          get().addTodo(it.date ?? BACKLOG_KEY, it.title);
          tasks++;
        } else {
          const date = it.date ?? fmtDateInput(new Date());
          if (it.startTime) {
            const start = new Date(`${date}T${it.startTime}:00`);
            const end = it.endTime
              ? new Date(`${date}T${it.endTime}:00`)
              : new Date(start.getTime() + 60 * 60_000);
            if (end <= start) end.setDate(end.getDate() + 1); // crosses midnight
            await get().addEvent({
              summary: it.title,
              description: it.description,
              colorId: "9",
              start: { dateTime: start.toISOString() },
              end: { dateTime: end.toISOString() },
            });
          } else {
            const endExcl = new Date(`${date}T00:00:00`);
            endExcl.setDate(endExcl.getDate() + 1);
            await get().addEvent({
              summary: it.title,
              description: it.description,
              colorId: "9",
              start: { date },
              end: { date: fmtDateInput(endExcl) },
            });
          }
          events++;
        }
      }
      const bits = [
        events ? `${events} event${events > 1 ? "s" : ""}` : "",
        tasks ? `${tasks} task${tasks > 1 ? "s" : ""}` : "",
      ].filter(Boolean).join(" + ");
      get().toast("ok", `✨ Added ${bits}`);
      return true;
    } catch (e) {
      get().toast("err", e instanceof Error ? e.message : "AI quick-add failed");
      return false;
    } finally {
      set({ aiBusy: false });
    }
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
    setHour12(settings.hour12);
    set({ settings });
  },

  setZoom: (px) => {
    const zoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, px)));
    if (zoom !== get().settings.zoom) get().updateSettings({ zoom });
  },

  setSidebarWidth: (px, persist = true) => {
    const sidebarWidth = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, px)));
    if (persist) {
      get().updateSettings({ sidebarWidth });
    } else if (sidebarWidth !== get().settings.sidebarWidth) {
      // live update during drag without hammering localStorage
      set({ settings: { ...get().settings, sidebarWidth } });
    }
  },

  // close the mobile drawer so modals never end up underneath it
  openModal: (modal) => set({ modal, sidebarOpen: false }),
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
