import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { StateView } from "../StateView";
import { ThemeProvider } from "../../theme/ThemeProvider";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("StateView", () => {
  it("affiche le message d'absence de connexion prévu par le cahier des charges", () => {
    renderWithTheme(<StateView kind="offline" />);
    expect(screen.getByText("Pas de connexion")).toBeTruthy();
    expect(screen.getByText("Vérifiez votre connexion internet et réessayez.")).toBeTruthy();
  });

  it("affiche le message d'accès refusé sans détail technique", () => {
    renderWithTheme(<StateView kind="forbidden" />);
    expect(screen.getByText("Accès refusé")).toBeTruthy();
  });

  it("affiche le message de session expirée", () => {
    renderWithTheme(<StateView kind="sessionExpired" />);
    expect(screen.getByText("Session expirée")).toBeTruthy();
  });

  it("permet de personnaliser le titre et le message", () => {
    renderWithTheme(<StateView kind="error" title="Titre personnalisé" message="Message personnalisé" />);
    expect(screen.getByText("Titre personnalisé")).toBeTruthy();
    expect(screen.getByText("Message personnalisé")).toBeTruthy();
  });

  it("déclenche onRetry au clic sur le bouton de nouvelle tentative", () => {
    const onRetry = jest.fn();
    renderWithTheme(<StateView kind="error" onRetry={onRetry} />);
    fireEvent.press(screen.getByText("Réessayer"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("n'affiche aucun bouton de nouvelle tentative sans onRetry", () => {
    renderWithTheme(<StateView kind="empty" />);
    expect(screen.queryByText("Réessayer")).toBeNull();
  });
});
