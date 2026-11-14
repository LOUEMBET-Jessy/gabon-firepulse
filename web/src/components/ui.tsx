"use client";

import { CaretDown, CloudSlash, Info, Warning, WarningOctagon, ArrowUp, ArrowDown, Minus, Question } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { buttonClass, cx, type ButtonSize, type ButtonVariant } from "@/lib/classes";
import { fmtDateShort, fmtDateTimeUtc } from "@/lib/format";
import { RELIABILITY, STATUS, TONE_COLOR } from "@/lib/labels";
import type { AnomalyStatus, Reliability } from "@/lib/science/anomaly";
import type { Provenance } from "@/lib/types";

export { buttonClass, cx };

/* ------------------------------------------------------------------ Panneaux */

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("rounded-panel bg-surface shadow-[inset_0_0_0_1px_rgb(255_255_255/0.035)]", className)} {...rest}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  subtitle,
  help,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  help?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">
          <span className="text-balance">{title}</span>
          {help ? <InfoTip text={help} /> : null}
        </h2>
        {subtitle ? <p className="mt-1 text-[13px] leading-snug text-ink-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Reference des donnees sous chaque graphique : capteur, produit, periode, date d'acces (exigence F-14). */
export function SourceNote({ provenance, extra }: { provenance: Provenance | undefined; extra?: string }) {
  if (!provenance) return null;
  return (
    <footer className="mt-1 border-t border-line/70 px-5 py-3 text-[11.5px] leading-relaxed text-ink-3">
      <span className="text-ink-2">Source :</span> {provenance.source}, MODIS (Terra, Aqua) et VIIRS (Suomi-NPP, NOAA-20). Données du{" "}
      {fmtDateShort(provenance.dataFirstDate)} au {fmtDateShort(provenance.dataLastDate)}, consultées le {fmtDateTimeUtc(provenance.accessedAt)}.
      {extra ? ` ${extra}` : ""}
    </footer>
  );
}

/* ------------------------------------------------------------------ Controles */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant, size, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cx(buttonClass(variant, size), className)} {...rest} />;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-control border border-line-strong bg-surface-2 p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              "h-7 rounded-[6px] px-2.5 text-[12.5px] font-medium transition-colors duration-150 disabled:opacity-40",
              active ? "bg-surface-3 text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]" : "text-ink-3 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx("flex cursor-pointer items-center gap-2.5 py-1 text-[13px] text-ink-2", disabled && "cursor-not-allowed opacity-50")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="check"
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

export const inputClass =
  "h-9 w-full rounded-control border border-line-strong bg-surface-2 px-2.5 text-[13px] text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3 focus:border-accent focus:outline-none";

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-ink-2">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-[12px] text-critical">{error}</p> : hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Popover et infobulle */

export function Popover({
  trigger,
  children,
  align = "start",
  width = 320,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  width?: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Un popover ouvert ne doit pas le rester quand l'ecran est masque puis restaure par la navigation.
  useLayoutEffect(() => () => setOpen(false), []);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          style={{ width: `min(${width}px, calc(100vw - 24px))` }}
          className={cx(
            "absolute top-[calc(100%+6px)] z-30 animate-fade-up rounded-panel border border-line-strong bg-surface-2 p-3 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.7)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function InfoTip({ text, label = "Définition" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-5 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink"
      >
        <Question size={14} weight="bold" />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+6px)] z-30 w-[min(300px,80vw)] -translate-x-1/2 rounded-control border border-line-strong bg-surface-3 px-3 py-2 text-left text-[12.5px] font-normal leading-relaxed text-ink-2 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)]"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function SelectButton({ open, onClick, icon, children, label, tour }: { open: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode; label: string; tour?: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={label}
      data-tour={tour}
      onClick={onClick}
      className={cx(
        "flex h-9 max-w-full items-center gap-2 rounded-control border bg-surface-2 pl-2.5 pr-2 text-[13px] font-medium text-ink transition-colors",
        open ? "border-accent" : "border-line-strong hover:border-ink-3",
      )}
    >
      <span className="shrink-0 text-ink-3">{icon}</span>
      <span className="truncate">{children}</span>
      <CaretDown size={12} weight="bold" className={cx("shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
    </button>
  );
}

