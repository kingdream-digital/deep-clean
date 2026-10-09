#!/usr/bin/env node
// Garde-fou avant un envoi aux stores (Apple / Google).
//
//   npm run verifier:publication              vérifie la configuration (hors ligne)
//   npm run verifier:publication -- --en-ligne  + vérifie que le serveur répond en HTTPS
//   (automatique) --eas                       lancé par EAS pendant un build : ne bloque
//                                             que les profils « preview » et « production »
//
// Il ne modifie rien : il lit app.json, eas.json et les icônes, puis affiche
// OK / AVERTISSEMENT / ERREUR. Une ERREUR arrête le build (code de sortie 1).
// Pourquoi : une appli acceptée par Apple/Google après plusieurs jours de revue,
// mais pointant vers un serveur injoignable ou non sécurisé, est inutilisable.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Identifiants déjà pris par une autre application sur les stores.
const IDENTIFIANTS_PRIS = {
  "com.deepclean.app": "déjà utilisé sur Google Play par une autre application",
};

// Anciennes adresses du serveur qui ne contiennent plus les fonctions actuelles.
const SERVEURS_OBSOLETES = ["deep-clean-app.onrender.com"];

const PROFILS_STORE = ["preview", "production"];

function lireJson(fichier) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, fichier), "utf8"));
}

/** Lit largeur, hauteur et transparence d'un PNG, sans dépendance. */
function lirePng(chemin) {
  const buf = fs.readFileSync(chemin);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(signature)) {
    throw new Error("ce fichier n'est pas un PNG valide");
  }
  const largeur = buf.readUInt32BE(16);
  const hauteur = buf.readUInt32BE(20);
  const typeCouleur = buf.readUInt8(25);
  let transparence = typeCouleur === 4 || typeCouleur === 6;
  for (let pos = 8; pos + 12 <= buf.length; ) {
    const longueur = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    if (type === "tRNS") transparence = true;
    if (type === "IDAT") break;
    pos += 12 + longueur;
  }
  return { largeur, hauteur, transparence };
}

/**
 * Une adresse d'API est utilisable par une appli de store si elle est en HTTPS,
 * publique et définitive. Renvoie la liste des problèmes (vide = valide).
 */
function problemesAdresseApi(valeur) {
  if (!valeur) return ["l'adresse de l'API (EXPO_PUBLIC_API_URL) n'est pas renseignée"];
  let url;
  try {
    url = new URL(valeur);
  } catch {
    return [`« ${valeur} » n'est pas une adresse valide`];
  }
  const problemes = [];
  const hote = url.hostname.toLowerCase();
  if (url.protocol !== "https:") {
    problemes.push("l'adresse doit commencer par https:// (iOS et Android bloquent le http:// non sécurisé)");
  }
  const locale =
    hote === "localhost" ||
    hote.endsWith(".localhost") ||
    /^(127|10|0)\./.test(hote) ||
    /^192\.168\./.test(hote) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hote) ||
    hote === "[::1]";
  if (locale) problemes.push("l'adresse est locale : aucun téléphone ne pourra l'atteindre");
  if (/\.(invalid|example|test)$/.test(hote) || /(^|\.)example\.(com|net|org)$/.test(hote) || hote.includes("a-configurer")) {
    problemes.push("l'adresse est encore l'adresse provisoire A-CONFIGURER : remplacez-la par le vrai nom de domaine");
  }
  if (SERVEURS_OBSOLETES.some((s) => hote === s || hote.endsWith("." + s))) {
    problemes.push("cette adresse est l'ancien serveur (Render), qui ne contient plus les fonctions actuelles");
  }
  if (!url.pathname.replace(/\/+$/, "").endsWith("/api/v1")) {
    problemes.push("l'adresse doit se terminer par /api/v1");
  }
  return problemes;
}

function problemesIdentifiant(id) {
  if (!id) return ["identifiant manquant"];
  const problemes = [];
  if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(id)) {
    problemes.push(`« ${id} » n'a pas le bon format (ex. fr.exemple.monapp, lettres/chiffres/_ séparés par des points)`);
  }
  if (IDENTIFIANTS_PRIS[id]) problemes.push(`« ${id} » est ${IDENTIFIANTS_PRIS[id]} : impossible de publier avec`);
  return problemes;
}

function pluginProps(expo, nom) {
  const entree = (expo.plugins || []).find((p) => (Array.isArray(p) ? p[0] : p) === nom);
  if (!entree) return undefined;
  return Array.isArray(entree) ? entree[1] || {} : {};
}

