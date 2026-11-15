/**
 * Mesure de latence de l'assistant : delai au premier fragment de texte et duree totale.
 * Fonctionne avec la reponse JSON (ancienne route) comme avec le flux (text/event-stream).
 *
 * Usage : node scripts/measure-assistant.mjs [base] [repetitions]
 *   base         adresse du serveur (defaut http://localhost:3210)
 *   repetitions  essais par question (defaut 2)
 * Aucune cle n'est lue ici : le serveur appelle le fournisseur IA.
 */

const base = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3210";
const repeat = Number(process.argv[3] ?? 2);
const QUESTIONS = ["Bonjour", "Combien de détections au Gabon en 2025 ?"];
const context = { page: "dashboard", country: "GAB", zone: { kind: "country" }, from: "2025-01-01", to: "2025-12-31" };

async function once(question) {
  const t0 = performance.now();
  const response = await fetch(`${base}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
    body: JSON.stringify({ messages: [{ role: "user", text: question }], context }),
  });
  const type = response.headers.get("content-type") ?? "";
  let first = null;
  let text = "";
  let model = null;
  if (type.includes("text/event-stream")) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (!data) continue;
        const payload = JSON.parse(data);
        if (event === "delta" && payload.text) {
          first ??= performance.now() - t0;
          text += payload.text;
        }
        if (event === "done") model = payload.model ?? null;
        if (event === "error") text = `ERREUR ${payload.error}`;
      }
    }
  } else {
    const body = await response.json();
    first = performance.now() - t0;
    text = body.text ?? `ERREUR ${body.error}`;
    model = body.model ?? null;
  }
  const total = performance.now() - t0;
  return { status: response.status, first: first ?? total, total, model, text };
}

for (const question of QUESTIONS) {
  for (let i = 0; i < repeat; i++) {
    const r = await once(question);
    console.log(
      `${question.padEnd(42)} essai ${i + 1}  HTTP ${r.status}  1er mot ${(r.first / 1000).toFixed(2)} s  total ${(r.total / 1000).toFixed(2)} s  modèle ${r.model ?? "local"}  « ${r.text.replace(/\s+/g, " ").slice(0, 70)} »`,
    );
  }
}
