import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { GEvent, isBirthday } from "../lib/google";
import {
  DOW, DAY_MS, startOfDay, sameDay, mondayOf,
  eventStart, eventEnd, isAllDay, touchesDay, fmtTime, plainDesc, eventTooltip,
} from "../lib/notify";

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

interface Placed {
  e: GEvent;
  sMin: number;
  eMin: number;
  col: number;
  cols: number;
}

/**
 * Assigns overlapping events to side-by-side columns (the classic
 * calendar layout): events are clustered by transitive overlap, each
 * event takes the first free column, and every event in a cluster is
 * as wide as 1/columns of the day.
 */
function layoutDay(events: GEvent[], day: Date): Placed[] {
  const items: Placed[] = events
    .map((e) => {
      const s = eventStart(e);
      const en = eventEnd(e);
      const sMin = sameDay(s, day) ? s.getHours() * 60 + s.getMinutes() : 0;
      let eMin = sameDay(en, day) ? en.getHours() * 60 + en.getMinutes() : 24 * 60;
      eMin = Math.max(eMin, sMin + 20); // minimum footprint so tiny events still get a column
      return { e, sMin, eMin, col: 0, cols: 1 };
    })
    .sort((a, b) => a.sMin - b.sMin || b.eMin - a.eMin);

  let cluster: Placed[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const it of cluster) it.cols = colEnds.length;
    cluster = [];
    colEnds = [];
  };

  for (const it of items) {
    if (cluster.length && it.sMin >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= it.sMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(0);
    }
    colEnds[col] = it.eMin;
    it.col = col;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.eMin);
  }
  flush();
  return items;
}

export default function WeekView({ singleDay = false }: { singleDay?: boolean }) {
  const { cursor, events, openModal, setCursor, setView, settings } = useStore();
  const HP = settings.zoom; // px per hour
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevHp = useRef(HP);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [, tick] = useState(0);

  // refresh the "now" line every minute
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // finish the drag even when the mouse is released outside the column
  useEffect(() => {
    if (!drag) return;
    const up = () => finishDrag();
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

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
    scrollRef.current?.scrollTo({ top: hours * HP, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, singleDay]);

  // keep the visual center anchored when zooming
  useEffect(() => {
    const el = scrollRef.current;
    const old = prevHp.current;
    if (!el || old === HP) return;
    const center = el.scrollTop + el.clientHeight / 2;
    el.scrollTop = center * (HP / old) - el.clientHeight / 2;
    prevHp.current = HP;
  }, [HP]);

  // Ctrl+scroll zooms the grid (native listener — must be non-passive)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const z = useStore.getState().settings.zoom;
      useStore.getState().setZoom(z + (e.deltaY < 0 ? 6 : -6));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const cols = days.length;
  const today = new Date();
  const nowMin = today.getHours() * 60 + today.getMinutes();

  function minutesFromPointer(ev: React.MouseEvent, col: HTMLElement): number {
    const rect = col.getBoundingClientRect();
    const raw = ((ev.clientY - rect.top) / HP) * 60;
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

  function openDay(d: Date) {
    setCursor(d);
    setView("day");
  }

  return (
    <div className="weekwrap" style={{ "--hour-px": `${HP}px` } as React.CSSProperties}>
      <div className="whead" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {days.map((d) => (
          <div key={d.getTime()} className={`wd ${sameDay(d, today) ? "today" : ""}`}>
            {DOW[(d.getDay() + 6) % 7]} <small>{d.getDate()}.{d.getMonth() + 1}</small>
          </div>
        ))}
      </div>

      {/* all-day events strip */}
      <div className="allday-row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {days.map((d) => {
          const all = events.filter((e) => isAllDay(e) && touchesDay(e, d));
          const shown = singleDay ? all : all.slice(0, 2);
          return (
            <div key={d.getTime()} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {shown.map((e, i) => (
                <div
                  key={e.id}
                  className={jellyClass(e)}
                  style={{ "--i": i } as React.CSSProperties}
                  onClick={() => openModal({ kind: "details", event: e })}
                  title={eventTooltip(e)}
                >
                  {e.summary ?? "(no title)"}
                </div>
              ))}
              {all.length > shown.length && (
                <button className="more-chip" onClick={() => openDay(d)}>
                  +{all.length - shown.length} more
                </button>
              )}
            </div>
          );
        })}
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
              const placed = layoutDay(timed, day);
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

                  {placed.map(({ e, sMin, eMin, col, cols: n }, i) => {
                    const s = eventStart(e);
                    const en = eventEnd(e);
                    const top = (sMin / 60) * HP;
                    const height = Math.max(20, ((eMin - sMin) / 60) * HP - 3);
                    const compact = height < 38;
                    return (
                      <div
                        key={e.id}
                        className={`${jellyClass(e)} tevent ${compact ? "compact" : ""}`}
                        style={{
                          top,
                          height,
                          left: `calc(${(col / n) * 100}% + 3px)`,
                          width: `calc(${100 / n}% - 8px)`,
                          "--i": i,
                        } as React.CSSProperties}
                        onClick={(ev) => { ev.stopPropagation(); openModal({ kind: "details", event: e }); }}
                        title={eventTooltip(e)}
                      >
                        {compact ? (
                          <span className="compact-line">
                            <span className="time">{fmtTime(s)}</span> {e.summary ?? "(no title)"}
                          </span>
                        ) : (
                          <>
                            <span className="time">{fmtTime(s)}–{fmtTime(en)}</span>
                            {e.summary ?? "(no title)"}
                            {height > 64 && plainDesc(e) && (
                              <span className="tdesc">{plainDesc(e)}</span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {drag && drag.day === dayT && (
                    <div
                      className="drag-ghost"
                      style={{
                        top: (Math.min(drag.fromMin, drag.toMin) / 60) * HP,
                        height: (Math.abs(drag.toMin - drag.fromMin) / 60) * HP || 8,
                      }}
                    />
                  )}

                  {sameDay(day, today) && (
                    <div className="now-line" style={{ top: (nowMin / 60) * HP }} />
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