function main(argv, env) {
  const modeEas = argv.includes("--eas");
  const enLigne = argv.includes("--en-ligne");
  const profilEas = env.EAS_BUILD_PROFILE;
  const plateformeEas = env.EAS_BUILD_PLATFORM;

  const resultats = [];
  const ok = (m) => resultats.push({ niveau: "OK", m });
  const avert = (m) => resultats.push({ niveau: "AVERTISSEMENT", m });
  const erreur = (m) => resultats.push({ niveau: "ERREUR", m });

  // Un build de développement n'est pas destiné aux stores : rien à bloquer.
  if (modeEas && profilEas && !PROFILS_STORE.includes(profilEas)) {
    console.log(`Profil « ${profilEas} » : vérification des stores ignorée.`);
    return 0;
  }

  let app;
  let eas;
  try {
    app = lireJson("app.json").expo;
    eas = lireJson("eas.json");
  } catch (e) {
    console.error(`ERREUR : impossible de lire app.json / eas.json (${e.message})`);
    return 1;
  }

  // --- Identité de l'application -----------------------------------------
  if (/^\d+\.\d+\.\d+$/.test(app.version || "")) ok(`Version ${app.version}`);
  else erreur(`La version « ${app.version} » doit avoir la forme 1.0.0`);

  const idIos = app.ios && app.ios.bundleIdentifier;
  const idAndroid = app.android && app.android.package;
  for (const [nom, id] of [["iOS (bundleIdentifier)", idIos], ["Android (package)", idAndroid]]) {
    const p = problemesIdentifiant(id);
    if (p.length) p.forEach((x) => erreur(`Identifiant ${nom} : ${x}`));
    else ok(`Identifiant ${nom} : ${id}`);
  }
  if (idIos && idAndroid && idIos !== idAndroid) {
    avert(`Les identifiants iOS (${idIos}) et Android (${idAndroid}) sont différents : pas bloquant, mais déconseillé`);
  }

  // --- Icônes -------------------------------------------------------------
  const verifierIcone = (chemin, nom, { sansTransparence }) => {
    if (!chemin) return erreur(`${nom} : non déclarée dans app.json`);
    const complet = path.join(ROOT, chemin);
    if (!fs.existsSync(complet)) return erreur(`${nom} : fichier introuvable (${chemin})`);
    try {
      const { largeur, hauteur, transparence } = lirePng(complet);
      if (largeur !== 1024 || hauteur !== 1024) erreur(`${nom} : ${largeur}×${hauteur}, il faut 1024×1024`);
      else if (sansTransparence && transparence) erreur(`${nom} : contient de la transparence, Apple la refuse`);
      else ok(`${nom} : 1024×1024${sansTransparence ? ", sans transparence" : ""}`);
    } catch (e) {
      erreur(`${nom} : ${e.message}`);
    }
  };
  verifierIcone(app.icon, "Icône de l'app (App Store)", { sansTransparence: true });
  verifierIcone(app.android && app.android.adaptiveIcon && app.android.adaptiveIcon.foregroundImage, "Icône Android (premier plan)", { sansTransparence: false });

  // --- Apple --------------------------------------------------------------
  const ios = app.ios || {};
  if (ios.config && typeof ios.config.usesNonExemptEncryption === "boolean") ok("Apple : déclaration de chiffrement renseignée");
  else avert("Apple : usesNonExemptEncryption absent, Apple reposera la question à chaque envoi");
  const apis = ios.privacyManifests && ios.privacyManifests.NSPrivacyAccessedAPITypes;
  if (Array.isArray(apis) && apis.length) ok("Apple : manifeste de confidentialité (API à raison requise) déclaré");
  else avert("Apple : manifeste de confidentialité absent, risque de courriel d'alerte d'Apple après l'envoi");

  const photo = pluginProps(app, "expo-image-picker") || {};
  const position = pluginProps(app, "expo-location") || {};
  const faceId = pluginProps(app, "expo-local-authentication") || {};
  const textes = [
    ["appareil photo", photo.cameraPermission],
    ["photothèque", photo.photosPermission],
    ["localisation", position.locationWhenInUsePermission],
    ["Face ID", faceId.faceIDPermission],
  ];
  for (const [nom, texte] of textes) {
    if (typeof texte === "string" && texte.trim().length >= 20) ok(`Apple : texte d'autorisation « ${nom} » renseigné`);
    else erreur(`Apple : texte d'autorisation « ${nom} » manquant ou trop court (Apple refuse l'app sans)`);
  }
  if (photo.microphonePermission !== false) {
    avert("Le micro n'est pas désactivé dans expo-image-picker : l'app n'en a pas besoin, le store le demanderait à tort");
  }

  // --- Android : notifications (Firebase) ---------------------------------
  const verifierFirebase = !modeEas || !plateformeEas || plateformeEas === "android";
  if (verifierFirebase) {
    const fichierEnv = env.GOOGLE_SERVICES_JSON;
    const fichierLocal = path.join(ROOT, "google-services.json");
    const fichier = fichierEnv || (fs.existsSync(fichierLocal) ? fichierLocal : null);
    if (!fichier) {
      avert("Android : fichier google-services.json absent → les notifications push Android ne partiront pas (voir docs/PUBLICATION-STORES.md)");
    } else {
      try {
        const g = JSON.parse(fs.readFileSync(fichier, "utf8"));
        const paquets = (g.client || []).map((c) => c.client_info && c.client_info.android_client_info && c.client_info.android_client_info.package_name);
        if (idAndroid && paquets.includes(idAndroid)) ok(`Android : google-services.json correspond à ${idAndroid}`);
        else erreur(`Android : google-services.json ne contient pas l'application ${idAndroid} (trouvé : ${paquets.join(", ") || "rien"})`);
      } catch (e) {
        erreur(`Android : google-services.json illisible (${e.message})`);
      }
    }
  }

  // --- Adresse du serveur par profil --------------------------------------
  const profils = modeEas && profilEas ? [profilEas] : PROFILS_STORE;
  const aTester = [];
  for (const profil of profils) {
    const definie = eas.build && eas.build[profil] && eas.build[profil].env && eas.build[profil].env.EXPO_PUBLIC_API_URL;
    // Pendant un build EAS, la valeur qui compte est celle réellement injectée.
    const valeur = modeEas && env.EXPO_PUBLIC_API_URL ? env.EXPO_PUBLIC_API_URL : definie;
    const p = problemesAdresseApi(valeur);
    if (p.length) p.forEach((x) => erreur(`Serveur, profil « ${profil} » : ${x}`));
    else {
      ok(`Serveur, profil « ${profil} » : ${valeur}`);
      aTester.push(valeur);
    }
  }

  const termine = () => {
    const ordre = { OK: 0, AVERTISSEMENT: 1, ERREUR: 2 };
    for (const r of [...resultats].sort((a, b) => ordre[a.niveau] - ordre[b.niveau] || 0)) {
      const marque = r.niveau === "OK" ? "  ✔" : r.niveau === "AVERTISSEMENT" ? "  ⚠" : "  ✖";
      console.log(`${marque} ${r.m}`);
    }
    const nbErreurs = resultats.filter((r) => r.niveau === "ERREUR").length;
    const nbAvert = resultats.filter((r) => r.niveau === "AVERTISSEMENT").length;
    console.log(
      nbErreurs
        ? `\n✖ ${nbErreurs} erreur(s) à corriger avant d'envoyer l'app aux stores.`
        : `\n✔ Prêt pour les stores${nbAvert ? ` (${nbAvert} avertissement(s) à lire)` : ""}.`
    );
    if (!modeEas) {
      const identifiants = idIos === idAndroid ? `L'identifiant ${idIos}` : `Les identifiants ${idIos} (Apple) et ${idAndroid} (Android)`;
      console.log(`\nRappel : ${identifiants} devien${idIos === idAndroid ? "t" : "nent"} DÉFINITIF${idIos === idAndroid ? "" : "S"} dès le premier envoi sur un store.`);
    }
    return nbErreurs ? 1 : 0;
  };

  if (!enLigne || !aTester.length) return Promise.resolve(termine());

  // --- Option --en-ligne : le serveur répond-il vraiment ? -----------------
  return Promise.all(
    [...new Set(aTester)].map(async (valeur) => {
      const sante = new URL("/health", valeur).toString();
      try {
        const reponse = await fetch(sante, { signal: AbortSignal.timeout(10000) });
        const corps = await reponse.json().catch(() => ({}));
        if (reponse.ok && corps.status === "ok") ok(`En ligne : ${sante} répond correctement`);
        else erreur(`En ligne : ${sante} répond ${reponse.status}`);
      } catch (e) {
        erreur(`En ligne : ${sante} injoignable ou certificat HTTPS invalide (${e.cause ? e.cause.code || e.cause.message : e.message})`);
      }
    })
  ).then(termine);
}

if (require.main === module) {
  Promise.resolve(main(process.argv.slice(2), process.env)).then((code) => process.exit(code));
}

module.exports = { problemesAdresseApi, problemesIdentifiant, lirePng, main };
