import { isInboxMutation, notifyInboxChanged, subscribeToInboxChanges } from "../inboxEvents";

describe("Compteur de la messagerie : détection des actions", () => {
  it("reconnaît lecture, suppression et envoi dans la messagerie et les notifications", () => {
    expect(isInboxMutation("patch", "/notifications/abc/read")).toBe(true);
    expect(isInboxMutation("post", "/notifications/read-all")).toBe(true);
    expect(isInboxMutation("delete", "/notifications/abc")).toBe(true);
    expect(isInboxMutation("post", "/messages/conversations/abc/read")).toBe(true);
    expect(isInboxMutation("post", "http://api.test/api/v1/messages/abc")).toBe(true);
  });

  it("ignore les simples lectures de liste et les autres écrans", () => {
    expect(isInboxMutation("get", "/notifications")).toBe(false);
    expect(isInboxMutation("post", "/missions/abc")).toBe(false);
    expect(isInboxMutation("post", "/quotes/abc/send")).toBe(false);
  });

  it("prévient chaque abonné, et plus après désabonnement", () => {
    const listener = jest.fn();
    const stop = subscribeToInboxChanges(listener);
    notifyInboxChanged();
    stop();
    notifyInboxChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
