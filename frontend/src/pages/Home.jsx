import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Dumbbell, Flame, Play, Scale, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { formatKg, formatRelative } from "@/lib/format";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/progress/dashboard").then(({ data }) => setData(data)).catch(() => setData(false));
  }, []);

  const firstName = user.name.split(" ")[0];
  const profileIncomplete = !user.goal || !user.level || !user.days_per_week;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between pt-6 pb-1">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="text-3xl font-bold tracking-tight">{firstName}</h1>
        </div>
        <Logo className="size-11" />
      </header>

      {profileIncomplete && (
        <Link to="/perfil">
          <Card className="border-primary/40 bg-primary/10">
            <CardContent className="flex items-center gap-3">
              <Sparkles className="size-5 shrink-0 text-brand-soft" />
              <p className="flex-1 text-sm">Complete seu perfil para a IA montar seu treino.</p>
              <ChevronRight className="size-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {data === null ? (
        <>
          <Skeleton className="h-44 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </>
      ) : data === false ? (
        <p className="text-sm text-muted-foreground">Não foi possível carregar o resumo.</p>
      ) : (
        <>
          <NextWorkoutCard plan={data.next_plan} />
          <WeekCard done={data.sessions_this_week} goal={data.days_per_week} />

          <div className="grid grid-cols-2 gap-3">
            <Stat icon={Trophy} label="Treinos feitos" value={data.sessions_total} />
            <Stat icon={Scale} label="Peso atual" value={formatKg(data.latest_weight)} to="/progresso?aba=corpo" />
          </div>

          {data.last_session && (
            <Link to="/progresso">
              <Card>
                <CardContent className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-secondary">
                    <Dumbbell className="size-5 text-brand-soft" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Último treino · {formatRelative(data.last_session.date)}</p>
                    <p className="truncate font-medium">{data.last_session.plan_name}</p>
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function NextWorkoutCard({ plan }) {
  if (!plan) {
    return (
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#7b5cff] via-[#5a35e0] to-[#2a1466] glow-brand">
        <CardContent className="flex flex-col gap-4 py-2">
          <div>
            <p className="text-sm text-white/70">Comece por aqui</p>
            <h2 className="text-xl font-semibold text-white">Crie sua primeira ficha</h2>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary" className="flex-1 bg-white text-[#2a1466] hover:bg-white/90">
              <Link to="/ia">
                <Sparkles /> Gerar com IA
              </Link>
            </Button>
            <Button asChild variant="ghost" className="flex-1 text-white hover:bg-white/10 hover:text-white">
              <Link to="/fichas/nova">Montar manual</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#7b5cff] via-[#5a35e0] to-[#2a1466] glow-brand">
      <CardContent className="flex flex-col gap-4 py-2">
        <div>
          <p className="text-sm text-white/70">Próximo treino</p>
          <h2 className="text-2xl font-semibold text-white">{plan.name}</h2>
          <p className="mt-1 text-sm text-white/70">
            {plan.exercises.length} exercício{plan.exercises.length !== 1 && "s"}
            {plan.exercises.length > 0 && ` · ${plan.exercises.slice(0, 3).map((e) => e.name).join(", ")}`}
            {plan.exercises.length > 3 && "…"}
          </p>
        </div>
        <Button asChild size="lg" className="h-12 bg-white text-base text-[#2a1466] hover:bg-white/90">
          {plan.exercises.length > 0 ? (
            <Link to={`/treino/${plan.id}`}>
              <Play className="fill-current" /> Começar treino
            </Link>
          ) : (
            <Link to={`/fichas/${plan.id}`}>Adicionar exercícios</Link>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function WeekCard({ done, goal }) {
  const target = goal || 3;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="size-5 text-orange-400" />
            <span className="font-medium">Meta da semana</span>
          </div>
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{done}</span> / {target} treinos
          </span>
        </div>
        <Progress value={Math.min(100, (done / target) * 100)} className="h-2" />
      </CardContent>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, to }) {
  const content = (
    <Card className="h-full">
      <CardContent className="flex flex-col gap-2">
        <Icon className="size-5 text-brand-soft" />
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}
