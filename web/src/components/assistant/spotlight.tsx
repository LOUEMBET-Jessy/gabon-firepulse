"use client";

/**
 * Mise en evidence d'un element ([data-tour="..."]) et visite guidee.
 * Le cadre est dessine par-dessus la page sans la bloquer : l'utilisateur peut cliquer l'element montre.
 */

import { ArrowLeft, ArrowRight, X } from "@phosphor-icons/react/dist/ssr";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { AssistantMark } from "@/components/brand";
import { Button } from "@/components/ui";
import { TOUR } from "@/lib/assistant/content";
import { PAGES } from "@/lib/assistant/protocol";
import { setAssistant, useAssistant } from "@/state/assistant";
import { setSpotlight, useView } from "@/state/view";

import { useActionRunner } from "./runtime";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Position de l'element cible, suivie au defilement et au redimensionnement. Null s'il est absent ou masque. */
function useTargetBox(target: string | null): Box | null {
  // La mesure est rattachee a sa cible : une mesure d'une autre cible n'est jamais affichee.
  const [measured, setMeasured] = useState<{ target: string; box: Box | null } | null>(null);
  useLayoutEffect(() => {
    if (!target) return;
    let element: HTMLElement | null = null;
    let frame = 0;
    let tries = 0;
    let observer: ResizeObserver | null = null;
    const update = () => {
      const next = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)).find((el) => el.offsetParent !== null || el.getClientRects().length > 0) ?? null;
      if (!next) {
        element = null;
        setMeasured({ target, box: null });
        // L'element peut apparaitre apres une navigation ou un chargement : on reessaie quelques secondes.
        if (tries++ < 40 && !frame) {
          frame = window.setTimeout(() => {
            frame = 0;
            update();
          }, 100);
        }
        return;
      }
      if (frame) window.clearTimeout(frame);
      frame = 0;
      tries = 0;
      if (next !== element) {
        observer?.disconnect();
        element = next;
        observer?.observe(next);
      }
      const r = element.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return setMeasured({ target, box: null });
      setMeasured({ target, box: { top: r.top, left: r.left, width: r.width, height: r.height } });
    };
    observer = new ResizeObserver(update);
    update();
    const firstScroll = window.setTimeout(() => {
      if (!element) return;
      const r = element.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 40) element.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, 120);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.clearTimeout(frame);
      window.clearTimeout(firstScroll);
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [target]);
  return target && measured?.target === target ? measured.box : null;
}

const PAD = 6;

function Ring({ box, dim }: { box: Box; dim: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-40 rounded-[14px] border-2 border-accent transition-[top,left,width,height] duration-300 ease-out"
      style={{
        top: box.top - PAD,
        left: box.left - PAD,
        width: box.width + PAD * 2,
        height: box.height + PAD * 2,
        boxShadow: dim
          ? "0 0 0 9999px color-mix(in srgb, var(--color-ink) 48%, transparent), 0 0 0 6px color-mix(in srgb, var(--color-accent) 25%, transparent)"
          : "0 0 0 6px color-mix(in srgb, var(--color-accent) 25%, transparent)",
      }}
    />
  );
}

/** Place la bulle sous l'element, ou au-dessus s'il n'y a pas la place. */
function bubbleStyle(box: Box | null, width: number, height = 220): React.CSSProperties {
  if (typeof window === "undefined") return { width };
  const margin = 12;
  const w = Math.min(width, window.innerWidth - margin * 2);
  const maxHeight = window.innerHeight - margin * 2;
  if (!box) {
    return {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: w,
      maxHeight,
      overflowY: "auto",
    };
  }
  const h = Math.min(height, maxHeight);
  const left = Math.min(Math.max(12, box.left + box.width / 2 - w / 2), window.innerWidth - w - 12);
  const below = box.top + box.height + PAD + 14;
  const above = box.top - PAD - 14 - h;
  const roomBelow = window.innerHeight - margin - below;
  const roomAbove = box.top - PAD - 14 - margin;
  const top =
    roomBelow >= h
      ? below
      : roomAbove >= h
        ? above
        : roomBelow >= roomAbove
          ? Math.min(Math.max(margin, below), window.innerHeight - h - margin)
          : Math.min(Math.max(margin, above), window.innerHeight - h - margin);
  return { left, top: Math.min(Math.max(margin, top), window.innerHeight - h - margin), width: w, maxHeight, overflowY: "auto" };
}

