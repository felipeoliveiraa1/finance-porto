import { cn } from "@/lib/utils";

type Palette = {
  gradient: string;
  shadow: string;
  shine: string;
};

const PALETTES: Record<string, Palette> = {
  itau: {
    gradient: "linear-gradient(135deg, #001f3d 0%, #003874 50%, #ec7000 130%)",
    shadow: "0 12px 40px -8px rgba(236, 112, 0, 0.45), 0 0 0 1px rgba(255,255,255,0.06) inset",
    shine: "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.22), transparent 55%)",
  },
  nubank: {
    gradient: "linear-gradient(135deg, #2a0050 0%, #6f00bd 50%, #b264ff 130%)",
    shadow: "0 12px 40px -8px rgba(130, 10, 209, 0.55), 0 0 0 1px rgba(255,255,255,0.06) inset",
    shine: "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.25), transparent 55%)",
  },
  santander: {
    gradient: "linear-gradient(135deg, #1a0000 0%, #8b0000 50%, #ec0000 130%)",
    shadow: "0 12px 40px -8px rgba(236, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.06) inset",
    shine: "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.22), transparent 55%)",
  },
  mercadolivre: {
    gradient: "linear-gradient(135deg, #142066 0%, #2d3277 45%, #ffe600 130%)",
    shadow: "0 12px 40px -8px rgba(255, 230, 0, 0.45), 0 0 0 1px rgba(255,255,255,0.06) inset",
    shine: "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.25), transparent 55%)",
  },
  default: {
    gradient: "linear-gradient(135deg, #1e293b 0%, #334155 50%, #4f8cff 130%)",
    shadow: "0 12px 40px -8px rgba(79, 140, 255, 0.45), 0 0 0 1px rgba(255,255,255,0.06) inset",
    shine: "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.2), transparent 55%)",
  },
};

function detectBank(name: string, bank: string): keyof typeof PALETTES {
  const cardLower = name.trim().toLowerCase();
  const all = (name + " " + bank).toLowerCase();
  if (all.includes("itau") || all.includes("itaú")) return "itau";
  if (
    all.includes("mercado livre") ||
    all.includes("mercadolivre") ||
    all.includes("mercado pago") ||
    all.includes("mercadopago") ||
    all.includes(" mp ") ||
    /\bml\b/.test(all)
  )
    return "mercadolivre";
  if (
    all.includes("nubank") ||
    all.includes("nu pagamentos") ||
    cardLower === "gold" ||
    cardLower === "platinum" ||
    cardLower === "ultravioleta"
  )
    return "nubank";
  if (all.includes("santander") || all.includes("elite")) return "santander";
  return "default";
}

function detectBrand(name: string): "VISA" | "MASTERCARD" | "ELO" | "AMEX" | null {
  const s = name.toUpperCase();
  if (s.includes("VISA")) return "VISA";
  if (s.includes("MASTER")) return "MASTERCARD";
  if (s.includes("ELO")) return "ELO";
  if (s.includes("AMEX") || s.includes("AMERICAN")) return "AMEX";
  // Heuristic: Nubank's "gold" cards are Mastercard
  if (s.match(/^GOLD/) || s === "GOLD") return "MASTERCARD";
  return null;
}

function detectLevel(name: string): string | null {
  const s = name.toUpperCase();
  if (s.includes("BLACK")) return "BLACK";
  if (s.includes("PLATINUM") || s.includes("ELITE")) return "PLATINUM";
  if (s.includes("GOLD")) return "GOLD";
  if (s.includes("INFINITE")) return "INFINITE";
  return null;
}

function lastFour(num: string | null | undefined): string {
  if (!num) return "••••";
  const digits = num.replace(/\D/g, "");
  return digits.slice(-4).padStart(4, "•");
}

const NAME_PARTICLES = new Set(["DE", "DA", "DO", "DOS", "DAS", "E"]);

function formatHolderName(owner: string | null | undefined): string {
  if (!owner) return "TITULAR";
  const cleaned = owner.trim().replace(/\s+/g, " ");
  if (!cleaned) return "TITULAR";
  const parts = cleaned.split(" ");
  if (parts.length === 1) return parts[0].toUpperCase();
  const first = parts[0];
  const surname =
    parts.slice(1).find((p) => !NAME_PARTICLES.has(p.toUpperCase())) ?? parts[parts.length - 1];
  return `${first} ${surname}`.toUpperCase();
}

const BankLabel: Record<keyof typeof PALETTES, string> = {
  itau: "Itaú",
  nubank: "Nubank",
  santander: "Santander",
  mercadolivre: "Mercado Pago",
  default: "Banco",
};

