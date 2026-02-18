import React, { useState, useMemo } from "react";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import PharmacySidebar from "@/components/PharmacySidebar";

/* ──────────────────────── types ──────────────────────── */

type EventColor = "important" | "personal" | "fun";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;          // yyyy-mm-dd
  endDate?: string;      // multi-day (inclusive)
  color: EventColor;
}

/* ──────────────────────── exact Figma palette ──────────── */

const COLOR_BG: Record<EventColor, string> = {
  important: "#FFD9D9",
  personal:  "#FEE6C9",
  fun:       "#D2F0FF",
};

/* ──────────────────────── date helpers ──────────────────── */

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function startDow(y: number, m: number) { return new Date(y, m, 1).getDay(); }
function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayISO() { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); }

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/* ──────────────────────── seed events (pharmacy) ──────── */

function buildSeedEvents(): CalendarEvent[] {
  const t = new Date();
  const y = t.getFullYear(), m = t.getMonth(), d = t.getDate();
  const dt = (offset: number) => { const x = new Date(y, m, d + offset); return iso(x.getFullYear(), x.getMonth(), x.getDate()); };

  return [
    { id: "e1",  title: "Inventory check",                date: dt(-12), color: "fun" },
    { id: "e2",  title: "Staff meeting",                  date: dt(-10), color: "personal" },
    { id: "e3",  title: "Flu shot clinic",                 date: dt(-8),  endDate: dt(-7), color: "important" },
    { id: "e4",  title: "DEA compliance review",           date: dt(-6),  color: "fun" },
    { id: "e5",  title: "Vendor call – McKesson",          date: dt(-5),  color: "personal" },
    { id: "e6",  title: "Pharmacy tech training",          date: dt(-4),  color: "fun" },
    { id: "e7",  title: "Insurance audit prep",            date: dt(-3),  color: "personal" },
    { id: "e8",  title: "Morning huddle",                  date: dt(-1),  color: "fun" },
    { id: "e9",  title: "Prescription refill batch",       date: dt(-1),  color: "important" },
    { id: "e10", title: "COVID booster clinic",            date: dt(0),   color: "important" },
    { id: "e11", title: "Dr. Patel follow-ups",            date: dt(0),   color: "fun" },
    { id: "e12", title: "Lunch & learn – new generics",    date: dt(0),   color: "personal" },
    { id: "e13", title: "Delivery – Cardinal Health",      date: dt(1),   color: "fun" },
    { id: "e14", title: "Patient consultation block",      date: dt(1),   color: "important" },
    { id: "e15", title: "Controlled substance count",      date: dt(2),   color: "fun" },
    { id: "e16", title: "Blood pressure screening",        date: dt(3),   endDate: dt(4), color: "important" },
    { id: "e17", title: "Weekly team sync",                date: dt(5),   color: "personal" },
    { id: "e18", title: "Pharmacy board CE webinar",       date: dt(6),   color: "fun" },
    { id: "e19", title: "New hire orientation",             date: dt(7),   color: "personal" },
    { id: "e20", title: "Medication therapy mgmt",         date: dt(8),   color: "important" },
    { id: "e21", title: "Vaccine restock delivery",        date: dt(9),   color: "fun" },
    { id: "e22", title: "Quarterly P&L review",            date: dt(10),  color: "personal" },
    { id: "e23", title: "Patient appreciation day",        date: dt(12),  endDate: dt(13), color: "important" },
    { id: "e24", title: "Compounding lab session",         date: dt(14),  color: "fun" },
    { id: "e25", title: "State inspector visit",           date: dt(16),  color: "important" },
    { id: "e26", title: "Staff potluck",                   date: dt(18),  color: "personal" },
    { id: "e27", title: "Renewal – pharmacy license",      date: dt(20),  color: "personal" },
    { id: "e28", title: "End-of-month inventory",          date: dt(22),  color: "fun" },
  ];
}

const EVENTS = buildSeedEvents();

/* ──────────────────────── component ──────────────────── */

const MAX_VISIBLE = 3;

