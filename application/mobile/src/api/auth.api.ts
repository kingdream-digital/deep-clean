import { apiClient } from "./client";

export type Role = "EMPLOYEE" | "SITE_MANAGER" | "SUPERVISOR" | "HR" | "DIRECTOR" | "ADMIN";

export interface AuthUser {
  id: string;
  username: string;
  // Coordonnée de contact optionnelle — n'a plus aucun rôle dans la
  // connexion (voir `username` ci-dessus, généré par le serveur).
  email: string | null;
  firstName: string;
  lastName: string;
  role: Role;
  mustChangePassword: boolean;
  hasAvatar: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export async function login(username: string, password: string, rememberMe: boolean): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/login", { username, password, rememberMe });
  return data;
}

export async function refreshSession(refreshToken: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/refresh", { refreshToken });
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post("/auth/logout", { refreshToken });
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const { data } = await apiClient.get<{ user: AuthUser }>("/auth/me");
  return data.user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post("/auth/change-password", { currentPassword, newPassword });
}
