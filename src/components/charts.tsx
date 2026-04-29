"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL, formatCompactBRL, formatDateShort } from "@/lib/format";

const NEON_PALETTE = ["#4f8cff", "#00f5a0", "#ffb547", "#ff4566", "#b264ff", "#22d3ee", "#f472b6", "#84cc16"];

const tooltipStyle = {
  backgroundColor: "rgba(18, 20, 38, 0.95)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: 12,
  fontSize: 12,
  padding: "10px 14px",
  color: "#f5f5f7",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
};

const tooltipItemStyle = { color: "#f5f5f7" };
const tooltipLabelStyle = { color: "#9095ad", fontSize: 11, fontWeight: 500, marginBottom: 4 };

const axisTick = { fill: "#9095ad", fontSize: 11 };

export function DailySpendChart({ data }: { data: { date: string; amount: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f8cff" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#4f8cff" stopOpacity={0} />
          </linearGradient>
          <filter id="neonBlue" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatDateShort(v)}
          minTickGap={30}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatCompactBRL(v)}
          width={60}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          cursor={{ stroke: "rgba(79,140,255,0.3)", strokeWidth: 1, strokeDasharray: "4 4" }}
          labelFormatter={(v) => formatDateShort(v)}
          formatter={(v) => [formatBRL(Number(v)), "Gasto"]}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="#4f8cff"
          strokeWidth={2.5}
          fill="url(#spendGrad)"
          filter="url(#neonBlue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CashflowChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <filter id="neonGreen" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="neonRed" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => {
            const [, m] = v.split("-");
            return ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m) - 1] ?? v;
          }}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatCompactBRL(v)}
          width={60}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1, strokeDasharray: "4 4" }}
          formatter={(v, name) => [formatBRL(Number(v)), name === "income" ? "Entradas" : "Saídas"]}
        />
        <Line
          type="monotone"
          dataKey="income"
          stroke="#00f5a0"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, fill: "#00f5a0", stroke: "rgba(0, 245, 160, 0.3)", strokeWidth: 8 }}
          filter="url(#neonGreen)"
        />
        <Line
          type="monotone"
          dataKey="expense"
          stroke="#ff4566"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, fill: "#ff4566", stroke: "rgba(255, 69, 102, 0.3)", strokeWidth: 8 }}
          filter="url(#neonRed)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ data }: { data: { name: string; total: number }[] }) {
  const slice = data.slice(0, 7);
  const others = data.slice(7).reduce((s, d) => s + d.total, 0);
  const finalData = others > 0 ? [...slice, { name: "Outros", total: others }] : slice;
  const total = finalData.reduce((s, d) => s + d.total, 0);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              <filter id="neonDonut" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <Pie
              data={finalData}
              dataKey="total"
              nameKey="name"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={3}
              stroke="none"
              filter="url(#neonDonut)"
            >
              {finalData.map((_, i) => (
                <Cell key={i} fill={NEON_PALETTE[i % NEON_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v) => [formatBRL(Number(v)), ""]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Total mês</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-gradient-primary">
            {formatCompactBRL(total)}
          </p>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {finalData.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: NEON_PALETTE[i % NEON_PALETTE.length],
                boxShadow: `0 0 8px ${NEON_PALETTE[i % NEON_PALETTE.length]}`,
              }}
            />
            <span className="flex-1 truncate text-foreground/90">{d.name}</span>
            <span className="font-medium tabular-nums text-muted-foreground">
              {((d.total / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BankBreakdown({
  data,
}: {
  data: { name: string; total: number; count: number; color?: string | null }[];
}) {
  const total = data.reduce((s, d) => s + d.total, 0);
  return (
    <ul className="space-y-4">
      {data.map((d, i) => {
        const pct = total > 0 ? (d.total / total) * 100 : 0;
        const color = d.color ? `#${d.color}` : NEON_PALETTE[i % NEON_PALETTE.length];
        return (
          <li key={d.name} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                />
                <span className="font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground">{d.count}x</span>
              </span>
              <span className="font-medium tabular-nums">{formatBRL(d.total)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                  boxShadow: `0 0 12px ${color}88`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