export function CreditCardVisual({
  cardName,
  bankConnectorName,
  number,
  owner,
  compact = false,
  className,
}: {
  cardName: string;
  bankConnectorName: string;
  number?: string | null;
  owner?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const bankKey = detectBank(cardName, bankConnectorName);
  const palette = PALETTES[bankKey];
  const brand = detectBrand(cardName);
  const level = detectLevel(cardName);
  const last4 = lastFour(number);
  const display = BankLabel[bankKey];
  const holder = formatHolderName(owner);

  if (compact) {
    return (
      <div
        className={cn(
          "relative aspect-[1.586/1] w-full overflow-hidden rounded-xl",
          className,
        )}
        style={{ background: palette.gradient, boxShadow: palette.shadow }}
      >
        <div className="absolute inset-0" style={{ backgroundImage: palette.shine }} />
        <div className="relative flex h-full flex-col justify-between p-3">
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/95">
              {display}
            </p>
            {brand && <BrandLogo brand={brand} compact />}
          </div>
          <div className="flex items-end justify-between gap-2">
            <div
              className="h-5 w-7 rounded-sm"
              style={{
                background:
                  "linear-gradient(135deg, #d4af37 0%, #f5e7a3 30%, #b8860b 70%, #f5e7a3 100%)",
                boxShadow: "inset 0 0 4px rgba(0,0,0,0.3)",
              }}
            />
            <p className="font-mono text-[11px] tracking-[0.14em] text-white/95">
              <span className="opacity-50">····</span>{" "}
              <span className="text-white">{last4}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FullCardVisual
      bankKey={bankKey}
      palette={palette}
      brand={brand}
      level={level}
      last4={last4}
      display={display}
      holder={holder}
      cardName={cardName}
      className={className}
    />
  );
}

function FullCardVisual({
  bankKey,
  palette,
  brand,
  level,
  last4,
  display,
  holder,
  cardName,
  className,
}: {
  bankKey: keyof typeof PALETTES;
  palette: Palette;
  brand: ReturnType<typeof detectBrand>;
  level: string | null;
  last4: string;
  display: string;
  holder: string;
  cardName: string;
  className?: string;
}) {

  return (
    <div
      className={cn(
        "group relative aspect-[1.586/1] w-full overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5",
        className,
      )}
      style={{ background: palette.gradient, boxShadow: palette.shadow }}
    >
      {/* Shine highlight */}
      <div className="absolute inset-0" style={{ backgroundImage: palette.shine }} />
      {/* Subtle holographic stripe */}
      <div
        className="absolute -right-12 top-0 h-full w-32 opacity-[0.07]"
        style={{
          background:
            "linear-gradient(115deg, transparent 0%, #fff 30%, #fff 60%, transparent 100%)",
          mixBlendMode: "overlay",
        }}
      />
      {/* Diagonal pattern */}
      <svg
        className="absolute inset-0 opacity-[0.06]"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`grid-${bankKey}`} width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M 22 0 L 0 0 0 22" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${bankKey})`} />
      </svg>

      <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
        {/* Top: bank label + level */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/95">
              {display}
            </p>
            <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-white/55">
              {cardName.trim()}
            </p>
          </div>
          {level && (
            <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/85 backdrop-blur-sm">
              {level}
            </span>
          )}
        </div>

        {/* Middle: chip */}
        <div className="flex items-center gap-2">
          <div
            className="relative h-7 w-9 overflow-hidden rounded-md"
            style={{
              background:
                "linear-gradient(135deg, #d4af37 0%, #f5e7a3 30%, #b8860b 70%, #f5e7a3 100%)",
              boxShadow: "inset 0 0 6px rgba(0,0,0,0.3)",
            }}
          >
            <div className="absolute inset-1 rounded-sm border border-yellow-900/30">
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-yellow-900/30" />
              <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-yellow-900/30" />
            </div>
          </div>
          {/* Contactless icon */}
          <svg className="h-4 w-4 text-white/60" viewBox="0 0 24 24" fill="none">
            <path
              d="M2 12c0-3 1-5 3-7M22 12c0-3-1-5-3-7M5 12c0-2 .5-3 1.5-4.5M19 12c0-2-.5-3-1.5-4.5M8 12c0-1 .3-1.8 1-3M16 12c0-1-.3-1.8-1-3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Bottom: number + brand */}
        <div>
          <p className="font-mono text-[15px] tracking-[0.18em] text-white/95">
            <span className="opacity-50">••••</span>{" "}
            <span className="opacity-50">••••</span>{" "}
            <span className="opacity-50">••••</span>{" "}
            <span className="text-white">{last4}</span>
          </p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55">
                titular
              </p>
              <p className="mt-0.5 truncate text-xs font-bold uppercase tracking-[0.12em] text-white">
                {holder}
              </p>
            </div>
            {brand && <BrandLogo brand={brand} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandLogo({
  brand,
  compact,
}: {
  brand: "VISA" | "MASTERCARD" | "ELO" | "AMEX";
  compact?: boolean;
}) {
  const dotSize = compact ? "h-3.5 w-3.5" : "h-6 w-6";
  if (brand === "MASTERCARD") {
    return (
      <div className="flex items-center">
        <span className={cn("block rounded-full bg-[#eb001b] mix-blend-screen", dotSize)} />
        <span className={cn("-ml-1.5 block rounded-full bg-[#f79e1b] mix-blend-screen", dotSize)} />
      </div>
    );
  }
  if (brand === "VISA") {
    return (
      <span
        className={cn(
          "font-serif font-extrabold italic tracking-wider text-white",
          compact ? "text-[10px]" : "text-base",
        )}
      >
        VISA
      </span>
    );
  }
  if (brand === "ELO") {
    return (
      <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
        ELO
      </span>
    );
  }
  if (brand === "AMEX") {
    return (
      <span className="rounded-md bg-[#006fcf] px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white">
        AMEX
      </span>
    );
  }
  return null;
}
