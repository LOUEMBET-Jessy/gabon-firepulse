"use client";

import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { AssistantStatus } from "@/lib/assistant/protocol";

const PROMPTS = [
  "Je ne sais pas par où commencer",
  "Montre le Haut-Ogooué pendant la saison sèche 2024",
  "Compare MODIS et VIIRS après calage",
  "Janvier 2024 était-il inhabituel ?",
];

/** Etat reel du service et exemples de demandes : chaque exemple ouvre la plateforme avec la question pre-remplie. */
export function AssistantTeaser() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  useEffect(() => {
    fetch("/api/assistant/status")
      .then((r) => r.json() as Promise<AssistantStatus>)
      .then(setStatus)
      .catch(() => setStatus({ available: false, reason: null, model: null }));
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {PROMPTS.map((p) => (
          <li key={p}>
            <Link
              href={`/dashboard?ask=${encodeURIComponent(p)}`}
              className="group flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-4 py-3 text-[14.5px] text-ink transition-colors hover:bg-surface-3"
            >
              <span>« {p} »</span>
              <ArrowUpRight size={16} className="shrink-0 text-ink-3 transition-colors group-hover:text-accent" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 text-[12.5px] text-ink-3" role="status">
        <span aria-hidden className={`size-1.5 rounded-full ${status === null ? "bg-ink-3" : status.available ? "bg-good" : "bg-warning"}`} />
        {status === null
          ? "Vérification du service IA."
          : status.available
            ? "Assistant IA actif sur ce serveur."
            : "Assistant IA non configuré sur ce serveur : la visite guidée et l'aide hors ligne restent disponibles."}
      </p>
    </div>
  );
}
