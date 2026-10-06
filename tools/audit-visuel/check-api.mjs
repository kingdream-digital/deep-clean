const API = "http://localhost:4000/api/v1";
const PASSWORD = "DemoClean2026!";
let fails = 0;
function ok(cond, label, extra) { console.log(cond ? `  ✓ ${label}` : `  ✗ ${label} ${extra ?? ""}`); if (!cond) fails++; }
async function login(u) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: PASSWORD }) });
  const j = await r.json(); return { token: j.accessToken ?? j.token, user: j.user };
}
const call = (s, path, opts = {}) => fetch(`${API}${path}`, { ...opts, headers: { Authorization: `Bearer ${s.token}`, ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(opts.headers ?? {}) } });
const send = async (s, conversationId, body) => { const fd = new FormData(); fd.append("conversationId", conversationId); fd.append("body", body); return call(s, "/messages", { method: "POST", body: fd }); };

const rh = await login("mdupont"), karim = await login("kbenali"), lucas = await login("lpetit"), nathan = await login("ngirard"), emma = await login("erousseau");

console.log("\n— Liste des fils");
let r = await call(rh, "/messages/conversations");
let convs = (await r.json()).items;
const group = convs.find(c => c.isGroup);
ok(convs.length === 4, "3 fils à deux + 1 groupe", convs.length);
ok(group && group.title === "Chantier Le Phare" && group.participants.length === 5, "groupe avec 5 participants");
ok(convs.filter(c => !c.isGroup).every(c => c.otherUser), "chaque fil à deux porte son interlocuteur");

console.log("\n— Document joint");
r = await call(rh, `/messages/conversations/${group.id}/messages`);
const msgs = (await r.json()).items;
const withDoc = msgs.find(m => m.document);
ok(!!withDoc, "message avec document");
ok(withDoc.document.name === "Consignes-securite-Le-Phare.pdf" && withDoc.document.sizeBytes > 0, "nom et taille conservés", JSON.stringify(withDoc?.document));
ok(!("documentKey" in withDoc) && !("photoKey" in withDoc), "aucune clé de stockage exposée");
r = await call(karim, `/messages/${withDoc.id}/document`);
ok(r.status === 200 && r.headers.get("content-type") === "application/pdf", "un membre télécharge le PDF", r.status);
const bytes = new Uint8Array(await r.arrayBuffer());
ok(new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-", "le fichier servi est bien le PDF");
r = await call(nathan, `/messages/${withDoc.id}/document`);
ok(r.status === 404, "un non-membre ne peut pas le télécharger", r.status);
r = await fetch(`${API}/messages/${withDoc.id}/document`);
ok(r.status === 401, "aucun accès sans authentification", r.status);

console.log("\n— Événements de groupe");
ok(msgs.some(m => m.systemEvent === "GROUP_CREATED"), "création du groupe tracée dans le fil");
ok(msgs.filter(m => m.systemEvent).every(m => m.body && m.body.includes("Marie")), "événement nommant son auteur");

console.log("\n— Non-lus");
r = await call(lucas, "/messages/conversations");
const lucasGroup = (await r.json()).items.find(c => c.id === group.id);
ok(lucasGroup.unreadCount === 5, "5 messages non lus pour Lucas (événements exclus)", lucasGroup.unreadCount);
r = await call(lucas, "/messages/unread-count"); const before = (await r.json()).unreadCount;
await call(lucas, `/messages/conversations/${group.id}/read`, { method: "POST" });
r = await call(lucas, "/messages/unread-count"); const after = (await r.json()).unreadCount;
ok(after === before - 5, "le compteur global diminue d'autant", `${before} -> ${after}`);

console.log("\n— Cloisonnement");
r = await call(nathan, `/messages/conversations/${group.id}`);
ok(r.status === 404, "non-membre : 404 sur le fil", r.status);
r = await send(nathan, group.id, "coucou");
ok(r.status === 404, "non-membre : envoi refusé", r.status);
const otherConv = convs.find(c => !c.isGroup);
r = await call(nathan, `/messages/conversations/${otherConv.id}/messages`);
ok(r.status === 404, "fil à deux d'autrui inaccessible", r.status);

console.log("\n— Administration");
r = await call(karim, `/messages/conversations/${group.id}/participants`, { method: "POST", body: JSON.stringify({ userIds: [nathan.user.id] }) });
ok(r.status === 403, "ajout refusé à un non-administrateur", r.status);
r = await call(rh, `/messages/conversations/${group.id}/participants`, { method: "POST", body: JSON.stringify({ userIds: [nathan.user.id] }) });
ok(r.status === 200, "ajout par l'administrateur", r.status);
r = await call(nathan, "/messages/conversations");
ok((await r.json()).items.some(c => c.id === group.id), "la personne ajoutée voit le groupe");
r = await call(rh, `/messages/conversations/${group.id}/participants/${nathan.user.id}`, { method: "DELETE" });
ok(r.status === 200, "retrait par l'administrateur");
r = await send(nathan, group.id, "je reviens");
ok(r.status === 403 || r.status === 404, "la personne retirée ne peut plus écrire", r.status);

r = await call(rh, `/messages/conversations/${group.id}`, { method: "PATCH", body: JSON.stringify({ title: "Le Phare — équipe" }) });
ok(r.status === 200 && (await r.json()).conversation.title === "Le Phare — équipe", "renommage");
r = await call(karim, `/messages/conversations/${group.id}`, { method: "PATCH", body: JSON.stringify({ title: "Pirate" }) });
ok(r.status === 403, "renommage refusé à un non-administrateur", r.status);

console.log("\n— Validation des entrées");
r = await send(rh, group.id, "");
ok(r.status === 400, "message vide refusé", r.status);
r = await call(rh, "/messages/conversations/group", { method: "POST", body: JSON.stringify({ title: "", participantIds: [karim.user.id, lucas.user.id] }) });
ok(r.status === 400, "groupe sans nom refusé", r.status);
r = await call(rh, `/messages/conversations/pas-un-uuid`);
ok(r.status === 400, "identifiant invalide refusé", r.status);
r = await call(rh, "/messages/conversations/direct", { method: "POST", body: JSON.stringify({ userId: rh.user.id }) });
ok(r.status === 400, "fil avec soi-même refusé", r.status);

console.log("\n— Quitter");
r = await call(karim, `/messages/conversations/${group.id}/leave`, { method: "POST" });
ok(r.status === 204, "quitter le groupe", r.status);
r = await send(karim, group.id, "re");
ok(r.status === 403, "ne peut plus écrire après avoir quitté", r.status);
r = await call(rh, `/messages/conversations/${group.id}/leave`, { method: "POST" });
ok(r.status === 204, "l'administrateur quitte aussi");
r = await call(emma, `/messages/conversations/${group.id}`);
const afterLeave = (await r.json()).conversation;
ok(afterLeave.participants.some(p => p.isAdmin && !p.hasLeft), "un nouvel administrateur a pris le relais");

console.log(fails === 0 ? "\n✅ Tout est bon" : `\n❌ ${fails} échec(s)`);
process.exit(fails === 0 ? 0 : 1);
