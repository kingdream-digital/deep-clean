import { useEffect, useState } from "react";
import { Platform, type ImageSourcePropType } from "react-native";
import { API_URL, getAccessToken } from "@/api/client";
import { endpoints, fetchPrivateFile } from "@/api/endpoints";

/**
 * Logo de l'entreprise : fichier privé, servi seulement avec la session.
 * Téléphone : l'image est chargée avec l'en-tête d'authentification ;
 * navigateur : téléchargée puis affichée depuis la mémoire.
 */
export function useOrgLogo(hasLogo: boolean, version: string): ImageSourcePropType | null {
  const [source, setSource] = useState<ImageSourcePropType | null>(null);
  useEffect(() => {
    if (!hasLogo) {
      setSource(null);
      return;
    }
    let url: string | null = null;
    let active = true;
    (async () => {
      await endpoints.auth.me().catch(() => undefined);
      if (Platform.OS === "web") {
        const blob = await fetchPrivateFile("/v1/organization/logo").catch(() => null);
        if (!blob || !active) return;
        url = URL.createObjectURL(blob);
        setSource({ uri: url });
      } else if (active) {
        setSource({
          uri: `${API_URL}/v1/organization/logo?v=${encodeURIComponent(version)}`,
          headers: { authorization: `Bearer ${getAccessToken() ?? ""}` },
        });
      }
    })();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [hasLogo, version]);
  return source;
}
