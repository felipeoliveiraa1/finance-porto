import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  action,
  className,
  children,
  bare,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  bare?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl glass top-highlight", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            {title && (
              <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={bare ? "" : "p-6"}>{children}</div>
    </div>
  );
}
