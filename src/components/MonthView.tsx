import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { GEvent, isBirthday } from "../lib/google";
import {
  DOW, DAY_MS, startOfDay, sameDay, touchesDay, mondayOf,
  eventStart, isAllDay, fmtTime,
} from "../lib/notify";

function jellyClass(e: GEvent): string {
  if (isBirthday(e)) return "jelly birthday";
  const map: Record<string, string> = {
    "4": "jelly c-pink", "5": "jelly c-mango", "6": "jelly c-mango",
    "10": "jelly c-mint", "2": "jelly c-mint", "3": "jelly c-grape", "1": "jelly c-grape",
  };
  return map[e.colorId ?? ""] ?? "jelly";
}

export default function MonthView() {
  const { cursor, events, openModal } = useStore();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragTo, setDragTo] = useState<number | null>(null);

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = mondayOf(first);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
  }, [cursor]);

  const today = new Date();
  const inDrag = (t: number) =>
    dragFrom !== null && dragTo !== null &&
    t >= Math.min(dragFrom, dragTo) && t <= Math.max(dragFrom, dragTo);

  function finishDrag() {
    if (dragFrom === null || dragTo === null) return;
    const a = new Date(Math.min(dragFrom, dragTo));
    const b = new Date(Math.max(dragFrom, dragTo) + DAY_MS); // exclusive end
    setDragFrom(null);
    setDragTo(null);
    openModal({ kind: "event", presetStart: a, presetEnd: b, allDay: true });
  }

  return (
    <div
      className="month"
      onMouseUp={finishDrag}
      onMouseLeave={() => { setDragFrom(null); setDragTo(null); }}
    >
      <div className="dow-row">
        {DOW.map((d) => <div className="dow" key={d}>{d}</div>)}
      </div>
      {Array.from({ length: 6 }, (_, w) => (
        <div className="week-row" key={w}>
          {days.slice(w * 7, w * 7 + 7).map((day) => {
            const t = startOfDay(day).getTime();
            const dayEvents = events
              .filter((e) => touchesDay(e, day))
              .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
            const shown = dayEvents.slice(0, 3);
            return (
              <div
                key={t}
                className={[
                  "mcell",
                  day.getMonth() !== cursor.getMonth() ? "faded" : "",
                  sameDay(day, today) ? "today" : "",
                  inDrag(t) ? "selecting" : "",
                ].join(" ")}
                onMouseDown={(ev) => {
                  if ((ev.target as HTMLElement).closest(".jelly")) return;
                  setDragFrom(t); setDragTo(t);
                }}
                onMouseEnter={() => { if (dragFrom !== null) setDragTo(t); }}
              >
                <span className="dnum">{day.getDate()}</span>
                {shown.map((e, i) => (
                  <div
                    key={e.id}
                    className={jellyClass(e)}
                    style={{ "--i": i } as React.CSSProperties}
                    onClick={(ev) => { ev.stopPropagation(); openModal({ kind: "event", event: e }); }}
                    title={e.summary}
                  >
                    {!isAllDay(e) && <span className="time">{fmtTime(eventStart(e))}</span>}
                    {e.summary ?? "(no title)"}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <span className="more">+{dayEvents.length - 3} more</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
