import { useMemo } from "react";
import { useStore } from "../lib/store";
import { isBirthday, birthdayName } from "../lib/google";
import { eventStart, startOfDay, DAY_MS } from "../lib/notify";

export default function Sidebar() {
  const { events, openModal, syncing, lastSync, refresh, logout } = useStore();

  const birthdays = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return events
      .filter(isBirthday)
      .map((e) => {
        const days = Math.round((startOfDay(eventStart(e)).getTime() - today) / DAY_MS);
        return { e, days };
      })
      .filter((b) => b.days >= 0 && b.days <= 365)
      .sort((a, b) => a.days - b.days)
      .slice(0, 8);
  }, [events]);

  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="bean" aria-hidden />
        Stupid Simple
      </div>

      <button className="primary" onClick={() => openModal({ kind: "event" })}>
        + New event
      </button>
      <button className="mango" onClick={() => openModal({ kind: "birthday" })}>
        🎂 Add birthday
      </button>

      <div className="card">
        <h3>🎉 Upcoming birthdays</h3>
        {birthdays.length === 0 && (
          <div className="empty">All quiet… add a birthday and I'll remind you a week before!</div>
        )}
        {birthdays.map(({ e, days }) => {
          const when = days === 0 ? "TODAY!" : days === 1 ? "tomorrow" : `in ${days} days`;
          return (
            <div className="bday-item" key={e.id}>
              <span>🎂</span>
              <span>{birthdayName(e)}</span>
              {days <= 7 ? <span className="soon">{when}</span> : <span className="when">{when}</span>}
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>🔄 Sync</h3>
        <div className="sync-row">
          <span className={`sync-dot ${syncing ? "busy" : ""}`} />
          {syncing
            ? "Syncing with Google…"
            : lastSync
              ? `Last sync: ${lastSync.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
              : "Not synced yet"}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="ghost" onClick={() => void refresh()}>Refresh</button>
          <button className="ghost" onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="empty" style={{ marginTop: "auto", fontSize: 11.5 }}>
        Changes go to Google Calendar instantly,<br />and come back every minute. 🍬
      </div>
    </aside>
  );
}
