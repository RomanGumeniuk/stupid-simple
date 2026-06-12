import { useMemo, useState } from "react";
import { useStore, Todo, BACKLOG_KEY } from "../lib/store";
import { fmtDateInput, DAY_MS } from "../lib/notify";
import { TodoRow, AddTodoForm } from "./Todos";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function fmtGroupDate(key: string): string {
  return new Date(key + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function Column({ title, accent, count, children }: {
  title: string; accent?: "warn"; count: number; children: React.ReactNode;
}) {
  return (
    <div className={`tcol ${accent ?? ""}`}>
      <h3>
        {title}
        <span className="card-badge">{count}</span>
      </h3>
      <div className="tcol-body">{children}</div>
    </div>
  );
}

export default function TasksView() {
  const { todos, moveTodo, setCursor, setView, addTodo } = useStore();
  const [upDate, setUpDate] = useState("");
  const [upText, setUpText] = useState("");

  const todayK = fmtDateInput(new Date());
  const tomorrowK = fmtDateInput(new Date(Date.now() + DAY_MS));

  const { overdue, upcoming } = useMemo(() => {
    const overdue: [string, Todo[]][] = [];
    const upcoming: [string, Todo[]][] = [];
    for (const key of Object.keys(todos).sort()) {
      if (!DATE_KEY.test(key) || !todos[key]?.length) continue;
      if (key < todayK) {
        const open = todos[key].filter((t) => !t.done);
        if (open.length) overdue.push([key, open]);
      } else if (key > tomorrowK) {
        upcoming.push([key, todos[key]]);
      }
    }
    return { overdue, upcoming };
  }, [todos, todayK, tomorrowK]);

  const overdueCount = overdue.reduce((n, [, l]) => n + l.length, 0);
  const upcomingCount = upcoming.reduce((n, [, l]) => n + l.length, 0);

  function openDay(key: string) {
    setCursor(new Date(key + "T00:00:00"));
    setView("day");
  }

  return (
    <div className="tasks-view">
      <Column title="📥 Backlog" count={(todos[BACKLOG_KEY] ?? []).length}>
        {(todos[BACKLOG_KEY] ?? []).length === 0 && (
          <div className="empty">Someday-tasks live here.</div>
        )}
        {(todos[BACKLOG_KEY] ?? []).map((t) => (
          <TodoRow key={t.id} k={BACKLOG_KEY} t={t} />
        ))}
        <AddTodoForm targetKey={BACKLOG_KEY} placeholder="Add to backlog…" />
      </Column>

      {overdueCount > 0 && (
        <Column title="⚠️ Overdue" accent="warn" count={overdueCount}>
          {overdue.map(([key, list]) => (
            <div className="tgroup" key={key}>
              <button className="tgroup-head" onClick={() => openDay(key)} title="Open this day">
                {fmtGroupDate(key)}
              </button>
              {list.map((t) => <TodoRow key={t.id} k={key} t={t} />)}
              <button
                className="ghost link"
                onClick={() => list.forEach((t) => moveTodo(key, t.id, todayK))}
              >
                📌 Move all to today
              </button>
            </div>
          ))}
        </Column>
      )}

      <Column title="📌 Today" count={(todos[todayK] ?? []).length}>
        {(todos[todayK] ?? []).length === 0 && (
          <div className="empty">Nothing for today — enjoy it or grab something from the backlog!</div>
        )}
        {(todos[todayK] ?? []).map((t) => <TodoRow key={t.id} k={todayK} t={t} />)}
        <AddTodoForm targetKey={todayK} placeholder="Add for today…" />
      </Column>

      <Column title="⏭ Tomorrow" count={(todos[tomorrowK] ?? []).length}>
        {(todos[tomorrowK] ?? []).length === 0 && (
          <div className="empty">Tomorrow is wide open.</div>
        )}
        {(todos[tomorrowK] ?? []).map((t) => <TodoRow key={t.id} k={tomorrowK} t={t} />)}
        <AddTodoForm targetKey={tomorrowK} placeholder="Add for tomorrow…" />
      </Column>

      <Column title="🗓 Upcoming" count={upcomingCount}>
        {upcoming.length === 0 && <div className="empty">Nothing scheduled further out.</div>}
        {upcoming.map(([key, list]) => (
          <div className="tgroup" key={key}>
            <button className="tgroup-head" onClick={() => openDay(key)} title="Open this day">
              {fmtGroupDate(key)}
            </button>
            {list.map((t) => <TodoRow key={t.id} k={key} t={t} />)}
          </div>
        ))}
        <form
          className="todo-add up-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!upDate || !upText.trim()) return;
            addTodo(upDate, upText.trim());
            setUpText("");
          }}
        >
          <input
            type="date"
            value={upDate}
            min={todayK}
            onChange={(e) => setUpDate(e.target.value)}
            aria-label="Date for the new task"
          />
          <input
            value={upText}
            onChange={(e) => setUpText(e.target.value)}
            placeholder="Add for that day…"
          />
          <button type="submit" className="mint" disabled={!upDate || !upText.trim()}>+</button>
        </form>
      </Column>
    </div>
  );
}
