// Numéros de téléphone sur les comptes de démo : la fonction d'appel depuis
// une conversation n'est démontrable que si les profils en ont un.
import { execSync } from "node:child_process";
const phones = {
  mdupont: "+33 6 12 34 56 78", jlefevre: "+33 6 23 45 67 89", ytraore: "+33 6 34 56 78 90",
  kbenali: "+33 6 45 67 89 01", smartin: "+33 6 56 78 90 12", lpetit: "+33 6 67 89 01 23",
  erousseau: "+33 6 78 90 12 34", ngirard: "+33 6 89 01 23 45", csimon: "+33 6 90 12 34 56",
  ifontaine: "+33 7 01 23 45 67", troy: "+33 7 12 34 56 78",
};
const sql = Object.entries(phones).map(([u, p]) => `UPDATE users SET phone='${p}' WHERE username='${u}';`).join(" ");
execSync(`psql -h localhost -U postgres -d deep_clean -c "${sql}"`, { stdio: "inherit" });
