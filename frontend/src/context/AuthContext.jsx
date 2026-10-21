import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api, { tokenStore } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" evita piscar a tela de login enquanto conferimos o token salvo
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));
  // true quando o servidor não respondeu (diferente de "token inválido")
  const [unreachable, setUnreachable] = useState(false);

  const loadUser = useCallback(() => {
    if (!tokenStore.get()) return;
    setLoading(true);
    setUnreachable(false);
    api
      .get("/auth/me")
      .then(({ data }) => setUser(data))
      .catch((err) => {
        // Só um 401 significa login inválido (o interceptor já apaga o token).
        // Qualquer outra falha é o servidor fora do ar: mantemos o login salvo.
        if (err.response?.status !== 401) setUnreachable(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadUser, [loadUser]);

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
    <AuthContext.Provider
      value={{ user, setUser, loading, unreachable, retry: loadUser, login, register, logout, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
