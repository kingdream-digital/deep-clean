// Petit PDF réel (pas un fichier factice) pour tester le partage de document.
import PDFDocument from "/home/user/deep-clean/application/backend/node_modules/pdfkit/js/pdfkit.js";
import fs from "node:fs";
const doc = new PDFDocument({ size: "A4", margin: 56 });
doc.pipe(fs.createWriteStream("consignes.pdf"));
doc.fontSize(20).text("Consignes de sécurité — Coworking Le Phare", { align: "left" });
doc.moveDown().fontSize(11).fillColor("#444");
["Port des gants obligatoire pour les produits désinfectants.",
 "Signalisation « sol glissant » pendant et après le lavage des sols.",
 "Local technique : ne jamais laisser les produits sans surveillance.",
 "Ascenseur réservé au matériel entre 7h et 9h.",
 "Tout incident est signalé le jour même depuis l'application."].forEach((l, i) => doc.text(`${i + 1}. ${l}`).moveDown(0.4));
doc.moveDown().fillColor("#888").fontSize(9).text("Deep Clean — document interne");
doc.end();
