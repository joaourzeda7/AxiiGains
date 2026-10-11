import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Activity, CalendarCheck, Dumbbell, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import api, { errorMessage } from "@/lib/api";
import { formatRelative, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Painel do dono do app: quem se cadastrou e quem está usando. */
export default function Admin() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user.is_admin) return;
    api
      .get("/admin/overview")
      .then(({ data }) => setData(data))
      .catch((err) => setError(errorMessage(err)));
  }, [user.is_admin]);

  // A proteção de verdade é no backend (403); aqui só evitamos mostrar a tela à toa
  if (!user.is_admin) return <Navigate to="/" replace />;

  return (
    <>
      <PageHeader title="Painel" subtitle="Quem está usando o AxiiGains" back="/perfil" />

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={Users} value={data.total_users} label="cadastrados" />
            <Stat icon={Activity} value={data.active_last_7_days} label="ativos (7 dias)" />
            <Stat icon={Dumbbell} value={data.total_sessions} label="treinos" />
          </div>

          <ul className="flex flex-col gap-2">
            {data.users.map((u) => (
              <li key={u.id}>
                <Card className="py-3">
                  <CardContent className="flex items-center gap-3 px-4">
                    <div className="title-rune flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-lg font-bold text-brand-soft">
                      {u.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        entrou {formatRelative(u.created_at.slice(0, 10)).toLowerCase()}
                        {" · "}
                        {u.plans_count} ficha{u.plans_count !== 1 && "s"}
                      </p>
                    </div>
                    <LastWorkout count={u.sessions_count} last={u.last_session} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <Icon className="mb-1 size-4 text-brand-soft" />
      <p className="text-2xl leading-none font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

function LastWorkout({ count, last }) {
  if (!count) {
    return <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">sem treino</span>;
  }
  const daysAgo = Math.round((new Date(todayISO()) - new Date(last)) / 86400000);
  return (
    <div className="shrink-0 text-right">
      <p className="flex items-center justify-end gap-1 text-sm font-semibold tabular-nums">
        <CalendarCheck className={cn("size-3.5", daysAgo <= 7 ? "text-[var(--chart-3)]" : "text-muted-foreground")} />
        {count}
      </p>
      <p className="text-[11px] text-muted-foreground">{formatRelative(last).toLowerCase()}</p>
    </div>
  );
}
