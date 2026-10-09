const path = require("path");
const { problemesAdresseApi, problemesIdentifiant, lirePng } = require("../verifier-publication");

describe("adresse de l'API pour les stores", () => {
  it("accepte une adresse HTTPS publique en /api/v1", () => {
    expect(problemesAdresseApi("https://api.exemple-societe.fr/api/v1")).toEqual([]);
    expect(problemesAdresseApi("https://api.exemple-societe.fr/api/v1/")).toEqual([]);
  });

  it("refuse le HTTP non sécurisé (bloqué par iOS et Android)", () => {
    const p = problemesAdresseApi("http://fmtokdqzbgwovcjd5frrhnvf.141.253.112.12.sslip.io/api/v1");
    expect(p.join(" ")).toMatch(/https/);
  });

  it("refuse les adresses locales", () => {
    for (const a of ["https://localhost:4000/api/v1", "https://192.168.1.20/api/v1", "https://10.0.0.5/api/v1", "https://127.0.0.1/api/v1"]) {
      expect(problemesAdresseApi(a).join(" ")).toMatch(/locale/);
    }
  });

  it("refuse les noms de domaine d'exemple", () => {
    expect(problemesAdresseApi("https://api.example.com/api/v1").join(" ")).toMatch(/provisoire/);
  });

  it("refuse l'adresse provisoire A-CONFIGURER", () => {
    expect(problemesAdresseApi("https://api.A-CONFIGURER.invalid/api/v1").join(" ")).toMatch(/provisoire/);
  });

  it("refuse l'ancien serveur Render", () => {
    expect(problemesAdresseApi("https://deep-clean-app.onrender.com/api/v1").join(" ")).toMatch(/Render/);
  });

  it("refuse une adresse sans /api/v1, vide ou invalide", () => {
    expect(problemesAdresseApi("https://api.exemple-societe.fr").join(" ")).toMatch(/\/api\/v1/);
    expect(problemesAdresseApi("")).not.toEqual([]);
    expect(problemesAdresseApi("pas une adresse")).not.toEqual([]);
  });
});

describe("identifiants d'application", () => {
  it("accepte un identifiant libre au bon format", () => {
    expect(problemesIdentifiant("fr.kingdream.deepclean")).toEqual([]);
  });

  it("refuse l'identifiant déjà pris sur Google Play", () => {
    expect(problemesIdentifiant("com.deepclean.app").join(" ")).toMatch(/déjà utilisé/);
  });

  it("refuse un mauvais format", () => {
    expect(problemesIdentifiant("deepclean")).not.toEqual([]);
    expect(problemesIdentifiant("fr.1kingdream.app")).not.toEqual([]);
    expect(problemesIdentifiant("")).not.toEqual([]);
  });
});

describe("icône de l'App Store", () => {
  const assets = path.join(__dirname, "..", "..", "assets");

  it("l'icône actuelle fait 1024×1024 sans transparence (exigence Apple)", () => {
    const { largeur, hauteur, transparence } = lirePng(path.join(assets, "icon.png"));
    expect([largeur, hauteur]).toEqual([1024, 1024]);
    expect(transparence).toBe(false);
  });

  it("détecte la transparence d'une icône Android (premier plan)", () => {
    const { transparence } = lirePng(path.join(assets, "android-icon-foreground.png"));
    expect(transparence).toBe(true);
  });
});
