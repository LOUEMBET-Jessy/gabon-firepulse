"use client";

/**
 * Invitation discrete a l'assistant : une ligne, trois questions possibles. Chaque question ouvre la plateforme
 * avec la demande pre-remplie (jamais envoyee sans l'utilisateur). Indique l'etat reel du service.
 */

import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AssistantMark, BRAND } from "@/components/brand";
import type { AssistantStatus } from "@/lib/assistant/protocol";

const PROMPTS = ["Je ne sais pas par où commencer", "Compare MODIS et VIIRS après calage", "Janvier 2024 était-il inhabituel ?"];

export function AssistantInvite() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  useEffect(() => {
    fetch("/api/assistant/status")
      .then((r) => r.json() as Promise<AssistantStatus>)
      .then(setStatus)
      .catch(() => setStatus({ available: false, reason: null, model: null }));
  }, []);
  return (
    <div className="flex flex-col gap-5 rounded-[22px] border border-line/70 bg-surface/50 p-5 md:p-6 lg:flex-row lg:items-center lg:gap-8">
      <div className="flex shrink-0 items-center gap-3.5">
        <AssistantMark size={44} animated />
        <div>
          <p className="text-[16px] font-semibold tracking-[-0.01em] text-ink">Une question ? Demandez à {BRAND.assistant}.</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3" role="status">
            <span aria-hidden className={`size-1.5 rounded-full ${status === null ? "bg-ink-3" : status.available ? "bg-good" : "bg-warning"}`} />
            {status === null ? "Vérification du service." : status.available ? "Répond avec les vrais chiffres, et leurs limites." : "Service IA non configuré : l'aide hors ligne reste disponible."}
          </p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2 lg:ml-auto lg:justify-end">
        {PROMPTS.map((p) => (
          <li key={p}>
            <Link
              href={`/dashboard?ask=${encodeURIComponent(p)}`}
              className="group inline-flex items-center gap-1.5 rounded-full border border-line-strong/70 px-3.5 py-2 text-[13.5px] text-ink-2 transition-colors hover:border-accent/60 hover:text-ink active:scale-[0.98]"
            >
              {p}
              <ArrowUpRight size={14} className="text-ink-3 transition-colors group-hover:text-accent" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
