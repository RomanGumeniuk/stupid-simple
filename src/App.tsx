import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "./lib/store";
import { initNotifications, checkNotifications, MONTHS, mondayOf, DAY_MS } from "./lib/notify";
import Sidebar from "./components/Sidebar";
import MonthView from "./components/MonthView";
import WeekView from "./components/WeekView";
import TasksView from "./components/TasksView";
import { EventModal, BirthdayModal, SettingsModal, DetailsModal } from "./components/Modals";

/** Visible drag strip between the sidebar and the calendar. */
function SidebarGutter() {
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);
  return (
    <div
      className="sb-gutter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      title="Drag to resize the sidebar"
      onMouseDown={(e) => {
        e.preventDefault();
        document.body.classList.add("resizing");
        const move = (ev: MouseEvent) => setSidebarWidth(ev.clientX, false);
        const up = (ev: MouseEvent) => {
          setSidebarWidth(ev.clientX, true); // persist once, at the end
          document.body.classList.remove("resizing");
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      }}
    >
      <span className="grip" aria-hidden />
    </div>
  );
}

/** Applies dark mode + accent color to the document root. */
function useTheme() {
  const settings = useStore((s) => s.settings);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.dark ? "dark" : "light";
    document.documentElement.dataset.accent = settings.accent;
  }, [settings.dark, settings.accent]);
}

const SETUP_GUIDE_URL =
  "https://github.com/RomanGumeniuk/stupid-simple#google-setup-one-time-5-minutes";

function title(cursor: Date, view: string): string {
  if (view === "tasks") return "Things to do";
  if (view === "month") return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  if (view === "day") {
    return cursor.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  }
  const mon = mondayOf(cursor);
  const sun = new Date(mon.getTime() + 6 * DAY_MS);
  return `${mon.getDate()} ${MONTHS[mon.getMonth()].slice(0, 3)} – ${sun.getDate()} ${MONTHS[sun.getMonth()].slice(0, 3)} ${sun.getFullYear()}`;
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toastmsg ${t.kind === "err" ? "err" : ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Short-lived confetti burst, re-keyed per celebration. */
function Confetti() {
  const party = useStore((s) => s.party);
  if (!party) return null;
  return (
    <div className="confetti" key={party} aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className={`cf cf-${i % 5}`}
          style={{
            left: `${(i * 37 + 13) % 100}%`,
            animationDelay: `${(i % 9) * 70}ms`,
            animationDuration: `${1.4 + (i % 5) * 0.18}s`,
          }}
        />
      ))}
    </div>
  );
}

/** One-time Google API key setup shown on the login screen. */
function KeySetup({ onSaved }: { onSaved: () => void }) {
  const setCreds = useStore((s) => s.setCreds);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const valid = clientId.trim().endsWith(".apps.googleusercontent.com") && clientSecret.trim().length > 0;

  return (
    <div className="key-setup">
      <h3>🔑 One-time setup</h3>
      <p>
        Stupid Simple talks to <em>your</em> Google account, so it needs your own
        (free) Google API keys. Takes ~5 minutes.
      </p>
      <button className="ghost link" onClick={() => void openUrl(SETUP_GUIDE_URL)}>
        📖 Open the step-by-step guide
      </button>
      <label htmlFor="cid">Client ID</label>
      <input
        id="cid"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        placeholder="…apps.googleusercontent.com"
        spellCheck={false}
      />
      <label htmlFor="csec">Client secret</label>
      <input
        id="csec"
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
        placeholder="GOCSPX-…"
        spellCheck={false}
      />
      <p className="hint">
        Heads-up: create the OAuth client as type <strong>“Desktop app”</strong>.
        A “Web application” client fails with <em>Error 400: redirect_uri_mismatch</em>.
      </p>
      <button
        className="primary"
        disabled={!valid}
        onClick={() => {
          setCreds(clientId, clientSecret);
          onSaved();
        }}
      >
        Save keys
      </button>
    </div>
  );
}

