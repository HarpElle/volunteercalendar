"use client";

import { useState, useEffect } from "react";
import type { RecurrenceRule, RecurrenceFrequency, RecurrenceEndType } from "@/lib/types";

interface RecurrenceRulePickerProps {
  value: RecurrenceRule | null;
  onChange: (rule: RecurrenceRule | null) => void;
  startDate: string; // ISO date
}

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 Weeks",
  monthly_by_date: "Monthly (by date)",
  monthly_by_weekday: "Monthly (by weekday)",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RecurrenceRulePicker({
  value,
  onChange,
  startDate,
}: RecurrenceRulePickerProps) {
  const [enabled, setEnabled] = useState(!!value);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    value?.frequency || "weekly",
  );
  const [interval, setInterval] = useState(value?.interval || 1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    value?.days_of_week || [],
  );
  const [endType, setEndType] = useState<RecurrenceEndType>(
    value?.end_type || "count",
  );
  const [endDate, setEndDate] = useState(value?.end_date || "");
  const [count, setCount] = useState(value?.count || 4);

  // Auto-select the day of week from the start date
  useEffect(() => {
    if (startDate && daysOfWeek.length === 0) {
      const d = new Date(startDate + "T12:00:00");
      setDaysOfWeek([d.getDay()]);
    }
  }, [startDate, daysOfWeek.length]);

  // Emit changes
  useEffect(() => {
    if (!enabled) {
      onChange(null);
      return;
    }
    const rule: RecurrenceRule = {
      frequency,
      interval,
      end_type: endType,
    };
    if (
      frequency === "weekly" ||
      frequency === "biweekly" ||
      frequency === "daily"
    ) {
      rule.days_of_week = daysOfWeek;
    }
    if (endType === "until_date") {
      rule.end_date = endDate;
    }
    if (endType === "count") {
      rule.count = count;
    }
    onChange(rule);
  }, [enabled, frequency, interval, daysOfWeek, endType, endDate, count, onChange]);

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  // Build summary text
  function getSummary(): string {
    if (!enabled) return "";
    let text = FREQUENCY_LABELS[frequency];
    if (interval > 1 && frequency !== "biweekly") {
      text = `Every ${interval} ${frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : "months"}`;
    }
    if (
      (frequency === "weekly" || frequency === "biweekly") &&
      daysOfWeek.length > 0
    ) {
      text += ` on ${daysOfWeek.sort().map((d) => DAY_LABELS[d]).join(", ")}`;
    }
    if (endType === "count") {
      text += `, ${count} times`;
    } else if (endType === "until_date" && endDate) {
      text += ` until ${endDate}`;
    }
    return text;
  }

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 rounded border-gray-300 text-vc-coral focus:ring-vc-coral/30"
        />
        <span className="text-sm font-medium text-gray-700">
          Repeat this reservation
        </span>
      </label>

      {enabled && (
        <div className="space-y-3 pl-8">
          {/* Frequency */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as RecurrenceFrequency)
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
            >
              {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Day of week selector (for weekly/biweekly) */}
          {(frequency === "weekly" || frequency === "biweekly") && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Days
              </label>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`w-10 h-10 rounded-lg text-xs font-medium transition-colors ${
                      daysOfWeek.includes(idx)
                        ? "bg-vc-coral text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* End condition */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Ends
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="end_type"
                  checked={endType === "count"}
                  onChange={() => setEndType("count")}
                  className="text-vc-coral focus:ring-vc-coral/30"
                />
                <span className="text-sm text-gray-700">After</span>
                {endType === "count" && (
                  <input
                    type="number"
                    value={count}
                    onChange={(e) =>
                      setCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    min={1}
                    max={52}
                    className="w-16 rounded border border-gray-200 px-2 py-1 text-sm text-center focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                )}
                <span className="text-sm text-gray-700">occurrences</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="end_type"
                  checked={endType === "until_date"}
                  onChange={() => setEndType("until_date")}
                  className="text-vc-coral focus:ring-vc-coral/30"
                />
                <span className="text-sm text-gray-700">On date</span>
                {endType === "until_date" && (
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded border border-gray-200 px-2 py-1 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                )}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="end_type"
                  checked={endType === "never"}
                  onChange={() => setEndType("never")}
                  className="text-vc-coral focus:ring-vc-coral/30"
                />
                <span className="text-sm text-gray-700">
                  Never (up to 52 weeks)
                </span>
              </label>
            </div>
          </div>

          {/* Summary */}
          <p className="text-xs text-gray-400 italic">{getSummary()}</p>
        </div>
      )}
    </div>
  );
}
