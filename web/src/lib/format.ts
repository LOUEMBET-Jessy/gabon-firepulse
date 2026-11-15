/** Mise en forme francaise des nombres et des dates. */

const int = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const two = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const MISSING = "n. d.";

export function fmtInt(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? MISSING : int.format(value);
}

export function fmt1(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? MISSING : one.format(value);
}

export function fmt2(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? MISSING : two.format(value);
}

/** Pourcentage a partir d'une fraction (0,146 donne "14,6 %"). */
export function fmtPct(fraction: number | null | undefined, digits = 0): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return MISSING;
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(fraction * 100)} %`;
}

/** Ecart relatif signe par rapport a une reference ("+38 %", "-12 %"). */
export function fmtDelta(value: number, reference: number | null): string {
  if (reference === null || reference <= 0) return MISSING;
  const pct = Math.round(((value - reference) / reference) * 100);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)} %`;
}

export function fmtScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return MISSING;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${one.format(Math.abs(value))}`;
}

export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const MONTHS_LETTER = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function monthLabel(month: number, year?: number): string {
  return year === undefined ? MONTHS[month - 1] : `${MONTHS[month - 1]} ${year}`;
}

/** "2025-08-03" donne "3 août 2025". */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]} ${y}`;
}

export function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** Horodatage UTC ISO donne "13 nov. 2026 à 09:25 UTC". */
export function fmtDateTimeUtc(iso: string): string {
  return `${fmtDateShort(iso)} à ${iso.slice(11, 16)} UTC`;
}

export function fmtPeriod(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) return `Année ${fy}`;
  if (fy === ty && fm === tm && fd === 1 && td === lastDay) return `${MONTHS[fm - 1]} ${fy}`.replace(/^./, (c) => c.toUpperCase());
  if (fd === 1 && td === lastDay && fy === ty) return `${MONTHS[fm - 1]} à ${MONTHS[tm - 1]} ${fy}`.replace(/^./, (c) => c.toUpperCase());
  return `${fmtDateShort(from)} au ${fmtDateShort(to)}`;
}

export function fmtCoord(value: number, digits = 4): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function fmtArea(km2: number | null): string {
  return km2 === null ? MISSING : `${int.format(Math.round(km2 / 10) * 10)} km²`;
}

const DAY_MS = 86_400_000;

export function isoToMs(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

export function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return msToIso(isoToMs(iso) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((isoToMs(to) - isoToMs(from)) / DAY_MS) + 1;
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