function LoginHero() {
  const { credsReady, connecting, login } = useStore();
  const [editKeys, setEditKeys] = useState(false);
  const showSetup = !credsReady || editKeys;

  return (
    <div className="login-hero">
      <span className="float-candy fc-1" aria-hidden />
      <span className="float-candy fc-2" aria-hidden />
      <span className="float-candy fc-3" aria-hidden />
      <span className="float-candy fc-4" aria-hidden />
      <div className="big-bean">
        <span className="smile" />
      </div>
      <h1>Stupid Simple</h1>
      <p>
        A stupidly simple candy calendar for your PC. Connect your Google account
        and events, birthdays and time blocks sync both ways.
      </p>
      {showSetup ? (
        <KeySetup onSaved={() => setEditKeys(false)} />
      ) : (
        <>
          <button className="primary" disabled={connecting} onClick={() => void login()}>
            {connecting ? "Waiting for Google…" : "Connect Google Calendar"}
          </button>
          {connecting && (
            <p className="connect-hint">
              Finish signing in in the browser tab that just opened.
              If Google says <em>“Access blocked”</em> or <em>“app has not been
              verified”</em>, add your e-mail under <strong>OAuth consent screen
              → Test users</strong> in Google Cloud Console and try again.
            </p>
          )}
          <button className="ghost link" onClick={() => setEditKeys(true)}>
            Use different API keys
          </button>
        </>
      )}
      {showSetup && credsReady && (
        <button className="ghost link" onClick={() => setEditKeys(false)}>
          ← Back
        </button>
      )}
      <Toasts />
    </div>
  );
}

export default function App() {
  const {
    signedIn, view, setView, cursor, shift, goToday, refresh, events, modal,
    syncing, settings, setZoom, sidebarOpen, toggleSidebar,
  } = useStore();
  useTheme();

  useEffect(() => {
    if (!signedIn) return;
    void initNotifications();
    void refresh();
    const t = setInterval(() => checkNotifications(useStore.getState().events), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  useEffect(() => {
    checkNotifications(events);
  }, [events]);

  // keyboard shortcuts: ←/→ navigate, T today, D/W/M views, N new event, Esc close
  useEffect(() => {
    if (!signedIn) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const s = useStore.getState();
      if (e.key === "Escape") {
        if (s.modal.kind !== "none") s.closeModal();
        return;
      }
      if (typing || s.modal.kind !== "none" || e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case "ArrowLeft": s.shift(-1); break;
        case "ArrowRight": s.shift(1); break;
        case "t": case "T": s.goToday(); break;
        case "d": case "D": s.setView("day"); break;
        case "w": case "W": s.setView("week"); break;
        case "m": case "M": s.setView("month"); break;
        case "b": case "B": s.setView("tasks"); break;
        case "n": case "N": s.openModal({ kind: "event" }); break;
        case "+": case "=": s.setZoom(s.settings.zoom + 8); break;
        case "-": case "_": s.setZoom(s.settings.zoom - 8); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signedIn]);

  if (!signedIn) return <LoginHero />;

  return (
    <div className={`app ${sidebarOpen ? "sb-open" : ""}`}>
      <Sidebar />
      <div className="sb-backdrop" onClick={toggleSidebar} aria-hidden />
      <SidebarGutter />
      <main className="main">
        <header className="topbar">
          <button
            className="icon hamburger"
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            onClick={toggleSidebar}
          >
            ☰
          </button>
          {view !== "tasks" && (
            <div className="nav-cluster">
              <button className="mint" onClick={goToday}>Today</button>
              <div className="nav-arrows" role="group" aria-label="Navigate">
                <button aria-label="Back" onClick={() => shift(-1)}>‹</button>
                <button aria-label="Forward" onClick={() => shift(1)}>›</button>
              </div>
            </div>
          )}
          <h2 className="topbar-title">{title(cursor, view)}</h2>
          {(view === "day" || view === "week") && (
            <div className="zoom-ctrl" role="group" aria-label="Grid zoom" title="Zoom the hour grid (Ctrl+scroll or +/-)">
              <button className="icon" aria-label="Zoom out" onClick={() => setZoom(settings.zoom - 8)}>−</button>
              <button className="icon" aria-label="Zoom in" onClick={() => setZoom(settings.zoom + 8)}>+</button>
            </div>
          )}
          <div className="view-switch" role="tablist">
            {([["day", "Day"], ["week", "Week"], ["month", "Month"], ["tasks", "✅ Tasks"]] as const).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={view === v}
                className={view === v ? "active" : ""} onClick={() => setView(v)}>
                {l}
              </button>
            ))}
          </div>
          {syncing && <div className="sync-stripe" aria-hidden />}
        </header>

        <div className="view-anim" key={view}>
          {view === "month" && <MonthView />}
          {view === "week" && <WeekView />}
          {view === "day" && <WeekView singleDay />}
          {view === "tasks" && <TasksView />}
        </div>
      </main>

      {modal.kind === "event" && (
        <EventModal
          event={modal.event}
          presetStart={modal.presetStart}
          presetEnd={modal.presetEnd}
          presetAllDay={modal.allDay}
        />
      )}
      {modal.kind === "details" && <DetailsModal event={modal.event} />}
      {modal.kind === "birthday" && <BirthdayModal />}
      {modal.kind === "settings" && <SettingsModal />}

      <Confetti />
      <Toasts />
    </div>
  );
}
