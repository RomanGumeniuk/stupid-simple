import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore, Accent, ViewMode } from "../lib/store";
import { GEvent, isBirthday } from "../lib/google";
import {
  eventStart, eventEnd, isAllDay, fmtDateInput, fmtTimeInput, fmtTime,
  sameDay, plainDesc, MONTHS, DAY_MS,
} from "../lib/notify";

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
          <textarea id="ev-desc" rows={3} value={desc}
            onChange={(e) => setDesc(e.target.value)} placeholder="Details…" />
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

// Google colorId → candy color (same mapping the views use)
const COLOR_CSS: Record<string, string> = {
  "4": "var(--bubblegum)", "5": "var(--mango)", "6": "var(--mango)",
  "10": "var(--mint)", "2": "var(--mint)", "3": "var(--grape)", "1": "var(--grape)",
  "9": "var(--berry)",
};

export function DetailsModal({ event }: { event: GEvent }) {
  const { closeModal, openModal, removeEvent } = useStore();

  const allDay = isAllDay(event);
  const s = eventStart(event);
  const en = eventEnd(event);
  const birthday = isBirthday(event);
  const desc = plainDesc(event);

  const longDay = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const shortDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  let when: string;
  if (allDay) {
    // exclusive → inclusive end, clamped for malformed zero-length events
    const endIncl = new Date(Math.max(en.getTime() - DAY_MS, s.getTime()));
    when = sameDay(s, endIncl)
      ? `${longDay(s)} · all day`
      : `${shortDay(s)} – ${shortDay(endIncl)} · all day`;
  } else {
    when = sameDay(s, en)
      ? `${longDay(s)} · ${fmtTime(s)}–${fmtTime(en)}`
      : `${shortDay(s)} ${fmtTime(s)} – ${shortDay(en)} ${fmtTime(en)}`;
  }

  const color = birthday ? "var(--bubblegum)" : COLOR_CSS[event.colorId ?? ""] ?? "var(--berry)";

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal">
        <div className="detail-head">
          <span className="detail-dot" style={{ background: color }} aria-hidden />
          <h2>{event.summary ?? "(no title)"}</h2>
        </div>

        <div className="detail-when">🕐 {when}</div>
        {birthday && <div className="detail-when">🎂 Repeats yearly · reminder a week before</div>}

        {desc ? (
          <div className="detail-desc">{desc}</div>
        ) : (
          <div className="detail-desc no-desc">No description — hit Edit to add one.</div>
        )}

        <div className="actions">
          <button
            className="danger"
            style={{ marginRight: "auto" }}
            onClick={async () => { if (event.id) await removeEvent(event.id); closeModal(); }}
          >
            Delete
          </button>
          <button className="ghost" onClick={closeModal}>Close</button>
          <button className="primary" onClick={() => openModal({ kind: "event", event })}>
            ✏️ Edit
          </button>
        </div>
      </div>
    </div>
  );
}

const ACCENTS: { id: Accent; css: string; name: string }[] = [
  { id: "bubblegum", css: "var(--bubblegum)", name: "Bubblegum" },
  { id: "mango", css: "var(--mango)", name: "Mango" },
  { id: "mint", css: "var(--mint)", name: "Mint" },
  { id: "berry", css: "var(--berry)", name: "Berry" },
  { id: "grape", css: "var(--grape)", name: "Grape" },
];

export function SettingsModal() {
  const { closeModal, settings, updateSettings } = useStore();

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal">
        <h2>Settings ⚙️</h2>

        <div className="row">
          <div>
            <label htmlFor="st-view">Default view</label>
            <select id="st-view" value={settings.defaultView}
              onChange={(e) => updateSettings({ defaultView: e.target.value as ViewMode })}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="tasks">Tasks board</option>
            </select>
          </div>
          <div>
            <label htmlFor="st-clock">Time format</label>
            <select id="st-clock" value={settings.hour12 ? "12" : "24"}
              onChange={(e) => updateSettings({ hour12: e.target.value === "12" })}>
              <option value="24">24-hour</option>
              <option value="12">12-hour (AM/PM)</option>
            </select>
          </div>
        </div>

        <div className="row"><div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={settings.dark}
              onChange={(e) => updateSettings({ dark: e.target.checked })} />
            🌙 Dark mode
          </label>
        </div></div>

        <div className="row"><div>
          <label>Accent color</label>
          <div className="color-dots">
            {ACCENTS.map((a) => (
              <button key={a.id} type="button" aria-label={a.name}
                className={`cdot ${settings.accent === a.id ? "sel" : ""}`}
                style={{ background: a.css }}
                onClick={() => updateSettings({ accent: a.id })} />
            ))}
          </div>
        </div></div>

        <div className="row"><div>
          <label htmlFor="st-ai">✨ AI quick-add — Gemini API key</label>
          <input id="st-ai" type="password" value={settings.aiKey}
            placeholder="AIza…"
            spellCheck={false}
            onChange={(e) => updateSettings({ aiKey: e.target.value.trim() })} />
          <button className="ghost link" style={{ marginTop: 4 }}
            onClick={() => void openUrl("https://aistudio.google.com/apikey")}>
            🔑 Get a free key (aistudio.google.com)
          </button>
        </div></div>

        <p style={{ fontWeight: 700, fontSize: 13, color: "var(--ink-soft)" }}>
          Settings, tasks and the AI key are stored on this PC only.
        </p>

        <div className="actions">
          <button className="primary" onClick={closeModal}>Done</button>
        </div>
      </div>
    </div>
  );
}
