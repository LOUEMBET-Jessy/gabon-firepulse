/**
 * Reponses instantanees, sans modele : salutations, remerciements, « que sais-tu faire ? »,
 * questions de l'aide et de la visite guidee. Repondues localement en quelques millisecondes,
 * avec les memes textes que l'aide hors ligne (aucun chiffre invente : ces reponses n'en contiennent pas).
 */

import { FAQ } from "../assistant/content";
import type { AssistantContext, AssistantReply } from "../assistant/protocol";

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const GREETING = /^(bonjour|bonsoir|salut|coucou|hello|hey|bjr|slt|hi)( (a toi|a vous|tout le monde|hot ?spots?( ai)?|l assistant))?$/;
const THANKS = /^((un )?grand |super |ok |parfait |top )?(merci|thanks|thank you)( beaucoup| bien| infiniment| pour (ta|votre) (aide|reponse))?( c est (clair|parfait|top))?$/;
const CAPABILITIES = /^((que|qu est ce que) (sais|peux) tu faire( pour moi)?|tu sers a quoi|a quoi sers tu|qui es tu|aide|help|comment ca marche|comment tu fonctionnes|que peux tu faire)$/;
const TOUR = /^(lance|lancer|demarre|demarrer|commence|commencer|montre moi|faire) (la |une )?visite( guidee)?$|^visite guidee$/;

function capabilities(country: string): string {
  return [
    `Je suis Hot-Spots AI. Je lis les détections de feux des satellites MODIS et VIIRS de la NASA pour ${country}, et je peux :`,
    "- **expliquer** un écran, une notion ou la méthode (par exemple l'indice harmonisé) ;",
    "- **régler l'écran pour vous** : zone, période, carte, calendrier, comparaison des capteurs ;",
    "- **lire les vrais chiffres** d'une zone et d'une période, et dire s'ils sont habituels ;",
    "- **préparer un export** (après votre confirmation).",
    "Je ne confirme pas d'incendie et je ne fais pas de prédiction. Posez votre question en langage courant.",
  ].join("\n");
}

/** Reponse locale si la question s'y prete, sinon null (le modele repond). */
export function quickReply(question: string, context: AssistantContext): AssistantReply | null {
  const q = normalize(question);
  if (!q || q.length > 80) return null;
  const country = context.country === "FRA" ? "la France métropolitaine" : "le Gabon";
  if (GREETING.test(q)) {
    return {
      text: `Bonjour ! Je suis Hot-Spots AI. Je peux vous expliquer ce que montrent les satellites pour ${country}, lire les chiffres d'une zone et d'une période, ou régler l'écran pour vous.\n\nPar exemple : « Résume l'activité de la période sélectionnée » ou « Cette période est-elle inhabituelle ? »`,
      actions: [],
      sources: [],
      model: "local",
    };
  }
  if (THANKS.test(q)) {
    return { text: "Avec plaisir ! N'hésitez pas si vous voulez explorer une autre zone ou une autre période.", actions: [], sources: [], model: "local" };
  }
  if (CAPABILITIES.test(q)) return { text: capabilities(country), actions: [], sources: [], model: "local" };
  if (TOUR.test(q)) {
    return { text: "C'est parti pour la visite guidée : elle montre l'essentiel en quelques étapes, et vous pouvez l'arrêter à tout moment.", actions: [{ type: "start_tour" }], sources: [], model: "local" };
  }
  const faq = FAQ.find((f) => normalize(f.question) === q);
  if (faq) return { text: faq.answer, actions: [], sources: ["Aide de Hot-Spots"], model: "local" };
  return null;
}
