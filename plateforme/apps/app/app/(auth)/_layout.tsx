import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";

/** Écrans accessibles sans être connecté : uniquement la connexion (aucune inscription publique). */
export default function AuthLayout() {
  const { status, user } = useAuth();
  if (status === "signedIn") return <Redirect href={user?.mustChangePassword ? "/premiere-connexion" : "/"} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