/* ------------------------------------------------------------------ Etats */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton", className)} />;
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="px-5 py-4" role="status" aria-label="Chargement des données">
      <div style={{ height }} className="skeleton w-full" />
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const offline = error instanceof ApiError && error.status === 0;
  const message = error instanceof Error ? error.message : "Erreur inconnue.";
  return (
    <div role="alert" className={cx("flex flex-col items-start gap-3 px-5", compact ? "py-4" : "py-8")}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-critical">{offline ? <CloudSlash size={20} /> : <WarningOctagon size={20} />}</span>
        <div>
          <p className="text-[14px] font-medium text-ink">{offline ? "Serveur injoignable" : "Les données n'ont pas pu être chargées"}</p>
          <p className="mt-1 max-w-[60ch] text-[13px] leading-relaxed text-ink-2">{message}</p>
          <p className="mt-1 text-[12.5px] text-ink-3">Aucune valeur n'est affichée à la place : un résultat absent n'est pas une absence de feu.</p>
        </div>
      </div>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="text-ink-3">{icon ?? <Info size={22} />}</span>
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {children ? <div className="max-w-[52ch] text-[13px] leading-relaxed text-ink-3">{children}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning"; title?: string; children: React.ReactNode }) {
  return (
    <div
      className={cx(
        "flex gap-3 rounded-control border px-3.5 py-3 text-[13px] leading-relaxed",
        tone === "warning" ? "border-warning/30 bg-warning/[0.06] text-ink-2" : "border-line-strong bg-surface-2 text-ink-2",
      )}
    >
      <span className={cx("mt-0.5 shrink-0", tone === "warning" ? "text-warning" : "text-accent")}>
        {tone === "warning" ? <Warning size={16} weight="fill" /> : <Info size={16} weight="fill" />}
      </span>
      <div className="min-w-0">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Etiquettes */

const STATUS_ICON: Record<AnomalyStatus, React.ReactNode> = {
  strong_high: <ArrowUp size={12} weight="bold" />,
  high: <ArrowUp size={12} weight="bold" />,
  normal: <Minus size={12} weight="bold" />,
  low: <ArrowDown size={12} weight="bold" />,
  low_activity: <Minus size={12} weight="bold" />,
  insufficient: <Question size={12} weight="bold" />,
  incomplete: <CloudSlash size={12} weight="bold" />,
};

/** Statut d'une periode : icone + libelle, jamais la couleur seule. */
export function StatusBadge({ status, long }: { status: AnomalyStatus; long?: boolean }) {
  const s = STATUS[status];
  const color = TONE_COLOR[s.tone];
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-medium"
      style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}
    >
      {STATUS_ICON[status]}
      {status === "strong_high" ? <ArrowUp size={12} weight="bold" className="-ml-1.5" /> : null}
      {long ? s.label : s.short}
    </span>
  );
}

export function ReliabilityBadge({ reliability }: { reliability: Reliability }) {
  const dots = reliability === "high" ? 3 : reliability === "moderate" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2" title={RELIABILITY[reliability].detail}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx("h-2.5 w-1 rounded-[1px]", i <= dots ? "bg-ink-2" : "bg-line-strong")} />
        ))}
      </span>
      {RELIABILITY[reliability].label}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium",
        tone === "accent" ? "border-accent/40 bg-accent/10 text-accent" : "border-line-strong bg-surface-2 text-ink-2",
      )}
    >
      {children}
    </span>
  );
}

/** Marqueur de capteur : forme + couleur (carre MODIS, disque VIIRS). */
export function SensorMark({ color, shape, size = 10 }: { color: string; shape: "square" | "circle"; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0"
      style={{ width: size, height: size, backgroundColor: color, borderRadius: shape === "circle" ? "50%" : 2 }}
    />
  );
}

export function PageHeader({ title, lead, actions }: { title: string; lead?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-ink md:text-[34px]">{title}</h1>
        {lead ? <p className="mt-2 max-w-[72ch] text-[15px] leading-relaxed text-ink-2">{lead}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
