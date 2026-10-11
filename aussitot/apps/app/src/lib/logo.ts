import { Image, Platform, type ImageSourcePropType } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { API_URL, getAccessToken } from "@/api/client";
import { endpoints } from "@/api/endpoints";

export interface OrgLogo {
  source: ImageSourcePropType;
  /** Largeur / hauteur : un logo horizontal s'affiche à sa vraie largeur, aligné à gauche. */
  aspectRatio: number;
}

/**
 * Logo de l'entreprise : fichier privé, servi seulement avec la session.
 * Une seule lecture par version, partagée par tous les écrans (navigation,
 * réglages…). Navigateur : téléchargé puis affiché depuis la mémoire ;
 * téléphone : chargé par le composant Image avec l'en-tête d'authentification.
 * Hors du cache conservé sur l'appareil (clé absente de OFFLINE_QUERY_KEYS).
 */
export function useOrgLogo(organizationId: string | undefined, version: string | null | undefined): OrgLogo | null {
  const query = useQuery({
    queryKey: ["org-logo", organizationId, version],
    enabled: Boolean(organizationId && version),
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<OrgLogo> => {
      if (Platform.OS === "web") {
        const blob = await endpoints.organization.logo();
        const bitmap = await createImageBitmap(blob);
        const aspectRatio = bitmap.width / bitmap.height;
        bitmap.close();
        return { source: { uri: URL.createObjectURL(blob) }, aspectRatio };
      }
      await endpoints.auth.me(); // jeton d'accès frais pour l'en-tête de l'image
      const uri = `${API_URL}/v1/organization/logo?v=${encodeURIComponent(version ?? "")}`;
      const headers = { authorization: `Bearer ${getAccessToken() ?? ""}` };
      const size = await Image.getSizeWithHeaders(uri, headers);
      return { source: { uri, headers }, aspectRatio: size.width / size.height };
    },
  });
  return version ? (query.data ?? null) : null;
}
