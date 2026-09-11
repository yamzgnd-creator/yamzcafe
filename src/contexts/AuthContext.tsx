import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  authApi,
  tokenHelpers,
  type LoginResponse,
  type UserProfile,
} from '@/lib/api';

export type UserRole = 'admin' | 'staff' | 'cashier' | 'parent' | 'student';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load profile from API
  const loadProfile = useCallback(async () => {
    try {
      const p = await authApi.getProfile();
      setProfile(p);
      return p;
    } catch {
      setProfile(null);
      return null;
    }
  }, []);

  // Initialize from stored token
  useEffect(() => {
    const stored = tokenHelpers.getStoredUser();
    const token = tokenHelpers.getToken();

    if (stored && token) {
      const authUser: AuthUser = {
        id: stored.id,
        email: stored.email,
        role: stored.role as UserRole,
        name: stored.full_name,
      };
      setUser(authUser);
      loadProfile().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const data: LoginResponse = await authApi.login({ email, password });

      tokenHelpers.setToken(data.token);
      tokenHelpers.setStoredUser(data.user);

      const authUser: AuthUser = {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role as UserRole,
        name: data.user.full_name,
      };

      setUser(authUser);

      // Load full profile
      try {
        await loadProfile();
      } catch {
        // profile load failure is non-fatal
      }

      return authUser;
    },
    [loadProfile]
  );

  const signOut = useCallback(() => {
    tokenHelpers.clear();
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}