import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { FullScreenLoader } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import AICoach from "@/pages/AICoach";
import AuthPage from "@/pages/AuthPage";
import Home from "@/pages/Home";
import PlanEditor from "@/pages/PlanEditor";
import Plans from "@/pages/Plans";
import Profile from "@/pages/Profile";
import Workout from "@/pages/Workout";

// A tela de progresso usa a biblioteca de gráficos (pesada): só é baixada quando o usuário abre a aba
const Progress = lazy(() => import("@/pages/Progress"));

/** Só deixa passar quem está logado. */
function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

/** Login/cadastro: quem já está logado sai daqui.
 *  Este é o ÚNICO lugar que redireciona após entrar — se a tela de login também
 *  navegasse, os dois redirecionamentos disputariam e um sobrescreveria o outro. */
function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Outlet />;
  // Perfil ainda vazio (conta nova) → primeiro configura o perfil
  return <Navigate to={user.goal ? "/" : "/perfil?novo=1"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/cadastro" element={<AuthPage mode="register" />} />
      </Route>

      <Route element={<RequireAuth />}>
        {/* Tela de treino ocupa a tela toda, sem a barra de abas */}
        <Route path="/treino/:planId" element={<Workout />} />

        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/fichas" element={<Plans />} />
          <Route path="/fichas/nova" element={<PlanEditor />} />
          <Route path="/fichas/:id" element={<PlanEditor />} />
          <Route path="/ia" element={<AICoach />} />
          <Route
            path="/progresso"
            element={
              <Suspense fallback={null}>
                <Progress />
              </Suspense>
            }
          />
          <Route path="/perfil" element={<Profile />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
