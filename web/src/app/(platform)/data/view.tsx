"use client";

import { CheckCircle, DownloadSimple, FileCsv, Warning } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";

import { EmptyState, ErrorState, Notice, PageHeader, Panel, PanelHeader, SensorMark, Skeleton, buttonClass, cx } from "@/components/ui";
import { useMetadata } from "@/lib/api";
import { fmtDate, fmtDateShort, fmtDateTimeUtc, fmtInt, fmtPct, isoToMs } from "@/lib/format";
import { SATELLITES } from "@/lib/labels";
import type { MetadataResponse, SourceFile } from "@/lib/types";

/**
 * Etat des sources et journal de qualite (exigences F-03, F-04, NFR-03 ; tests T-01 a T-03) :
 * quels fichiers ont ete importes, quand, avec quelle empreinte, et ce que la validation a ecarte.
 */

const DATASETS: { key: string; label: string; sats: string }[] = [
  { key: "modis", label: "MODIS", sats: "Terra et Aqua, pixel de 1 km" },
  { key: "viirs-snpp", label: "VIIRS Suomi-NPP", sats: "pixel de 375 m" },
  { key: "viirs-jpss1", label: "VIIRS NOAA-20", sats: "pixel de 375 m" },
];

/** Controles appliques a chaque ligne par le pipeline (pipeline/firepulse/ingest.py). */
const CHECKS: { label: string; action: "rejet" | "avertissement" }[] = [
  { label: "Coordonnées numériques et dans les plages valides (latitude ±90°, longitude ±180°)", action: "rejet" },
  { label: "Coordonnées dans l'emprise attendue autour du Gabon", action: "rejet" },
  { label: "Date d'acquisition lisible et postérieure à 2000", action: "rejet" },
  { label: "Heure d'acquisition au format HHMM valide", action: "rejet" },
  { label: "Satellite connu et cohérent avec le fichier (MODIS ou VIIRS)", action: "rejet" },
  { label: "Instrument cohérent avec le jeu de données", action: "rejet" },
  { label: "Confiance valide : 0 à 100 pour MODIS, classes l, n, h pour VIIRS", action: "rejet" },
  { label: "Indicateur jour ou nuit valide (D ou N)", action: "rejet" },
  { label: "Doublon technique : même satellite, même position, même instant", action: "rejet" },
  { label: "FRP, luminosité, taille du pixel illisibles : valeur marquée indisponible", action: "avertissement" },
  { label: "Type de source inconnu : détection conservée mais exclue de l'indice", action: "avertissement" },
];

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "good" | "warning" }) {
  return (
    <Panel className="kpi-accent flex flex-col gap-2 p-5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">{label}</p>
      <p className={cx("num text-[28px] font-semibold leading-none tracking-[-0.02em]", tone === "good" ? "text-good" : tone === "warning" ? "text-warning" : "text-ink")}>{value}</p>
      <p className="text-[12px] leading-snug text-ink-3">{detail}</p>
    </Panel>
  );
}

export function DataView() {
  const { data: meta, error, mutate } = useMetadata();
  return (
    <>
      <PageHeader
        title="Données et sources"
        lead="État de l'import : fichiers NASA FIRMS chargés, période couverte par chaque satellite et résultat des contrôles de qualité. Chaque chiffre de l'application remonte à ces fichiers."
        actions={
          <a href="/api/metadata" download="firepulse_metadonnees.json" className={buttonClass("secondary", "sm")}>
            <DownloadSimple size={15} /> Métadonnées (JSON)
          </a>
        }
      />
      {error ? (
        <Panel>
          <ErrorState error={error} onRetry={() => mutate()} />
        </Panel>
      ) : !meta ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[120px] rounded-panel" />
          ))}
        </div>
      ) : (
        <Content meta={meta} />
      )}
    </>
  );
}

