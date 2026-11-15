"use client";

/**
 * Etat de l'assistant cote navigateur : conversation, ouverture du panneau, visite guidee.
 * La conversation est gardee pour la session de l'onglet (sessionStorage), jamais envoyee ailleurs
 * qu'au serveur Hot-Spots lors d'une question.
 */

import { useSyncExternalStore } from "react";

import type { AssistantAction, AssistantStatus } from "@/lib/assistant/protocol";

export type ReceiptState = "applied" | "pending" | "confirmed" | "cancelled" | "failed";

export interface ActionReceipt {
  id: string;
  action: AssistantAction;
  state: ReceiptState;
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  receipts?: ActionReceipt[];
  sources?: string[];
  /** Modele de secours ayant repondu, le cas echeant. */
  fallbackModel?: string;
  /** Message d'erreur du service (affiche autrement, jamais renvoye au modele). */
  error?: boolean;
  /** Reponse en cours d'ecriture (flux). */
  streaming?: boolean;
}

export interface AssistantState {
  open: boolean;
  messages: UiMessage[];
  busy: boolean;
  status: AssistantStatus | null;
  /** Etape de la visite guidee en cours, null hors visite. */
  tourStep: number | null;
  /** Texte a pre-remplir dans la zone de saisie (suggestion choisie ailleurs dans l'application). */
  draft: string;
  /** Etape affichee pendant l'attente (« Je lis les donnees du Gabon, annee 2025… »), null sinon. */
  progress: string | null;
}

const STORAGE_KEY = "hotspot.assistant.v1";
const TOUR_KEY = "hotspot.tour.step";
export const WELCOME_KEY = "hotspot.welcomed";

const INITIAL: AssistantState = { open: false, messages: [], busy: false, status: null, tourStep: null, draft: "", progress: null };

let state: AssistantState = INITIAL;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.messages.slice(-40)));
    if (state.tourStep === null) window.localStorage.removeItem(TOUR_KEY);
    else window.localStorage.setItem(TOUR_KEY, String(state.tourStep));
  } catch {
    /* stockage indisponible : la conversation reste en memoire */
  }
}

/** Restaure la conversation de l'onglet, une seule fois, apres le premier rendu. */
export function hydrateAssistant() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const messages = JSON.parse(raw) as UiMessage[];
      // Un flux coupe par un rechargement n'est plus « en cours ».
      if (Array.isArray(messages)) state = { ...state, messages: messages.filter((m) => m && typeof m.text === "string").map((m) => ({ ...m, streaming: false })) };
    }
  } catch {
    /* donnees illisibles : on repart d'une conversation vide */
  }
  emit();
}

export function savedTourStep(): number | null {
  try {
    const raw = window.localStorage.getItem(TOUR_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

export function setAssistant(patch: Partial<AssistantState>) {
  state = { ...state, ...patch };
  persist();
  emit();
}

export function getAssistant(): AssistantState {
  return state;
}

export function pushMessage(message: UiMessage) {
  setAssistant({ messages: [...state.messages, message] });
}

/** Met a jour un message (texte qui arrive en flux, puis actions et sources a la fin). */
export function updateMessage(id: string, patch: Partial<UiMessage>) {
  state = { ...state, messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
  // Pendant le flux, on n'ecrit pas le stockage a chaque fragment : seulement a la fin (streaming faux).
  if (patch.streaming === false || patch.streaming === undefined) persist();
  emit();
}

export function updateReceipt(messageId: string, receiptId: string, next: ReceiptState) {
  setAssistant({
    messages: state.messages.map((m) =>
      m.id !== messageId ? m : { ...m, receipts: m.receipts?.map((r) => (r.id === receiptId ? { ...r, state: next } : r)) },
    ),
  });
}

export function openAssistant(draft?: string) {
  setAssistant({ open: true, ...(draft ? { draft } : {}) });
}

export function useAssistant<T>(select: (s: AssistantState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
    () => select(INITIAL),
  );
}

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
