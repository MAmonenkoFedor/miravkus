import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiRequest, clearToken, getToken, setToken } from "@/integrations/api/client";

export type AuthUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
};

interface AuthContextType {
  user: AuthUser | null;
  roles: string[];
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<{ requestId: string }>;
  verifyOtp: (phone: string, code: string, requestId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  roles: [],
  loading: true,
  signInWithPassword: async () => {},
  requestOtp: async () => ({ requestId: "" }),
  verifyOtp: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiRequest<{ user: AuthUser; roles: string[] }>("/api/auth/me");
        setUser(data.user);
        setRoles(data.roles || []);
      } catch {
        clearToken();
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  const applyAuth = (data: { token: string; user: AuthUser; roles: string[] }) => {
    setToken(data.token);
    setUser(data.user);
    setRoles(data.roles || []);
  };

  const signInWithPassword = async (email: string, password: string) => {
    const data = await apiRequest<{ token: string; user: AuthUser; roles: string[] }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
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
    const data = await apiRequest<{ token: string; user: AuthUser; roles: string[] }>(
      "/api/auth/otp/verify",
      {
        method: "POST",
        body: JSON.stringify({ phone, code, requestId }),
      }
    );
    applyAuth(data);
  };

  const signOut = async () => {
    clearToken();
    setUser(null);
    setRoles([]);
  };

  return (
    <AuthContext.Provider
      value={{ user, roles, loading, signInWithPassword, requestOtp, verifyOtp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
