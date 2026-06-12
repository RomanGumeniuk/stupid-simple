import { useEffect, useRef, useState } from "react";
import { useStore, Todo, BACKLOG_KEY } from "../lib/store";
import { fmtDateInput } from "../lib/notify";

/** One todo row with check / inline edit / schedule / delete. */
export function TodoRow({ k, t }: { k: string; t: Todo }) {
  const { toggleTodo, editTodo, removeTodo, moveTodo } = useStore();
  const [sched, setSched] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  // close the schedule popover on outside click
  useEffect(() => {
    if (!sched) return;
    const close = (e: MouseEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setSched(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [sched]);

  const move = (toKey: string) => {
    moveTodo(k, t.id, toKey);
    setSched(false);
  };
  const todayK = fmtDateInput(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowK = fmtDateInput(tomorrow);

  return (
    <div className={`todo-item ${t.done ? "done" : ""}`} ref={rowRef}>
      <button
        className="todo-check"
        aria-label={t.done ? "Mark as not done" : "Mark as done"}
        onClick={() => toggleTodo(k, t.id)}
      >
        {t.done ? "✓" : ""}
      </button>
      <input
        className="todo-text"
        value={t.text}
        onChange={(e) => editTodo(k, t.id, e.target.value)}
        onBlur={(e) => { if (!e.target.value.trim()) removeTodo(k, t.id); }}
      />
      <button
        className="todo-del todo-sched"
        aria-label="Schedule task"
        title="Move to another day"
        onClick={() => setSched((v) => !v)}
      >
        📅
      </button>
      <button className="todo-del" aria-label="Delete task" onClick={() => removeTodo(k, t.id)}>
        ×
      </button>
      {sched && (
        <div className="sched-pop">
          {k !== todayK && <button onClick={() => move(todayK)}>📌 Today</button>}
          {k !== tomorrowK && <button onClick={() => move(tomorrowK)}>⏭ Tomorrow</button>}
          <label className="sched-date">
            🗓 Pick a day
            <input
              type="date"
              onChange={(e) => { if (e.target.value) move(e.target.value); }}
            />
          </label>
          {k !== BACKLOG_KEY && <button onClick={() => move(BACKLOG_KEY)}>📥 Backlog</button>}
        </div>
      )}
    </div>
  );
}

export function AddTodoForm({ targetKey, placeholder }: { targetKey: string; placeholder: string }) {
  const addTodo = useStore((s) => s.addTodo);
  const [draft, setDraft] = useState("");
  return (
    <form
      className="todo-add"
      onSubmit={(e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;
        addTodo(targetKey, text);
        setDraft("");
      }}
    >
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
      <button type="submit" className="mint" disabled={!draft.trim()}>+</button>
    </form>
  );
}