function Content({ meta }: { meta: MetadataResponse }) {
  const rejected = meta.rows.rejected;
  const warnings = meta.quality.warnings.reduce((a, w) => a + w.count, 0);
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Fichiers importés" value={fmtInt(meta.sources.length)} detail={`Archives annuelles FIRMS pour le Gabon, ${DATASETS.length} jeux de données.`} />
        <Kpi label="Lignes lues" value={fmtInt(meta.rows.read)} detail={`${fmtInt(meta.rows.kept)} conservées, ${fmtInt(meta.rows.eligible)} retenues dans l'indice harmonisé.`} />
        <Kpi
          label="Lignes rejetées"
          value={fmtInt(rejected)}
          tone={rejected === 0 ? "good" : "warning"}
          detail={rejected === 0 ? "Toutes les lignes ont passé les contrôles ci-dessous." : `${fmtPct(rejected / meta.rows.read, 2)} des lignes, toutes journalisées.`}
        />
        <Kpi label="Fichiers absents" value={fmtInt(meta.missingYears.length)} tone={meta.missingYears.length ? "warning" : undefined} detail="Années pas encore publiées par FIRMS à la date du téléchargement." />
      </div>

      <Coverage meta={meta} />
      <FileMatrix meta={meta} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Contrôles de qualité" subtitle="Appliqués à chaque ligne lors de l'import. Une ligne rejetée est journalisée, jamais supprimée en silence ni corrigée." />
          <ul className="flex flex-col px-5 pb-4 pt-2">
            {CHECKS.map((c) => (
              <li key={c.label} className="flex items-start gap-3 border-b border-line py-2.5 text-[13px] last:border-b-0">
                <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0 text-good" />
                <span className="min-w-0 flex-1 text-ink-2">{c.label}</span>
                <span className={cx("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", c.action === "rejet" ? "border-line-strong text-ink-3" : "border-warning/40 text-warning")}>
                  {c.action}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Journal de qualité" subtitle={`Résultat de la dernière construction, le ${fmtDateTimeUtc(meta.builtAt)}.`} />
          {meta.quality.rejects.length === 0 && meta.quality.warnings.length === 0 ? (
            <EmptyState title="Aucun rejet, aucun avertissement" icon={<CheckCircle size={26} weight="duotone" className="text-good" />}>
              Les {fmtInt(meta.rows.read)} lignes des {meta.sources.length} fichiers ont toutes passé les contrôles. Les tests automatiques du pipeline vérifient qu&apos;une ligne invalide
              serait bien rejetée et inscrite ici (tests T-03).
            </EmptyState>
          ) : (
            <div className="max-h-[420px] overflow-auto px-5 pb-4 pt-2">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-surface text-[11.5px] text-ink-3">
                  <tr>
                    <th className="py-2 text-left font-normal">Fichier</th>
                    <th className="py-2 text-left font-normal">Ligne ou champ</th>
                    <th className="py-2 text-left font-normal">Motif</th>
                  </tr>
                </thead>
                <tbody>
                  {meta.quality.rejects.map((r) => (
                    <tr key={`${r.file}-${r.line}`} className="border-t border-line">
                      <td className="py-2 pr-2 text-ink-2">{r.file}</td>
                      <td className="num py-2 pr-2 text-ink">ligne {r.line}</td>
                      <td className="py-2 text-critical">{r.reason}</td>
                    </tr>
                  ))}
                  {meta.quality.warnings.map((w) => (
                    <tr key={`${w.file}-${w.field}`} className="border-t border-line">
                      <td className="py-2 pr-2 text-ink-2">{w.file}</td>
                      <td className="num py-2 pr-2 text-ink">
                        {w.field} ({fmtInt(w.count)})
                      </td>
                      <td className="py-2 text-warning">{w.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {warnings ? <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">{fmtInt(warnings)} valeurs optionnelles marquées indisponibles.</p> : null}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Limites administratives" subtitle="Couche de contexte affichée sur la carte et utilisée pour les provinces." />
        <ul className="flex flex-col px-5 pb-4 pt-2">
          {meta.boundaries.map((b) => (
            <li key={b.level} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-2.5 text-[13px] last:border-b-0">
              <span className="text-ink">
                {b.level === "ADM0" ? "Frontière nationale" : "Provinces"} <span className="text-ink-3">({b.level})</span>
              </span>
              <span className="text-ink-3">
                {b.source} · {b.license} · état représenté : {b.year_represented} · téléchargé le {fmtDateShort(b.accessed_at.slice(0, 10))}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Notice title="Données figées, pas de temps réel">
        L&apos;application lit une copie locale des archives FIRMS téléchargées entre le {fmtDateTimeUtc(meta.accessed.first)} et le {fmtDateTimeUtc(meta.accessed.last)}. Elle fonctionne sans connexion. Pour
        mettre à jour : <code className="num rounded bg-surface-3 px-1">python pipeline/acquire.py</code> puis <code className="num rounded bg-surface-3 px-1">python pipeline/build.py</code>.
      </Notice>
    </>
  );
}

/* ------------------------------------------------------------------ Couverture par satellite */

function Coverage({ meta }: { meta: MetadataResponse }) {
  const start = isoToMs("2000-01-01");
  const end = isoToMs("2026-12-31");
  const pos = (iso: string) => ((isoToMs(iso) - start) / (end - start)) * 100;
  const years = [2000, 2005, 2010, 2015, 2020, 2025];
  const gaps = meta.harmonization.gaps;
  return (
    <Panel>
      <PanelHeader
        title="Période couverte par chaque satellite"
        subtitle="Barre pleine : satellite en service et présent dans l'archive. Entailles : interruptions détectées par le pipeline, pendant lesquelles un autre capteur prend le relais."
      />
      <div className="px-5 pb-5 pt-4">
        <div className="flex flex-col gap-3">
          {meta.satellites.map((s) => {
            const sat = SATELLITES[s.key];
            const own = gaps.filter((g) => g.satellite === s.key);
            return (
              <div key={s.key} className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[170px_minmax(0,1fr)_110px]">
                <span className="flex items-center gap-2 text-[13px] text-ink">
                  <SensorMark color={sat.color} shape={sat.shape} />
                  {sat.sensor} {sat.name}
                </span>
                <span className="relative h-5 rounded-full bg-surface-3">
                  <span
                    className="absolute inset-y-0 rounded-full"
                    style={{ left: `${pos(s.first_date)}%`, width: `${pos(s.last_date) - pos(s.first_date)}%`, backgroundColor: sat.color, opacity: 0.85 }}
                    title={`${fmtDate(s.first_date)} au ${fmtDate(s.last_date)}`}
                  />
                  {own.map((g) => (
                    <span
                      key={g.start}
                      className="absolute inset-y-[-3px] w-[3px] rounded-full bg-surface ring-1 ring-critical"
                      style={{ left: `${pos(g.start)}%` }}
                      title={`Interruption du ${fmtDateShort(g.start)} au ${fmtDateShort(g.end)} (${g.days} jours)`}
                    />
                  ))}
                </span>
                <span className="num hidden text-right text-[12px] text-ink-2 sm:block">{fmtInt(s.detections)} dét.</span>
              </div>
            );
          })}
          <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 sm:grid-cols-[170px_minmax(0,1fr)_110px]">
            <span />
            <span className="relative h-4">
              {years.map((y) => (
                <span key={y} className="num absolute -translate-x-1/2 text-[10.5px] text-ink-3" style={{ left: `${pos(`${y}-01-01`)}%` }}>
                  {y}
                </span>
              ))}
            </span>
          </div>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
          {gaps.length} interruptions de plus de quelques jours relevées. Elles sont décrites dans l&apos;écran Méthode ; une interruption n&apos;est jamais comptée comme une absence de feu.
        </p>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Fichiers par annee */

function FileMatrix({ meta }: { meta: MetadataResponse }) {
  const [selected, setSelected] = useState<SourceFile | null>(null);
  const firstYear = 2000;
  const lastYear = Math.max(...meta.sources.map((s) => s.year), ...meta.missingYears.map((m) => m.year));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
  const byKey = useMemo(() => new Map(meta.sources.map((s) => [`${s.dataset}-${s.year}`, s])), [meta.sources]);
  const missing = useMemo(() => new Map(meta.missingYears.map((m) => [`${m.dataset}-${m.year}`, m])), [meta.missingYears]);
  const max = Math.max(...meta.sources.map((s) => s.rows_kept), 1);

  return (
    <Panel>
      <PanelHeader title="Fichiers importés, par année" subtitle="Une case par fichier annuel FIRMS. Plus la case est foncée, plus le fichier contient de détections. Sélectionnez une case pour voir sa provenance." />
      <div className="overflow-x-auto px-5 pb-3 pt-4">
        <table className="w-full min-w-[760px] border-separate border-spacing-[3px]">
          <thead>
            <tr>
              <th className="w-[150px]" />
              {years.map((y) => (
                <th key={y} className="num text-center text-[10px] font-normal text-ink-3">
                  {String(y).slice(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DATASETS.map((d) => (
              <tr key={d.key}>
                <th scope="row" className="pr-2 text-left align-middle">
                  <span className="block text-[12.5px] font-medium text-ink">{d.label}</span>
                  <span className="block text-[11px] font-normal text-ink-3">{d.sats}</span>
                </th>
                {years.map((y) => {
                  const f = byKey.get(`${d.key}-${y}`);
                  const m = missing.get(`${d.key}-${y}`);
                  if (f) {
                    const level = Math.min(7, 1 + Math.floor((Math.sqrt(f.rows_kept / max) || 0) * 6.99));
                    const active = selected?.file === f.file;
                    return (
                      <td key={y} className="p-0">
                        <button
                          type="button"
                          onClick={() => setSelected(active ? null : f)}
                          aria-pressed={active}
                          aria-label={`${f.file} : ${fmtInt(f.rows_kept)} lignes`}
                          title={`${f.file} : ${fmtInt(f.rows_kept)} lignes`}
                          className={cx("block h-8 w-full rounded-[4px] transition-transform hover:scale-110", active && "ring-2 ring-accent ring-offset-1 ring-offset-surface")}
                          style={{ backgroundColor: `var(--color-heat-${level})` }}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={y} className="p-0">
                      <span
                        className={cx("hatch-missing flex h-8 w-full items-center justify-center rounded-[4px] border border-line text-[9.5px] font-semibold", m ? "border-warning/50 text-warning" : "text-transparent")}
                        title={m ? `Non publié : HTTP ${m.http_status} le ${fmtDateShort(m.checked_at?.slice(0, 10) ?? "")}` : "Satellite pas encore en service"}
                      >
                        {m ? m.http_status : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-[3px]" style={{ backgroundColor: "var(--color-heat-2)" }} />
            <span className="inline-block h-3 w-5 rounded-[3px]" style={{ backgroundColor: "var(--color-heat-6)" }} /> fichier importé (peu → beaucoup de lignes)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="hatch-missing inline-block h-3 w-5 rounded-[3px] border border-line" /> satellite pas en service
          </span>
          <span className="flex items-center gap-1.5 text-warning">
            <Warning size={13} weight="fill" /> 404 : fichier non publié par FIRMS
          </span>
        </div>
      </div>
      {selected ? (
        <div className="mx-5 mb-5 flex flex-col gap-3 rounded-control border border-accent/40 bg-accent/[0.05] p-4 animate-fade-up">
          <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
            <FileCsv size={18} className="text-accent" /> {selected.file}
          </p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
            {(
              [
                ["Lignes lues / conservées / rejetées", `${fmtInt(selected.rows_read)} / ${fmtInt(selected.rows_kept)} / ${fmtInt(selected.rows_rejected)}`],
                ["Taille", `${fmtInt(Math.round(selected.bytes / 1024))} Ko`],
                ["Téléchargé le", fmtDateTimeUtc(selected.accessed_at)],
                ["Empreinte SHA-256", `${selected.sha256.slice(0, 16)}…`],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line py-1">
                <dt className="text-ink-3">{k}</dt>
                <dd className="num text-right text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <a href={selected.url} target="_blank" rel="noreferrer" className="break-all text-[12px] text-accent underline-offset-2 hover:underline">
            {selected.url}
          </a>
        </div>
      ) : null}
    </Panel>
  );
}
