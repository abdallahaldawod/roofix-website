"use client";

import { formatDisplayDateSydney, getDateInSydneyOffset, getTodayInSydney } from "@/lib/sydney-date";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const PRESETS = [
  { label: "Today", value: "1d" as const },
  { label: "Yesterday", value: "yesterday" as const },
  { label: "Last 7 days", value: "7d" as const },
  { label: "Last 30 days", value: "30d" as const },
  { label: "Last 90 days", value: "90d" as const },
] as const;

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPresetRange(preset: (typeof PRESETS)[number]["value"]) {
  const end = getTodayInSydney();
  if (preset === "1d") return { startDate: end, endDate: end };
  if (preset === "yesterday") {
    const yesterday = getDateInSydneyOffset(-1);
    return { startDate: yesterday, endDate: yesterday };
  }
  if (preset === "7d") return { startDate: getDateInSydneyOffset(-7), endDate: end };
  if (preset === "30d") return { startDate: getDateInSydneyOffset(-30), endDate: end };
  return { startDate: getDateInSydneyOffset(-90), endDate: end };
}

function getPresetFromRange(startDate: string, endDate: string): (typeof PRESETS)[number]["value"] | null {
  const r1 = getPresetRange("1d");
  const rYesterday = getPresetRange("yesterday");
  const r7 = getPresetRange("7d");
  const r30 = getPresetRange("30d");
  const r90 = getPresetRange("90d");
  if (startDate === r1.startDate && endDate === r1.endDate) return "1d";
  if (startDate === rYesterday.startDate && endDate === rYesterday.endDate) return "yesterday";
  if (startDate === r7.startDate && endDate === r7.endDate) return "7d";
  if (startDate === r30.startDate && endDate === r30.endDate) return "30d";
  if (startDate === r90.startDate && endDate === r90.endDate) return "90d";
  return null;
}

function formatDisplayDate(s: string): string {
  return formatDisplayDateSydney(s);
}

/** Human-readable label for the current range (e.g. "Last 7 days" or "1 Jan 2026 – 7 Feb 2026") */
export function getRangeLabel(startDate: string, endDate: string): string {
  const preset = getPresetFromRange(startDate, endDate);
  if (preset) return PRESETS.find((p) => p.value === preset)?.label ?? `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;
  return `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;
}

type Props = {
  startDate: string;
  endDate: string;
  onRangeChange: (range: { startDate: string; endDate: string }) => void;
};

export function DateRangeDropdown({ startDate, endDate, onRangeChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customMonth, setCustomMonth] = useState(() => new Date());
  const [selecting, setSelecting] = useState<"start" | "end">("start");
  const [tempStart, setTempStart] = useState<string | null>(null);
  const [tempEnd, setTempEnd] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const presetMatch = getPresetFromRange(startDate, endDate);
  const label = presetMatch
    ? PRESETS.find((p) => p.value === presetMatch)?.label ?? `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`
    : `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const year = customMonth.getFullYear();
  const month = customMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const startVal = tempStart ?? startDate;
  const endVal = tempEnd ?? endDate;
  const startD = startVal ? new Date(startVal + "T12:00:00") : null;
  const endD = endVal ? new Date(endVal + "T12:00:00") : null;
  const todayYMD = formatYMD(new Date());

  function handleDayClick(day: number) {
    const ymd = formatYMD(new Date(year, month, day));
    if (selecting === "start") {
      setTempStart(ymd);
      setTempEnd(null);
      setSelecting("end");
    } else {
      const s = tempStart ?? ymd;
      let start = s;
      let end = ymd;
      if (new Date(end + "T12:00:00") < new Date(start + "T12:00:00")) {
        [start, end] = [end, start];
      }
      onRangeChange({ startDate: start, endDate: end });
      setTempStart(null);
      setTempEnd(null);
      setSelecting("start");
      setOpen(false);
    }
  }

  function isInRange(day: number) {
    const ymd = formatYMD(new Date(year, month, day));
    if (!startD || !endD) return false;
    const d = new Date(ymd + "T12:00:00");
    return d >= startD && d <= endD;
  }

  function isStartOrEnd(day: number) {
    const ymd = formatYMD(new Date(year, month, day));
    return ymd === startVal || ymd === endVal;
  }

  const monthLabel = customMonth.toLocaleString("en-AU", { month: "long", year: "numeric" });

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[40px] items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:border-neutral-300"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="tabular-nums">{label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-full min-w-[280px] max-w-[320px] rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Presets</p>
            <div className="grid grid-cols-3 gap-1">
              {PRESETS.map((p) => {
                const r = getPresetRange(p.value);
                const active = startDate === r.startDate && endDate === r.endDate;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      onRangeChange(r);
                      setOpen(false);
                    }}
                    className={`flex min-w-0 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-neutral-100 pt-3">
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Custom range</p>
              <p className="mt-0.5 text-xs text-neutral-400">
                {selecting === "start" ? "Click start date" : "Click end date"}
              </p>
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCustomMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold text-neutral-900">{monthLabel}</span>
                  <button
                    type="button"
                    onClick={() => setCustomMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
                    <div key={w} className="py-1 text-[10px] font-medium uppercase text-neutral-400">
                      {w}
                    </div>
                  ))}
                  {days.map((day, i) => {
                    if (day === null) {
                      return <div key={`e-${i}`} />;
                    }
                    const ymd = formatYMD(new Date(year, month, day));
                    const isToday = ymd === todayYMD;
                    const inRange = isInRange(day);
                    const isStartOrEndDay = isStartOrEnd(day);
                    const isCurrentMonth = true;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => isCurrentMonth && handleDayClick(day)}
                        disabled={!isCurrentMonth}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${
                          !isCurrentMonth
                            ? "text-neutral-300 cursor-default"
                            : isStartOrEndDay
                              ? "bg-accent font-semibold text-neutral-900 hover:bg-accent-hover"
                              : inRange
                                ? "bg-accent-light text-neutral-900 hover:bg-accent-muted"
                                : isToday
                                  ? "border border-neutral-300 font-medium text-neutral-900 hover:bg-neutral-100"
                                  : "text-neutral-700 hover:bg-neutral-100"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
