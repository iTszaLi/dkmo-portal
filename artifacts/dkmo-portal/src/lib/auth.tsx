import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { partyPoppers } from "./confetti";

export type Role = "admin" | "finance" | "event" | "viewer";

export interface AuthUser {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (...roles: Role[]) => boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManagePayments: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const VALID_ROLES: ReadonlySet<string> = new Set([
  "admin",
  "finance",
  "event",
  "viewer",
]);

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/me", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Failed to load session (${res.status})`);
  const data = (await res.json()) as Partial<AuthUser>;
  if (
    !data.userId ||
    !data.username ||
    !data.displayName ||
    !data.role ||
    !VALID_ROLES.has(data.role)
  ) {
    return null;
  }
  return {
    userId: data.userId,
    username: data.username,
    displayName: data.displayName,
    role: data.role as Role,
  };
}

export function defaultLandingForRole(role: Role): string {
  switch (role) {
    case "admin":
      return "/dashboard";
    case "finance":
      return "/payments";
    case "event":
      return "/sponsors";
    case "viewer":
    default:
      return "/dashboard";
  }
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "finance":
      return "Finance Team";
    case "event":
      return "Event Manager";
    case "viewer":
      return "Viewer";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const u = await fetchMe();
    setUser(u);
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetchMe()
      .then((u) => {
        if (mounted) setUser(u);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      let message = "Invalid username or password.";
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }

    const data = (await res.json()) as { user: AuthUser };
    setUser(data.user);
    partyPoppers();
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const role = user?.role;
    const hasRole = (...roles: Role[]) => !!role && roles.includes(role);
    return {
      user,
      isLoading,
      isAuthenticated: !!user,
      hasRole,
      canEdit: role === "admin" || role === "finance",
      canDelete: role === "admin",
      canManagePayments: role === "admin" || role === "finance",
      login,
      logout,
      refresh,
    };
  }, [user, isLoading, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
