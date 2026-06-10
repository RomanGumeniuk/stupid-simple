import { useState } from "react";
import { useStore } from "../lib/store";
import { GEvent } from "../lib/google";
import { eventStart, eventEnd, isAllDay, fmtDateInput, fmtTimeInput, MONTHS } from "../lib/notify";

const COLORS: { id: string; css: string; name: string }[] = [
  { id: "9", css: "var(--berry)", name: "Berry" },
  { id: "4", css: "var(--bubblegum)", name: "Bubblegum" },
  { id: "5", css: "var(--mango)", name: "Mango" },
  { id: "10", css: "var(--mint)", name: "Mint" },
  { id: "3", css: "var(--grape)", name: "Grape" },
];

export function EventModal({
  event, presetStart, presetEnd, presetAllDay,
}: {
  event?: GEvent; presetStart?: Date; presetEnd?: Date; presetAllDay?: boolean;
}) {
  const { closeModal, addEvent, updateEvent, removeEvent } = useStore();

  const initStart = event ? eventStart(event) : presetStart ?? roundedNow();
  const initEnd = event ? eventEnd(event) : presetEnd ?? new Date(initStart.getTime() + 60 * 60_000);

  const [title, setTitle] = useState(event?.summary ?? "");
  const [allDay, setAllDay] = useState(event ? isAllDay(event) : presetAllDay ?? false);
  const [date, setDate] = useState(fmtDateInput(initStart));
  const [endDate, setEndDate] = useState(
    fmtDateInput(allDayInclusiveEnd(initEnd, event ? isAllDay(event) : presetAllDay ?? false))
  );
  const [timeFrom, setTimeFrom] = useState(fmtTimeInput(initStart));
  const [timeTo, setTimeTo] = useState(fmtTimeInput(initEnd));
  const [color, setColor] = useState(event?.colorId ?? "9");
  const [desc, setDesc] = useState(event?.description ?? "");

  function roundedNow(): Date {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d;
  }
  function allDayInclusiveEnd(end: Date, isAd: boolean): Date {
    // Google stores all-day ends exclusively — the UI shows them inclusively
    return isAd ? new Date(end.getTime() - 86_400_000) : end;
  }

  function buildPayload(): GEvent {
    if (allDay) {
      const endIncl = new Date(endDate + "T00:00:00");
      const endExcl = new Date(endIncl.getTime() + 86_400_000);
      return {
        summary: title || "(no title)",
        description: desc || undefined,
        colorId: color,
        start: { date },
        end: { date: fmtDateInput(endExcl) },
      };
    }
    return {
      summary: title || "(no title)",
      description: desc || undefined,
      colorId: color,
      start: { dateTime: new Date(`${date}T${timeFrom}:00`).toISOString() },
      end: { dateTime: new Date(`${date}T${timeTo}:00`).toISOString() },
    };
  }

  async function save() {
    const payload = buildPayload();
    if (event?.id && !event.id.startsWith("temp-")) {
      await updateEvent(event.id, payload);
    } else {
      await addEvent(payload);
    }
    closeModal();
  }

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal">
        <h2>{event ? "Edit event" : "New event"} 🍬</h2>

        <div className="row"><div>
          <label htmlFor="ev-title">Title</label>
          <input id="ev-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Study for electronics" />
        </div></div>

        <div className="row">
          <div>
            <label htmlFor="ev-date">{allDay ? "From" : "Date"}</label>
            <input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {allDay ? (
            <div>
              <label htmlFor="ev-end-date">To (inclusive)</label>
              <input id="ev-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="ev-from">From</label>
                <input id="ev-from" type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ev-to">To</label>
                <input id="ev-to" type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="row"><div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={allDay}
              onChange={(e) => { setAllDay(e.target.checked); if (e.target.checked) setEndDate(date); }} />
            All day / multi-day
          </label>
        </div></div>

        <div className="row"><div>
          <label>Candy color</label>
          <div className="color-dots">
            {COLORS.map((c) => (
              <button key={c.id} type="button" aria-label={c.name}
                className={`cdot ${color === c.id ? "sel" : ""}`}
                style={{ background: c.css }} onClick={() => setColor(c.id)} />
            ))}
          </div>
        </div></div>

        <div className="row"><div>
          <label htmlFor="ev-desc">Description (optional)</label>
          <input id="ev-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Details…" />
        </div></div>

        <div className="actions">
          {event?.id && !event.id.startsWith("temp-") && (
            <button className="danger" onClick={async () => { await removeEvent(event.id!); closeModal(); }}
              style={{ marginRight: "auto" }}>
              Delete
            </button>
          )}
          <button className="ghost" onClick={closeModal}>Cancel</button>
          <button className="primary" onClick={() => void save()}>Save</button>
        </div>
      </div>
    </div>
  );
}

export function BirthdayModal() {
  const { closeModal, addBirthday } = useStore();
  const [name, setName] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [day, setDay] = useState(new Date().getDate());

  const maxDay = new Date(2024, month, 0).getDate(); // 2024 is a leap year, so Feb 29 works

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal">
        <h2>Add a birthday 🎂</h2>
        <div className="row"><div>
          <label htmlFor="bd-name">Who's celebrating?</label>
          <input id="bd-name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Julia" />
        </div></div>
        <div className="row">
          <div>
            <label htmlFor="bd-day">Day</label>
            <select id="bd-day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: maxDay }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bd-month">Month</label>
            <select id="bd-month" value={month} onChange={(e) => {
              const m = Number(e.target.value); setMonth(m);
              const md = new Date(2024, m, 0).getDate();
              if (day > md) setDay(md);
            }}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>
        <p style={{ fontWeight: 700, fontSize: 13, color: "var(--ink-soft)" }}>
          Repeats yearly in Google Calendar. Reminders: a week before and on the day.
        </p>
        <div className="actions">
          <button className="ghost" onClick={closeModal}>Cancel</button>
          <button className="primary" disabled={!name.trim()}
            onClick={async () => { await addBirthday(name.trim(), month, day); closeModal(); }}>
            Add birthday
          </button>
        </div>
      </div>
    </div>
  );
}
