import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "./lib/store";
import { initNotifications, checkNotifications, MONTHS, mondayOf, DAY_MS } from "./lib/notify";
import Sidebar from "./components/Sidebar";
import MonthView from "./components/MonthView";
import WeekView from "./components/WeekView";
import { EventModal, BirthdayModal, SettingsModal } from "./components/Modals";

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
  const { signedIn, view, setView, cursor, shift, goToday, refresh, events, modal, syncing } =
    useStore();
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

  if (!signedIn) return <LoginHero />;

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <div className="topbar">
          <button className="icon" aria-label="Back" onClick={() => shift(-1)}>←</button>
          <button className="icon" aria-label="Forward" onClick={() => shift(1)}>→</button>
          <button className="mint" onClick={goToday}>Today</button>
          <h2>{title(cursor, view)}</h2>
          <div className="view-switch" role="tablist">
            {([["day", "Day"], ["week", "Week"], ["month", "Month"]] as const).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={view === v}
                className={view === v ? "active" : ""} onClick={() => setView(v)}>
                {l}
              </button>
            ))}
          </div>
          {syncing && <div className="sync-stripe" aria-hidden />}
        </div>

        <div className="view-anim" key={view}>
          {view === "month" && <MonthView />}
          {view === "week" && <WeekView />}
          {view === "day" && <WeekView singleDay />}
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
      {modal.kind === "birthday" && <BirthdayModal />}
      {modal.kind === "settings" && <SettingsModal />}

      <Confetti />
      <Toasts />
    </div>
  );
}
