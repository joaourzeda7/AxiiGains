import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Dumbbell, Play, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader } from "@/components/common";
import api from "@/lib/api";

export default function Plans() {
  const [plans, setPlans] = useState(null);

  useEffect(() => {
    api.get("/plans").then(({ data }) => setPlans(data)).catch(() => setPlans([]));
  }, []);

  return (
    <>
      <PageHeader
        title="Fichas"
        subtitle="Seus treinos organizados"
        action={
          <Button asChild size="icon-lg" className="rounded-full">
            <Link to="/fichas/nova" aria-label="Nova ficha">
              <Plus />
            </Link>
          </Button>
        }
      />

      {plans === null ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Nenhuma ficha ainda"
          description="Monte sua ficha do zero ou deixe a IA criar um plano para você."
        >
          <Button asChild>
            <Link to="/ia">
              <Sparkles /> Gerar com IA
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/fichas/nova">Criar manualmente</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Card className="py-0">
                <CardContent className="flex items-center gap-3 px-0">
                  <Link to={`/fichas/${plan.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-lg font-bold text-brand-soft">
                      {plan.name.match(/treino\s+(\w)/i)?.[1]?.toUpperCase() ?? plan.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{plan.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {plan.exercises.length} exercício{plan.exercises.length !== 1 && "s"}
                        {plan.exercises.length > 0 && ` · ${plan.exercises.map((e) => e.name).join(", ")}`}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </Link>
                  {plan.exercises.length > 0 && (
                    <Button asChild size="icon-lg" className="mr-4 shrink-0 rounded-full">
                      <Link to={`/treino/${plan.id}`} aria-label={`Treinar ${plan.name}`}>
                        <Play className="fill-current" />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
