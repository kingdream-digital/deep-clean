import { useRouter } from "expo-router";
import { AssistantView } from "@/assistant/AssistantView";
import { useBreakpoint } from "@/theme/ThemeProvider";

/** Assistant en plein écran (téléphone ; sur ordinateur, il est aussi disponible en panneau latéral). */
export default function AssistantScreen() {
  const router = useRouter();
  const { isWide } = useBreakpoint();
  return <AssistantView variant="screen" onClose={isWide ? undefined : () => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
