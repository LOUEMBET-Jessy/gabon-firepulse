/** Aides de classes CSS, sans dependance : utilisables dans les composants serveur comme client. */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return cx(
    "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
    size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-[13.5px]",
    variant === "primary" && "bg-accent text-accent-ink hover:bg-accent-strong",
    variant === "secondary" && "border border-line-strong bg-surface-2 text-ink hover:border-ink-3 hover:bg-surface-3",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
  );
}