export default function Calendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  /* grid rows */
  const rows = useMemo(() => {
    const first = startDow(year, month);
    const total = daysInMonth(year, month);
    const prevDays = daysInMonth(year, month === 0 ? 11 : month - 1);
    const grid: Array<{ day: number; mo: number; yr: number; cur: boolean; key: string }[]> = [];
    let dc = 1 - first;
    for (let r = 0; r < 6; r++) {
      const row: typeof grid[0] = [];
      for (let c = 0; c < 7; c++) {
        if (dc < 1) {
          const pm = month === 0 ? 11 : month - 1, py = month === 0 ? year - 1 : year, d = prevDays + dc;
          row.push({ day: d, mo: pm, yr: py, cur: false, key: iso(py, pm, d) });
        } else if (dc > total) {
          const nm = month === 11 ? 0 : month + 1, ny = month === 11 ? year + 1 : year, d = dc - total;
          row.push({ day: d, mo: nm, yr: ny, cur: false, key: iso(ny, nm, d) });
        } else {
          row.push({ day: dc, mo: month, yr: year, cur: true, key: iso(year, month, dc) });
        }
        dc++;
      }
      if (row.every(c => !c.cur) && r > 3) break;
      grid.push(row);
    }
    return grid;
  }, [year, month]);

  /* events by date */
  const byDate = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    for (const ev of EVENTS) {
      const s = new Date(ev.date + "T00:00:00");
      const e = ev.endDate ? new Date(ev.endDate + "T00:00:00") : s;
      const cur = new Date(s);
      while (cur <= e) {
        const k = iso(cur.getFullYear(), cur.getMonth(), cur.getDate());
        (m[k] ??= []).push(ev);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return m;
  }, []);

  const todayStr = todayISO();

  return (
    <DefaultPageLayout>
      <div className="flex h-full w-full items-stretch">
        <PharmacySidebar active="calendar" />

        {/* Main calendar area */}
        <div className="flex w-full min-h-0 flex-col overflow-auto" style={{ background: "#FFFFFF" }}>
          <div
            className="flex flex-col items-start w-full h-full"
            style={{ padding: "24px 72px", gap: 32 }}
          >
            {/* ── Header ── */}
            <div className="flex w-full items-center justify-between" style={{ height: 67 }}>
              <div className="flex items-center" style={{ gap: 12 }}>
                <span
                  style={{
                    fontFamily: "'Lato', 'Plus Jakarta Sans', sans-serif",
                    fontWeight: 900,
                    fontSize: 28,
                    lineHeight: "125%",
                    color: "#252525",
                  }}
                >
                  {MONTHS[month]}
                </span>
                <span
                  style={{
                    fontFamily: "'Lato', 'Plus Jakarta Sans', sans-serif",
                    fontWeight: 400,
                    fontSize: 28,
                    lineHeight: "125%",
                    color: "#252525",
                  }}
                >
                  {year}
                </span>
              </div>

              <div className="flex items-center" style={{ gap: 8 }}>
                <button
                  onClick={goToday}
                  className="hover:bg-neutral-50 transition-colors"
                  style={{
                    fontFamily: "'Lato', 'Plus Jakarta Sans', sans-serif",
                    fontSize: 12,
                    fontWeight: 400,
                    color: "#252525",
                    border: "1px solid #e5e5e5",
                    borderRadius: 4,
                    padding: "4px 10px",
                    background: "#fff",
                    cursor: "pointer",
                    marginRight: 4,
                  }}
                >
                  Today
                </button>
                <button onClick={prev} className="flex items-center justify-center hover:bg-neutral-50 transition-colors" style={{ width: 24, height: 24, cursor: "pointer", background: "none", border: "none" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#252525" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <button onClick={next} className="flex items-center justify-center hover:bg-neutral-50 transition-colors" style={{ width: 24, height: 24, cursor: "pointer", background: "none", border: "none" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#252525" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            </div>

            {/* ── Day-of-week row ── */}
            <div className="flex w-full" style={{ paddingBottom: 4 }}>
              {DAYS.map(d => (
                <div
                  key={d}
                  className="flex-1 flex justify-center"
                  style={{
                    fontFamily: "'Lato', 'Plus Jakarta Sans', sans-serif",
                    fontWeight: 400,
                    fontSize: 12,
                    lineHeight: "125%",
                    color: "#252525",
                    opacity: 0.5,
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* ── Weeks ── */}
            <div className="flex flex-col w-full flex-1" style={{ gap: 0 }}>
              {rows.map((week, ri) => (
                <div key={ri} className="flex w-full flex-1" style={{ minHeight: 0 }}>
                  {week.map((cell) => {
                    const isToday = cell.key === todayStr;
                    const evts = byDate[cell.key] ?? [];
                    const overflow = evts.length > MAX_VISIBLE;
                    const isExpanded = expandedDay === cell.key;
                    const shown = isExpanded ? evts : evts.slice(0, MAX_VISIBLE);

                    return (
                      <div
                        key={cell.key}
                        className="flex flex-col items-center flex-1"
                        style={{ padding: 2, gap: 2, background: "#FFFFFF", minHeight: 120 }}
                      >
                        {/* Date number */}
                        <div
                          className="flex items-center justify-center"
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: isToday ? "50%" : 0,
                            background: isToday ? "#252525" : "transparent",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "'Lato', 'Plus Jakarta Sans', sans-serif",
                              fontWeight: 400,
                              fontSize: 10,
                              lineHeight: "125%",
                              color: isToday ? "#FFFFFF" : "#252525",
                              opacity: !isToday && !cell.cur ? 0.5 : 1,
                            }}
                          >
                            {cell.day}
                          </span>
                        </div>

                        {/* Events */}
                        {shown.map(ev => (
                          <div
                            key={ev.id + cell.key}
                            className="w-full truncate"
                            title={ev.title}
                            style={{
                              height: 14,
                              borderRadius: 2,
                              background: COLOR_BG[ev.color],
                              paddingLeft: 4,
                              paddingRight: 4,
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "'Lato', 'Plus Jakarta Sans', sans-serif",
                                fontWeight: 400,
                                fontSize: 8,
                                lineHeight: "125%",
                                color: "#000000",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {ev.title}
                            </span>
                          </div>
                        ))}

                        {/* View more / show less */}
                        {overflow && !isExpanded ? (
                          <div className="w-full flex justify-end" style={{ height: 12 }}>
                            <button
                              onClick={() => setExpandedDay(cell.key)}
                              style={{
                                fontFamily: "'Lato', 'Plus Jakarta Sans', sans-serif",
                                fontWeight: 400,
                                fontSize: 8,
                                lineHeight: "125%",
                                color: "#015DE7",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              view more
                            </button>
                          </div>
                        ) : null}
                        {isExpanded && evts.length > MAX_VISIBLE ? (
                          <div className="w-full flex justify-end" style={{ height: 12 }}>
                            <button
                              onClick={() => setExpandedDay(null)}
                              style={{
                                fontFamily: "'Lato', 'Plus Jakarta Sans', sans-serif",
                                fontWeight: 400,
                                fontSize: 8,
                                lineHeight: "125%",
                                color: "#015DE7",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              show less
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DefaultPageLayout>
  );
}
