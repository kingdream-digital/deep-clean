// Jeu de messages de démo via la vraie API (fils à deux + un groupe).
const API = "http://localhost:4000/api/v1";
const PASSWORD = "DemoClean2026!";
async function login(username) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: PASSWORD }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${username}: ${JSON.stringify(j)}`);
  return { token: j.accessToken ?? j.token, user: j.user };
}
const call = (s, path, opts = {}) => fetch(`${API}${path}`, { ...opts, headers: { Authorization: `Bearer ${s.token}`, ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(opts.headers ?? {}) } });

async function direct(from, toId) {
  const r = await call(from, "/messages/conversations/direct", { method: "POST", body: JSON.stringify({ userId: toId }) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.conversation.id;
}
async function send(from, conversationId, body, file) {
  const fd = new FormData();
  fd.append("conversationId", conversationId);
  if (body) fd.append("body", body);
  if (file) fd.append(file.field, new Blob([file.bytes], { type: file.type }), file.name);
  const r = await call(from, "/messages", { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  await new Promise((res) => setTimeout(res, 250));
}

const rh = await login("mdupont");
const karim = await login("kbenali");
const lucas = await login("lpetit");
const yasmine = await login("ytraore");
const emma = await login("erousseau");

// --- Fils à deux
const cKarim = await direct(karim, rh.user.id);
await send(karim, cKarim, "Bonjour Marie, l'équipe est au complet ce matin au Phare.");
await send(rh, cKarim, "Parfait, merci Karim ! Pensez à faire pointer tout le monde.");
await send(karim, cKarim, "C'est fait 👍 On attaque le 2e étage à 10h.");

const cLucas = await direct(lucas, rh.user.id);
await send(lucas, cLucas, "Bonjour, est-ce que je peux poser mon vendredi 17 ?");

const cYasmine = await direct(yasmine, rh.user.id);
await send(yasmine, cYasmine, "Planning de la semaine prochaine validé, je l'envoie à l'équipe.");

// --- Groupe avec document joint
const g = await call(rh, "/messages/conversations/group", {
  method: "POST",
  body: JSON.stringify({ title: "Chantier Le Phare", participantIds: [karim.user.id, yasmine.user.id, lucas.user.id, emma.user.id] }),
});
const group = (await g.json()).conversation;
await send(rh, group.id, "Bonjour à tous 👋 Point d'équipe demain 8h devant le Phare.");
await send(karim, group.id, "Bien noté, je préviens l'équipe du matin.");
await send(yasmine, group.id, "Je passe vers 9h pour la validation des heures.");

// Document réel (PDF) joint au fil de groupe
const { execSync } = await import("node:child_process");
const fs = await import("node:fs");
execSync("node make-pdf.mjs");
const pdf = fs.readFileSync("consignes.pdf");
await send(rh, group.id, "Les consignes de sécurité mises à jour 👇", { field: "document", bytes: pdf, type: "application/pdf", name: "Consignes-securite-Le-Phare.pdf" });
await send(emma, group.id, "Merci, c'est noté !");

console.log("Messages de démo prêts. Groupe :", group.id);
