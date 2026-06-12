import { ReactNode, useMemo, useState } from "react";
import { useStore, BACKLOG_KEY } from "../lib/store";
import { isBirthday, birthdayName } from "../lib/google";
import { eventStart, startOfDay, fmtDateInput, DAY_MS } from "../lib/notify";
import { TodoRow, AddTodoForm } from "./Todos";

/** Sidebar card with a collapsible, persisted header. */
function Card({ id, title, badge, children }: {
  id: string; title: string; badge?: string; children: ReactNode;
}) {
  const collapsed = useStore((s) => !!s.settings.collapsed[id]);
  const toggleCollapsed = useStore((s) => s.toggleCollapsed);
  return (
    <div className={`card ${collapsed ? "collapsed" : ""}`}>
      <h3
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={() => toggleCollapsed(id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleCollapsed(id); }}
      >
        {title}
        {badge && <span className="card-badge">{badge}</span>}
        <span className="chev" aria-hidden>{collapsed ? "▸" : "▾"}</span>
      </h3>
      {!collapsed && children}
    </div>
  );
}

function AiCard() {
  const { aiAdd, aiBusy, settings, openModal } = useStore();
  const [prompt, setPrompt] = useState("");

  return (
    <Card id="ai" title="✨ Quick add (AI)">
      {settings.aiKey ? (
        <form
          className="ai-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const p = prompt.trim();
            if (!p || aiBusy) return;
            if (await aiAdd(p)) setPrompt("");
          }}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. "gym tomorrow 18:00"'
            disabled={aiBusy}
          />
          <button type="submit" className="primary" disabled={aiBusy || !prompt.trim()}>
            {aiBusy ? "Thinking…" : "✨ Add"}
          </button>
        </form>
      ) : (
        <div className="empty ai-hint">
          Type "gym tomorrow 18:00" and let AI file it.
          Paste a <strong>free</strong> Gemini key in{" "}
          <button className="ghost link" onClick={() => openModal({ kind: "settings" })}>
            Settings
          </button>{" "}
          to enable it.
        </div>
      )}
    </Card>
  );
}

function TasksCard() {
  const { cursor, todos } = useStore();
  const key = fmtDateInput(cursor);
  const dayTodos = todos[key] ?? [];
  const isToday = key === fmtDateInput(new Date());
  const dayLabel = isToday
    ? "today"
    : cursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const done = dayTodos.filter((t) => t.done).length;

  return (
    <Card
      id="tasks"
      title="✅ Tasks"
      badge={dayTodos.length ? `${done}/${dayTodos.length} · ${dayLabel}` : dayLabel}
    >
      {dayTodos.length === 0 && <div className="empty">Nothing planned — add a task below!</div>}
      {dayTodos.map((t) => <TodoRow key={t.id} k={key} t={t} />)}
      <AddTodoForm
        targetKey={key}
        placeholder={isToday ? "Add a task for today…" : "Add a task for this day…"}
      />
    </Card>
  );
}

function BacklogCard() {
  const todos = useStore((s) => s.todos);
  const backlog = todos[BACKLOG_KEY] ?? [];
  return (
    <Card id="backlog" title="📥 Backlog" badge={backlog.length ? String(backlog.length) : undefined}>
      {backlog.length === 0 && (
        <div className="empty">Someday-tasks live here — schedule them with 📅 when ready.</div>
      )}
      {backlog.map((t) => <TodoRow key={t.id} k={BACKLOG_KEY} t={t} />)}
      <AddTodoForm targetKey={BACKLOG_KEY} placeholder="Add to backlog…" />
    </Card>
  );
}

export default function Sidebar() {
  const { events, openModal, syncing, lastSync, refresh, logout, settings } = useStore();

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
    <aside
      className="sidebar"
      style={{ width: settings.sidebarWidth, minWidth: settings.sidebarWidth }}
    >
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

      <AiCard />
      <TasksCard />
      <BacklogCard />

      <Card id="bdays" title="🎉 Upcoming birthdays">
        {birthdays.length === 0 && (
          <div className="empty">All quiet… add a birthday and I'll remind you a week before!</div>
        )}
        {birthdays.map(({ e, days }) => {
          const when = days === 0 ? "TODAY!" : days === 1 ? "tomorrow" : `in ${days} days`;
          return (
            <div
              className="bday-item"
              key={e.id}
              title="Show birthday"
              onClick={() => openModal({ kind: "details", event: e })}
            >
              <span>🎂</span>
              <span>{birthdayName(e)}</span>
              {days <= 7 ? <span className="soon">{when}</span> : <span className="when">{when}</span>}
            </div>
          );
        })}
      </Card>

      <Card id="sync" title="🔄 Sync">
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
      </Card>

      <div className="empty" style={{ marginTop: "auto", fontSize: 11.5 }}>
        Changes go to Google Calendar instantly,<br />and come back every minute. 🍬
      </div>
    </aside>
  );
}
