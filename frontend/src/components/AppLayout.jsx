import { NavLink, Outlet } from "react-router-dom";
import { ChartLine, Dumbbell, House, Sparkles, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "Início", icon: House, end: true },
  { to: "/fichas", label: "Fichas", icon: Dumbbell },
  { to: "/ia", label: "Axii IA", icon: Sparkles },
  { to: "/progresso", label: "Progresso", icon: ChartLine },
  { to: "/perfil", label: "Perfil", icon: UserRound },
];

/** Estrutura das telas principais: conteúdo + barra de abas fixa embaixo (estilo app nativo). */
export default function AppLayout() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main className="px-4 pt-safe pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl pb-safe">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    isActive ? "text-brand-soft" : "text-muted-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                        isActive && "bg-primary/20",
                      )}
                    >
                      <Icon className="size-5" strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
