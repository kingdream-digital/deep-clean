import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AuthenticatedImage } from "./AuthenticatedImage";

interface PhotoViewerModalProps {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

// Visionneuse plein écran pour une photo — utilisée notamment pour le
// justificatif de pointage (retour explicite du client : il veut pouvoir
// agrandir la photo, pas juste la vignette). Ferme au tap n'importe où,
// comme n'importe quelle visionneuse photo classique.
export function PhotoViewerModal({ visible, uri, onClose }: PhotoViewerModalProps) {
  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <AuthenticatedImage uri={uri} style={styles.image} resizeMode="contain" />
        <Pressable onPress={onClose} hitSlop={16} style={styles.close}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "80%" },
  close: { position: "absolute", top: 56, right: 20, padding: 8 },
});
