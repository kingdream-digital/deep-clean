import { env } from "../src/config/env";
import { getCompanyProfile, sellerBlockLines } from "../src/modules/einvoicing/companyProfile";

const mutableEnv = env as unknown as Record<string, unknown>;
const KEYS = ["COMPANY_LEGAL_NAME", "COMPANY_LEGAL_FORM", "COMPANY_SHARE_CAPITAL", "COMPANY_SIREN", "COMPANY_SIRET", "COMPANY_RCS", "COMPANY_VAT_NUMBER", "COMPANY_ADDRESS", "COMPANY_POSTAL_CODE", "COMPANY_CITY", "COMPANY_PHONE", "COMPANY_EMAIL"];
const saved: Record<string, unknown> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = mutableEnv[k];
});
afterEach(() => {
  for (const k of KEYS) mutableEnv[k] = saved[k];
});

// Retour explicite du client : l'identité légale de Deep Clean (Pappers) est
// intégrée à l'application, sans dépendre de la configuration du serveur.
describe("Identité légale de Deep Clean sur les devis et factures", () => {
  it("utilise l'identité publique de Deep Clean quand le serveur n'a rien de renseigné", () => {
    for (const k of KEYS) mutableEnv[k] = "";
    const c = getCompanyProfile();
    expect(c).toMatchObject({
      name: "DEEP CLEAN",
      legalForm: "SAS",
      shareCapital: "600 €",
      siren: "942773375",
      siret: "94277337500012",
      rcs: "RCS Manosque 942 773 375",
      vatNumber: "FR54942773375",
      addressLine: "21 boulevard de la Plaine",
      postalCode: "04100",
      city: "Manosque",
      phone: "06 81 70 07 51",
      email: "deepclean.contact.pro@gmail.com",
    });
    expect(c.iban).toBeUndefined();
    expect(sellerBlockLines(c)[0]).toBe("DEEP CLEAN, SAS au capital de 600 €");
  });

  it("une variable COMPANY_* renseignée sur le serveur reste prioritaire", () => {
    mutableEnv.COMPANY_SIRET = "942 773 375 00020";
    mutableEnv.COMPANY_SIREN = "";
    const c = getCompanyProfile();
    expect(c.siret).toBe("94277337500020");
    expect(c.siren).toBe("942773375");
  });
});
