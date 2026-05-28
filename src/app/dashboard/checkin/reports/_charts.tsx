"use client";

/**
 * Recharts components extracted into their own client chunk so they
 * can be dynamic-imported from the parent page (Wave 5 H.6).
 *
 * Recharts is ~95KB gzipped and only ever renders on this Reports
 * page when the admin picks a chart-bearing report type. Keeping
 * the import here means the dependency only enters the bundle the
 * first time someone actually opens a chart — not on every dashboard
 * load.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const VC_CORAL = "#E07A5F";
const VC_SAGE = "#7FA67D";
const VC_INDIGO = "#2D3047";

export interface AttendanceChartProps {
  entries: Array<{ date: string; label: string; count: number }>;
  peak: number;
}

export function AttendanceChart({ entries, peak }: AttendanceChartProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={entries} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DE" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#8E8A82" }}
          tickLine={false}
          axisLine={{ stroke: "#E8E4DE" }}
          interval={entries.length > 14 ? Math.floor(entries.length / 10) : 0}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#8E8A82" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #E8E4DE",
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
          labelFormatter={(label) => `${label}`}
          formatter={(value) => [String(value), "Check-ins"]}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {entries.map((entry) => (
            <Cell
              key={entry.date}
              fill={entry.count === peak ? VC_CORAL : `${VC_CORAL}99`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface RoomChartProps {
  rooms: Array<{
    id: string;
    name: string;
    stillIn: number;
    checkedOut: number;
    total: number;
  }>;
}

export function RoomChart({ rooms }: RoomChartProps) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rooms.length * 48 + 40)}>
      <BarChart
        data={rooms}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DE" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#8E8A82" }}
          tickLine={false}
          axisLine={{ stroke: "#E8E4DE" }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12, fill: VC_INDIGO }}
          tickLine={false}
          axisLine={false}
          width={120}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #E8E4DE",
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        />
        <Bar dataKey="stillIn" name="Still In" stackId="a" fill={VC_CORAL} radius={[0, 0, 0, 0]} />
        <Bar dataKey="checkedOut" name="Checked Out" stackId="a" fill={VC_SAGE} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