/** Mise en evidence demandee par l'assistant : disparait seule au bout de quelques secondes. */
export function AssistantSpotlight() {
  const spotlight = useView((v) => v.spotlight);
  const tourActive = useAssistant((s) => s.tourStep !== null);
  const box = useTargetBox(spotlight && !tourActive ? spotlight.target : null);

  useEffect(() => {
    if (!spotlight) return;
    const timer = window.setTimeout(() => setSpotlight(null), 8000);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSpotlight(null);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [spotlight]);

  if (!spotlight || !box || tourActive) return null;
  return (
    <>
      <Ring box={box} dim={false} />
      {spotlight.caption ? (
        <div role="status" className="fixed z-40 animate-fade-up rounded-control border border-accent/50 bg-surface-2 px-3 py-2 text-[13px] text-ink shadow-float" style={bubbleStyle(box, 280, 72)}>
          <span className="flex items-start gap-2">
            <AssistantMark size={18} className="mt-px shrink-0" />
            {spotlight.caption}
          </span>
        </div>
      ) : null}
    </>
  );
}

/** Visite guidee : une etape a la fois, sur la bonne page, avec une action proposee. */
export function GuidedTour() {
  const step = useAssistant((s) => s.tourStep);
  const pathname = usePathname();
  const router = useRouter();
  const run = useActionRunner();
  const assistantOpen = useAssistant((s) => s.open);
  const current = step === null ? null : TOUR[step];
  const onPage = current ? PAGES[current.page].path === pathname : false;
  const box = useTargetBox(current && onPage ? current.target : null);
  const [applied, setApplied] = useState<number | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleHeight, setBubbleHeight] = useState(220);

  useEffect(() => {
    if (step !== null && assistantOpen) setAssistant({ open: false });
  }, [step, assistantOpen]);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    bubble.scrollTop = 0;
    const measure = () => {
      const height = bubble.getBoundingClientRect().height;
      setBubbleHeight((currentHeight) => (currentHeight === height ? currentHeight : height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bubble);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [step]);

  // Ouvre la page de l'etape si besoin.
  useEffect(() => {
    if (current && !onPage) router.push(PAGES[current.page].path);
  }, [current, onPage, router]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAssistant({ tourStep: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (step === null || !current) return null;
  const last = step === TOUR.length - 1;
  const go = (next: number | null) => {
    setApplied(null);
    setAssistant({ tourStep: next });
  };

  return (
    <>
      {box ? <Ring box={box} dim /> : <div aria-hidden className="pointer-events-none fixed inset-0 z-40 bg-bg-deep/60" />}
      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        className="fixed z-50 animate-fade-up overflow-y-auto rounded-panel border border-line-strong bg-surface p-5 shadow-float"
        style={bubbleStyle(box, 380, bubbleHeight)}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-[12px] font-medium text-ink-3">
            <AssistantMark size={20} />
            Visite guidée · étape {step + 1} sur {TOUR.length}
          </p>
          <button type="button" onClick={() => go(null)} aria-label="Quitter la visite" className="-mr-1.5 -mt-1.5 rounded-control p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <h2 id="tour-title" className="mt-3 text-[17px] font-semibold tracking-[-0.01em] text-ink">
          {current.title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{current.body}</p>
        {current.offer ? (
          <div className="mt-3">
            <Button
              size="sm"
              variant={applied === step ? "secondary" : "primary"}
              disabled={applied === step}
              onClick={() => {
                current.offer!.actions.forEach((a) => run(a));
                setApplied(step);
              }}
            >
              {applied === step ? "Appliqué" : current.offer.label}
            </Button>
          </div>
        ) : null}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex gap-1" aria-hidden>
            {TOUR.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-accent" : i < step ? "w-1.5 bg-accent/50" : "w-1.5 bg-line-strong"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => go(step - 1)}>
                <ArrowLeft size={14} />
                Précédent
              </Button>
            ) : null}
            <Button size="sm" variant="primary" onClick={() => go(last ? null : step + 1)}>
              {last ? "Terminer" : "Suivant"}
              {last ? null : <ArrowRight size={14} />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
