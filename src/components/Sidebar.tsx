import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { isBirthday, birthdayName } from "../lib/google";
import { eventStart, startOfDay, fmtDateInput, DAY_MS } from "../lib/notify";

function TasksCard() {
  const { cursor, todos, addTodo, toggleTodo, editTodo, removeTodo } = useStore();
  const [draft, setDraft] = useState("");

  const key = fmtDateInput(cursor);
  const dayTodos = todos[key] ?? [];
  const isToday = key === fmtDateInput(new Date());
  const dayLabel = isToday
    ? "today"
    : cursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  function add() {
    const text = draft.trim();
    if (!text) return;
    addTodo(cursor, text);
    setDraft("");
  }

  return (
    <div className="card">
      <h3>
        ✅ Tasks <span className="task-date">{dayLabel}</span>
      </h3>
      {dayTodos.length === 0 && (
        <div className="empty">Nothing planned — add a task below!</div>
      )}
      {dayTodos.map((t) => (
        <div className={`todo-item ${t.done ? "done" : ""}`} key={t.id}>
          <button
            className="todo-check"
            aria-label={t.done ? "Mark as not done" : "Mark as done"}
            onClick={() => toggleTodo(key, t.id)}
          >
            {t.done ? "✓" : ""}
          </button>
          <input
            className="todo-text"
            value={t.text}
            onChange={(e) => editTodo(key, t.id, e.target.value)}
            onBlur={(e) => { if (!e.target.value.trim()) removeTodo(key, t.id); }}
          />
          <button className="todo-del" aria-label="Delete task" onClick={() => removeTodo(key, t.id)}>
            ×
          </button>
        </div>
      ))}
      <form
        className="todo-add"
        onSubmit={(e) => { e.preventDefault(); add(); }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isToday ? "Add a task for today…" : "Add a task for this day…"}
        />
        <button type="submit" className="mint" disabled={!draft.trim()}>+</button>
      </form>
    </div>
  );
}

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
        <button
          className="ghost icon settings-btn"
          aria-label="Settings"
          title="Settings"
          onClick={() => openModal({ kind: "settings" })}
        >
          ⚙️
        </button>
      </div>

      <button className="primary" onClick={() => openModal({ kind: "event" })}>
        + New event
      </button>
      <button className="mango" onClick={() => openModal({ kind: "birthday" })}>
        🎂 Add birthday
      </button>

      <TasksCard />

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
