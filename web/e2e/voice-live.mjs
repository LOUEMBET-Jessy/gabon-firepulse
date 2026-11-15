// Conversation vocale de bout en bout, avec le vrai fournisseur IA (cle requise, requetes facturees).
// Chrome recoit un fichier WAV comme micro ; la synthese vocale est interceptee pour lire ce qui est dit.
// Usage : node e2e/voice-live.mjs <question.wav> [capture.png]
import { chromium } from "playwright-core";

const [wav, shot] = process.argv.slice(2);
if (!wav) throw new Error("Chemin du fichier WAV attendu");
const base = process.env.BASE_URL ?? "http://localhost:3210";

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
await context.addInitScript(() => {
  window.localStorage.setItem("hotspot.welcomed", "1");
  // Moteur serveur force : enregistrement local puis transcription par Gemini.
  window.localStorage.setItem("hotspot.voice.engine", "server");
  // Synthese vocale interceptee : on garde le texte, la lecture se termine aussitot.
  window.__spoken = [];
  window.speechSynthesis.speak = (u) => {
    window.__spoken.push(u.text);
    setTimeout(() => u.onend?.(new Event("end")), 50);
  };
});
const page = await context.newPage();
const t0 = Date.now();
const transcription = page.waitForResponse((r) => r.url().includes("/api/assistant/transcribe"), { timeout: 90_000 });
const answer = page.waitForResponse((r) => r.url().endsWith("/api/assistant") && r.request().method() === "POST", { timeout: 150_000 });

await page.goto(`${base}/dashboard`, { waitUntil: "load" });
await page.getByRole("button", { name: "Ouvrir Hot-Spots AI" }).click();
await page.getByText("Prêt à vous aider").waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: "Démarrer une conversation vocale" }).click();
await page.getByText("Je vous écoute").waitFor();

const t = await transcription;
const heard = await t.json();
console.log(`transcription (${Date.now() - t0} ms, HTTP ${t.status()}) : ${JSON.stringify(heard)}`);
const a = await answer;
const reply = await a.json();
const request = JSON.parse(a.request().postData());
console.log(`réponse (${Date.now() - t0} ms, HTTP ${a.status()}, mode ${request.mode}, ${reply.model}${reply.fallback ? ", secours" : ""})`);
console.log(`  actions : ${JSON.stringify(reply.actions)}`);
console.log(`  texte : ${reply.text}`);
await page.waitForFunction(() => window.__spoken.length > 0, null, { timeout: 15_000 });
const spoken = await page.evaluate(() => window.__spoken);
console.log(`  prononcé : ${spoken.join(" | ")}`);
// Apres la reponse, l'assistant ecoute de nouveau.
await page.getByText("Je vous écoute").waitFor({ timeout: 15_000 });
console.log(`écoute relancée ; zone : ${await page.getByRole("button", { name: "Zone d'analyse", exact: true }).innerText()} ; période : ${await page.getByRole("button", { name: "Période", exact: true }).innerText()} ; adresse : ${page.url()}`);
if (shot) await page.screenshot({ path: shot });
await page.getByRole("button", { name: "Terminer" }).click();
await page.getByRole("button", { name: "Démarrer une conversation vocale" }).waitFor();
console.log("conversation terminée, saisie écrite de retour");
await browser.close();
