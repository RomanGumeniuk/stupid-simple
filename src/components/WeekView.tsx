import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { GEvent, isBirthday } from "../lib/google";
import {
  DOW, DAY_MS, startOfDay, sameDay, mondayOf,
  eventStart, eventEnd, isAllDay, touchesDay, fmtTime,
} from "../lib/notify";

const HOUR_PX = 52;
const SNAP_MIN = 15;

function jellyClass(e: GEvent): string {
  if (isBirthday(e)) return "jelly birthday";
  const map: Record<string, string> = {
    "4": "jelly c-pink", "5": "jelly c-mango", "6": "jelly c-mango",
    "10": "jelly c-mint", "2": "jelly c-mint", "3": "jelly c-grape", "1": "jelly c-grape",
  };
  return map[e.colorId ?? ""] ?? "jelly";
}

interface Drag { day: number; fromMin: number; toMin: number; }

export default function WeekView({ singleDay = false }: { singleDay?: boolean }) {
  const { cursor, events, openModal } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [, tick] = useState(0);

  // refresh the "now" line every minute
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const days = useMemo(() => {
    if (singleDay) return [startOfDay(cursor)];
    const mon = mondayOf(cursor);
    return Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * DAY_MS));
  }, [cursor, singleDay]);

  // scroll to the current hour when today is visible, otherwise to 7:30
  useEffect(() => {
    const now = new Date();
    const showsToday = days.some((d) => sameDay(d, now));
    const hours = showsToday ? Math.max(0, now.getHours() - 2.5) : 7.5;
    scrollRef.current?.scrollTo({ top: hours * HOUR_PX, behavior: "smooth" });
  }, [days, singleDay]);

  // finish the drag even when the mouse is released outside the column
  useEffect(() => {
    if (!drag) return;
    const up = () => finishDrag();
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  const cols = days.length;
  const today = new Date();
  const nowMin = today.getHours() * 60 + today.getMinutes();

  function minutesFromPointer(ev: React.MouseEvent, col: HTMLElement): number {
    const rect = col.getBoundingClientRect();
    const raw = ((ev.clientY - rect.top) / HOUR_PX) * 60;
    return Math.max(0, Math.min(24 * 60, Math.round(raw / SNAP_MIN) * SNAP_MIN));
  }

  function finishDrag() {
    if (!drag) return;
    const day = new Date(drag.day);
    const a = Math.min(drag.fromMin, drag.toMin);
    const b = Math.max(drag.fromMin, drag.toMin, a + 30); // at least 30 min
    setDrag(null);
    openModal({
      kind: "event",
      presetStart: new Date(day.getTime() + a * 60_000),
      presetEnd: new Date(day.getTime() + b * 60_000),
    });
  }

  return (
    <div className="weekwrap">
      <div className="whead" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {days.map((d) => (
          <div key={d.getTime()} className={`wd ${sameDay(d, today) ? "today" : ""}`}>
            {DOW[(d.getDay() + 6) % 7]} <small>{d.getDate()}.{d.getMonth() + 1}</small>
          </div>
        ))}
      </div>

      {/* all-day events strip */}
      <div className="allday-row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {days.map((d) => (
          <div key={d.getTime()} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {events
              .filter((e) => isAllDay(e) && touchesDay(e, d))
              .slice(0, 2)
              .map((e, i) => (
                <div
                  key={e.id}
                  className={jellyClass(e)}
                  style={{ "--i": i } as React.CSSProperties}
                  onClick={() => openModal({ kind: "event", event: e })}
                  title={e.summary}
                >
                  {e.summary ?? "(no title)"}
                </div>
              ))}
          </div>
        ))}
      </div>

      <div className="wgrid-scroll" ref={scrollRef}>
        <div className="wgrid">
          <div className="hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div className="hour" key={h}>{h === 0 ? "" : `${h}:00`}</div>
            ))}
          </div>
          <div className="days" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {days.map((day) => {
              const dayT = day.getTime();
              const timed = events.filter((e) => !isAllDay(e) && touchesDay(e, day));
              return (
                <div
                  className="daycol"
                  key={dayT}
                  onMouseDown={(ev) => {
                    if ((ev.target as HTMLElement).closest(".jelly")) return;
                    const m = minutesFromPointer(ev, ev.currentTarget);
                    setDrag({ day: dayT, fromMin: m, toMin: m });
                  }}
                  onMouseMove={(ev) => {
                    if (drag && drag.day === dayT) {
                      setDrag({ ...drag, toMin: minutesFromPointer(ev, ev.currentTarget) });
                    }
                  }}
                >
                  {Array.from({ length: 24 }, (_, h) => <div className="hline" key={h} />)}

                  {timed.map((e, i) => {
                    const s = eventStart(e);
                    const en = eventEnd(e);
                    const sMin = sameDay(s, day) ? s.getHours() * 60 + s.getMinutes() : 0;
                    const eMin = sameDay(en, day) ? en.getHours() * 60 + en.getMinutes() : 24 * 60;
                    const top = (sMin / 60) * HOUR_PX;
                    const height = Math.max(22, ((eMin - sMin) / 60) * HOUR_PX - 3);
                    return (
                      <div
                        key={e.id}
                        className={`${jellyClass(e)} tevent`}
                        style={{ top, height, "--i": i } as React.CSSProperties}
                        onClick={(ev) => { ev.stopPropagation(); openModal({ kind: "event", event: e }); }}
                        title={e.summary}
                      >
                        <span className="time">{fmtTime(s)}–{fmtTime(en)}</span>
                        {e.summary ?? "(no title)"}
                      </div>
                    );
                  })}

                  {drag && drag.day === dayT && (
                    <div
                      className="drag-ghost"
                      style={{
                        top: (Math.min(drag.fromMin, drag.toMin) / 60) * HOUR_PX,
                        height: (Math.abs(drag.toMin - drag.fromMin) / 60) * HOUR_PX || 8,
                      }}
                    />
                  )}

                  {sameDay(day, today) && (
                    <div className="now-line" style={{ top: (nowMin / 60) * HOUR_PX }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
