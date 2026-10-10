import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api, { tokenStore } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" evita piscar a tela de login enquanto conferimos o token salvo
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));

  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .get("/auth/me")
      .then(({ data }) => setUser(data))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  // O interceptor do axios dispara esse evento quando recebe 401
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener("axii:logout", onLogout);
    return () => window.removeEventListener("axii:logout", onLogout);
  }, []);

  const handleToken = useCallback(({ access_token, user }) => {
    tokenStore.set(access_token);
    setUser(user);
  }, []);

  const login = useCallback(
    async (email, password) => {
      // O endpoint segue o padrão OAuth2: formulário com "username" e "password"
      const form = new URLSearchParams({ username: email, password });
      const { data } = await api.post("/auth/login", form);
      handleToken(data);
    },
    [handleToken],
  );

  const register = useCallback(
    async (name, email, password, inviteCode) => {
      const { data } = await api.post("/auth/register", { name, email, password, invite_code: inviteCode || null });
      handleToken(data);
    },
    [handleToken],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (changes) => {
    const { data } = await api.patch("/auth/me", changes);
    setUser(data);
    return data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
