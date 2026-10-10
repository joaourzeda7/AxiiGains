import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Dumbbell, Minus, Play, Scale, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo, ProgressRing, SectionTitle } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { currentWeekDates, estimateMinutes, formatKg, formatRelative, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["S", "T", "Q", "Q", "S", "S", "D"];

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
    api
      .get("/progress/dashboard", { params: { today: todayISO() } })
      .then(({ data }) => setData(data))
      .catch(() => setData(false));
  }, []);

  const firstName = user.name.split(" ")[0];
  const profileIncomplete = !user.goal || !user.level || !user.days_per_week;

  return (
    <div className="flex flex-col gap-4">
      <header className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{greeting()},</p>
            <h1 className="title-rune text-3xl font-bold">{firstName}</h1>
          </div>
          <Logo className="size-11" />
        </div>
        <div className="rule-fade mt-4" />
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
          <Skeleton className="h-48 rounded-3xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        </>
      ) : data === false ? (
        <p className="text-sm text-muted-foreground">Não foi possível carregar o resumo.</p>
      ) : (
        <>
          <NextWorkoutCard plan={data.next_plan} />
          <WeekStrip doneDates={data.week_dates} done={data.sessions_this_week} goal={data.days_per_week} />

          <SectionTitle>Resumo</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              visual={
                <ProgressRing value={data.sessions_this_week / (data.days_per_week || 3)}>
                  {Math.round(Math.min(1, data.sessions_this_week / (data.days_per_week || 3)) * 100)}%
                </ProgressRing>
              }
              value={data.sessions_total}
              label={data.sessions_total === 1 ? "treino feito" : "treinos feitos"}
            />
            <WeightCard weight={data.latest_weight} change={data.weight_change} />
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
  return (
    <div className="hero-card glow-brand rounded-3xl p-5 text-white">
      {plan ? (
        <>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-white/70 uppercase">Próximo treino</p>
          <h2 className="title-rune mt-1 text-2xl font-bold">{plan.name}</h2>
          {plan.exercises.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip>
                {plan.exercises.length} exercício{plan.exercises.length !== 1 && "s"}
              </Chip>
              <Chip>~{estimateMinutes(plan)} min</Chip>
            </div>
          )}
          <Button
            asChild
            size="lg"
            className="relative mt-4 h-12 w-full bg-white text-sm font-bold tracking-wider text-[#2a1466] uppercase hover:bg-white/90"
          >
            {plan.exercises.length > 0 ? (
              <Link to={`/treino/${plan.id}`}>
                <Play className="fill-current" /> Começar treino
              </Link>
            ) : (
              <Link to={`/fichas/${plan.id}`}>Adicionar exercícios</Link>
            )}
          </Button>
        </>
      ) : (
        <>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-white/70 uppercase">Comece por aqui</p>
          <h2 className="title-rune mt-1 text-2xl font-bold">Crie sua primeira ficha</h2>
          <div className="relative mt-4 flex gap-2">
            <Button asChild className="h-11 flex-1 bg-white font-semibold text-[#2a1466] hover:bg-white/90">
              <Link to="/ia">
                <Sparkles /> Gerar com IA
              </Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 flex-1 text-white hover:bg-white/10 hover:text-white">
              <Link to="/fichas/nova">Montar manual</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ children }) {
  return <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">{children}</span>;
}

function WeekStrip({ doneDates, done, goal }) {
  const done_ = new Set(doneDates);
  const today = todayISO();
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle aside={`${done} de ${goal || 3}`}>Esta semana</SectionTitle>
      <div className="grid grid-cols-7 gap-2">
        {currentWeekDates().map((date, i) => {
          const isDone = done_.has(date);
          const isToday = date === today;
          return (
            <div key={date} className="flex flex-col items-center gap-1.5">
              <span className={cn("text-[11px]", isToday ? "font-bold text-foreground" : "text-muted-foreground")}>
                {WEEKDAYS[i]}
              </span>
              <span
                className={cn(
                  "flex aspect-square w-full items-center justify-center rounded-xl border text-xs font-semibold",
                  isDone
                    ? "border-transparent bg-gradient-to-br from-[#9c85ff] to-[#5a2fe6] text-white shadow-[0_4px_14px_-4px_rgba(123,92,255,0.9)]"
                    : "border-border bg-muted text-muted-foreground",
                  isToday && !isDone && "border-primary",
                )}
              >
                {date.slice(8, 10)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ visual, value, unit, label }) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-3 px-4">
        {visual}
        <div className="min-w-0">
          <p className="text-2xl leading-none font-bold tabular-nums">
            {value}
            {unit && <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{unit}</span>}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function WeightCard({ weight, change }) {
  const TrendIcon = !change ? Minus : change < 0 ? TrendingDown : TrendingUp;
  return (
    <Link to="/progresso?aba=corpo">
      <StatCard
        visual={
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--chart-3)_18%,transparent)] text-[var(--chart-3)]">
            {weight == null ? <Scale className="size-5" /> : <TrendIcon className="size-5" />}
          </div>
        }
        value={weight == null ? "—" : formatKg(weight).replace(" kg", "")}
        unit={weight == null ? null : "kg"}
        label={weight == null ? "registre seu peso" : change ? `${change > 0 ? "+" : ""}${formatKg(change)} no total` : "peso atual"}
      />
    </Link>
  );
}
