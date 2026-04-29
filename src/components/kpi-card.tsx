import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "danger" | "purple" | "muted";

const iconWrap: Record<Tone, string> = {
  primary: "bg-primary/15 text-primary glow-primary",
  success: "bg-success/15 text-success glow-success",
  warning: "bg-warning/15 text-warning glow-warning",
  danger: "bg-destructive/15 text-destructive glow-danger",
  purple: "bg-[rgb(178,100,255)]/15 text-[rgb(178,100,255)] glow-purple",
  muted: "bg-white/5 text-muted-foreground",
};

const valueGradient: Record<Tone, string> = {
  primary: "text-gradient-primary",
  success: "text-gradient-success",
  warning: "text-gradient-warning",
  danger: "text-gradient-danger",
  purple: "text-gradient-primary",
  muted: "",
};

export function KpiCard({
  icon,
  label,
  value,
  delta,
  tone = "primary",
  hint,
  invertDelta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: number | null;
  tone?: Tone;
  hint?: string;
  invertDelta?: boolean;
}) {
  const showDelta = typeof delta === "number" && Number.isFinite(delta);
  const positive = showDelta && delta > 0;
  const negative = showDelta && delta < 0;
  const goodWhenUp = !invertDelta;
  const deltaIsGood = showDelta ? (positive ? goodWhenUp : negative ? !goodWhenUp : true) : true;

  return (
    <div className="group relative overflow-hidden rounded-2xl glass border-gradient top-highlight p-5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-elevated">
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 transition-transform group-hover:scale-105",
            iconWrap[tone],
          )}
        >
          {icon}
        </div>
        {showDelta && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums backdrop-blur-md",
              deltaIsGood
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : negative ? (
              <ArrowDownRight className="h-3 w-3" />
            ) : null}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-1.5 text-[28px] font-semibold leading-tight tabular-nums",
            valueGradient[tone] || "text-foreground",
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
