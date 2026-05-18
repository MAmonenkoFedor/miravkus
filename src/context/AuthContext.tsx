import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiRequest, clearToken, getToken, setToken } from "@/integrations/api/client";

export type AuthUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
};

export type AuthSession = {
  expiresAt: string | null;
  createdAt?: string | null;
};

interface AuthContextType {
  user: AuthUser | null;
  roles: string[];
  session: AuthSession | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<{ requestId: string }>;
  verifyOtp: (phone: string, code: string, requestId: string) => Promise<void>;
  requestEmailOtp: (email: string) => Promise<{ requestId: string }>;
  verifyEmailOtp: (email: string, code: string, requestId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  roles: [],
  session: null,
  loading: true,
  signInWithPassword: async () => {},
  requestOtp: async () => ({ requestId: "" }),
  verifyOtp: async () => {},
  requestEmailOtp: async () => ({ requestId: "" }),
  verifyEmailOtp: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const clearLocalAuth = () => {
    clearToken();
    setUser(null);
    setRoles([]);
    setSession(null);
  };

  useEffect(() => {
    const bootstrap = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiRequest<{ user: AuthUser; roles: string[]; session?: AuthSession | null }>(
          "/api/auth/me"
        );
        setUser(data.user);
        setRoles(data.roles || []);
        setSession(data.session ?? null);
      } catch {
        clearLocalAuth();
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  const applyAuth = (data: { token: string; user: AuthUser; roles: string[]; session?: AuthSession | null }) => {
    setToken(data.token);
    setUser(data.user);
    setRoles(data.roles || []);
    setSession(data.session ?? null);
  };

  const signInWithPassword = async (email: string, password: string) => {
    const data = await apiRequest<{ token: string; user: AuthUser; roles: string[]; session?: AuthSession | null }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }
    );
    applyAuth(data);
  };

  const requestEmailOtp = async (email: string) => {
    const data = await apiRequest<{ requestId: string }>("/api/auth/email-otp/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return data;
  };

  const verifyEmailOtp = async (email: string, code: string, requestId: string) => {
    const data = await apiRequest<{ token: string; user: AuthUser; roles: string[]; session?: AuthSession | null }>(
      "/api/auth/email-otp/verify",
      {
        method: "POST",
        body: JSON.stringify({ email, code, requestId }),
      }
    );
    applyAuth(data);
  };

  const requestOtp = async (phone: string) => {
    const data = await apiRequest<{ requestId: string }>("/api/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
    return data;
  };

  const verifyOtp = async (phone: string, code: string, requestId: string) => {
    const data = await apiRequest<{ token: string; user: AuthUser; roles: string[]; session?: AuthSession | null }>(
      "/api/auth/otp/verify",
      {
        method: "POST",
        body: JSON.stringify({ phone, code, requestId }),
      }
    );
    applyAuth(data);
  };

  const signOut = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      void 0;
    }
    clearLocalAuth();
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      clearLocalAuth();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "auth_token" && !event.newValue) {
        clearLocalAuth();
      }
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const expiresAt = session?.expiresAt;
    if (!expiresAt) return;
    const expiresMs = new Date(expiresAt).getTime();
    if (Number.isNaN(expiresMs)) return;
    const delay = expiresMs - Date.now();
    if (delay <= 0) {
      clearLocalAuth();
      return;
    }
    const id = window.setTimeout(() => {
      clearLocalAuth();
    }, delay);
    return () => window.clearTimeout(id);
  }, [session?.expiresAt]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const id = window.setInterval(async () => {
      try {
        const data = await apiRequest<{ user: AuthUser; roles: string[]; session?: AuthSession | null }>(
          "/api/auth/me"
        );
        setUser(data.user);
        setRoles(data.roles || []);
        setSession(data.session ?? null);
      } catch {
        clearLocalAuth();
      }
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        roles,
        session,
        loading,
        signInWithPassword,
        requestOtp,
        verifyOtp,
        requestEmailOtp,
        verifyEmailOtp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
