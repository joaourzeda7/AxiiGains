import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Loader2, Plus, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import CastAnimation from "@/components/CastAnimation";
import { ProgressRing, SubmitButton } from "@/components/common";
import api, { errorMessage } from "@/lib/api";
import { firstNumber, formatKg, parseNumber, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const draftKey = (planId) => `axii_workout_${planId}`;

function loadDraft(planId) {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey(planId)));
    // rascunhos de mais de 12h atrás são descartados
    if (draft && Date.now() - draft.startedAt < 12 * 3600 * 1000) return draft;
  } catch {
    /* rascunho inválido ou sem armazenamento */
  }
  return null;
}

function saveDraft(planId, draft) {
  try {
    localStorage.setItem(draftKey(planId), JSON.stringify(draft));
  } catch {
    /* sem armazenamento: o treino só não sobrevive a fechar o app */
  }
}

function clearDraft(planId) {
  try {
    localStorage.removeItem(draftKey(planId));
  } catch {
    /* nada a fazer */
  }
}

function buildDraft(plan) {
  return {
    startedAt: Date.now(),
    exercises: plan.exercises.map((ex) => ({
      name: ex.name,
      targetReps: ex.reps,
      rest: ex.rest_seconds ?? 60,
      notes: ex.notes,
      sets: Array.from({ length: ex.sets }, () => ({
        reps: String(firstNumber(ex.reps) ?? ""),
        weight: ex.weight != null ? String(ex.weight).replace(".", ",") : "",
        done: false,
      })),
    })),
  };
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Atualiza a tela a cada segundo (para os cronômetros). */
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Workout() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [draft, setDraft] = useState(null);
  const [restUntil, setRestUntil] = useState(null); // horário em que o descanso acaba
  const [updatePlan, setUpdatePlan] = useState(true);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState({}); // maior carga já usada em cada exercício
  const [summary, setSummary] = useState(null); // preenchido ao finalizar → mostra a animação
  const now = useNow();

  useEffect(() => {
    api
      .get(`/plans/${planId}`)
      .then(({ data }) => {
        setPlan(data);
        setDraft(loadDraft(planId) ?? buildDraft(data));
      })
      .catch((err) => {
        toast.error(errorMessage(err));
        navigate("/fichas", { replace: true });
      });
    api.get("/progress/records").then(({ data }) => setRecords(data)).catch(() => {});
  }, [planId, navigate]);

  // Salva o rascunho a cada mudança: se o app fechar, o treino continua de onde parou
  useEffect(() => {
    if (draft) saveDraft(planId, draft);
  }, [planId, draft]);

  const restLeft = restUntil ? (restUntil - now) / 1000 : 0;
  useEffect(() => {
    if (restUntil && restLeft <= 0) {
      setRestUntil(null);
      navigator.vibrate?.([200, 100, 200]); // funciona no Android; o iPhone ignora
      toast("Descanso finalizado — bora pra próxima série!");
    }
  }, [restUntil, restLeft]);

  const doneCount = useMemo(
    () => draft?.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.done).length, 0) ?? 0,
    [draft],
  );
  const totalCount = useMemo(() => draft?.exercises.reduce((n, ex) => n + ex.sets.length, 0) ?? 0, [draft]);

  function updateSet(exIndex, setIndex, changes) {
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((ex, i) =>
        i !== exIndex ? ex : { ...ex, sets: ex.sets.map((s, j) => (j === setIndex ? { ...s, ...changes } : s)) },
      ),
    }));
  }

  function toggleDone(exIndex, setIndex) {
    const set = draft.exercises[exIndex].sets[setIndex];
    if (!set.done && !(Number(set.reps) > 0)) {
      toast.error("Informe as repetições feitas.");
      return;
    }
    updateSet(exIndex, setIndex, { done: !set.done });
    const rest = draft.exercises[exIndex].rest;
    if (!set.done && rest > 0) setRestUntil(Date.now() + rest * 1000);
  }

  function addSet(exIndex) {
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((ex, i) => {
        if (i !== exIndex) return ex;
        const last = ex.sets.at(-1) ?? { reps: "", weight: "" };
        return { ...ex, sets: [...ex.sets, { reps: last.reps, weight: last.weight, done: false }] };
      }),
    }));
  }

  function handleCancel() {
    if (doneCount > 0 && !window.confirm("Descartar este treino? As séries marcadas serão perdidas.")) return;
    clearDraft(planId);
    navigate(-1);
  }

  async function handleFinish() {
    const sets = draft.exercises.flatMap((ex) =>
      ex.sets
        .filter((s) => s.done)
        .map((s, i) => ({
          exercise_name: ex.name,
          set_number: i + 1,
          reps: Number(s.reps),
          weight: parseNumber(s.weight) ?? 0,
        })),
    );
    if (sets.length === 0) {
      toast.error("Marque pelo menos uma série como feita.");
      return;
    }

    setSaving(true);
    try {
      await api.post("/sessions", { plan_id: plan.id, plan_name: plan.name, date: todayISO(), sets });

      if (updatePlan) {
        // Atualiza a carga da ficha com a maior carga usada hoje em cada exercício
        const maxByExercise = maxWeights(sets);
        await api.put(`/plans/${plan.id}`, {
          name: plan.name,
          notes: plan.notes,
          exercises: plan.exercises.map(({ name, sets, reps, weight, rest_seconds, notes }) => ({
            name,
            sets,
            reps,
            rest_seconds,
            notes,
            weight: maxByExercise[name] > 0 ? maxByExercise[name] : weight,
          })),
        });
      }

      clearDraft(planId);
      // Recorde novo = carga maior que a melhor já registrada naquele exercício
      const newRecords = Object.entries(maxWeights(sets))
        .filter(([name, weight]) => records[name] != null && weight > records[name])
        .map(([name, weight]) => ({ name, weight }));
      setRestUntil(null);
      setSummary({
        planName: plan.name,
        duration: (Date.now() - draft.startedAt) / 1000,
        sets: sets.length,
        volume: sets.reduce((total, s) => total + s.reps * s.weight, 0),
        records: newRecords,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (summary) {
    return <CastAnimation summary={summary} onContinue={() => navigate("/progresso", { replace: true })} />;
  }

  if (!draft) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[calc(9rem+env(safe-area-inset-bottom))]">
      {/* Cabeçalho fixo: cronômetro grande + anel com as séries feitas */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-4 pt-safe backdrop-blur-xl">
        <div className="flex items-center gap-3 py-3">
          <Button variant="ghost" size="icon" onClick={handleCancel} aria-label="Sair do treino" className="-ml-2">
            <X />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{plan.name}</p>
            <p className="text-3xl leading-tight font-extrabold tabular-nums">{formatClock((now - draft.startedAt) / 1000)}</p>
          </div>
          <ProgressRing value={doneCount / totalCount} size={52}>
            {doneCount}/{totalCount}
          </ProgressRing>
        </div>
        <div className="-mx-4 h-1 bg-secondary">
          <div
            className="h-full bg-gradient-to-r from-[#9c85ff] to-[var(--chart-3)] transition-all"
            style={{ width: `${(doneCount / totalCount) * 100}%` }}
          />
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-4">
        {draft.exercises.map((ex, exIndex) => (
          <Card key={exIndex} className="gap-3 py-4">
            <CardContent className="px-4">
              <div className="mb-3">
                <h2 className="title-rune font-bold">{ex.name}</h2>
                <p className="text-xs text-muted-foreground">
                  Meta {ex.sets.length} × {ex.targetReps}
                  {ex.rest > 0 && ` · descanso ${ex.rest}s`}
                  {records[ex.name] > 0 && ` · recorde ${formatKg(records[ex.name])}`}
                  {ex.notes && ` · ${ex.notes}`}
                </p>
              </div>

              <div className="grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 text-[10px] tracking-wider text-muted-foreground uppercase">
                <span className="text-center">Série</span>
                <span className="text-center">Kg</span>
                <span className="text-center">Reps</span>
                <span />
                {ex.sets.map((s, setIndex) => (
                  <SetRow
                    key={setIndex}
                    index={setIndex}
                    set={s}
                    onChange={(changes) => updateSet(exIndex, setIndex, changes)}
                    onToggle={() => toggleDone(exIndex, setIndex)}
                  />
                ))}
              </div>

              <Button variant="ghost" size="sm" className="mt-2 w-full text-brand-soft" onClick={() => addSet(exIndex)}>
                <Plus /> Série extra
              </Button>
            </CardContent>
          </Card>
        ))}

        <label className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <input
            type="checkbox"
            checked={updatePlan}
            onChange={(e) => setUpdatePlan(e.target.checked)}
            className="size-5 accent-[var(--primary)]"
          />
          Atualizar a ficha com as cargas usadas hoje
        </label>
      </div>

      {/* Rodapé fixo: cronômetro de descanso + finalizar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur-xl pb-safe">
        <div className="mx-auto flex max-w-lg flex-col gap-2 px-4 py-3">
          {restUntil && (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/35 bg-gradient-to-r from-primary/25 to-[color-mix(in_oklab,var(--chart-3)_15%,transparent)] px-4 py-2">
              <Timer className="size-5 text-brand-soft" />
              <div className="flex-1 leading-tight">
                <p className="text-[10px] tracking-wider text-muted-foreground uppercase">Descanso</p>
                <p className="text-xl font-bold tabular-nums">{formatClock(restLeft)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRestUntil((t) => t + 15000)}>
                +15s
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRestUntil(null)}>
                Pular
              </Button>
            </div>
          )}
          <SubmitButton type="button" loading={saving} onClick={handleFinish} className="h-12 text-sm font-bold tracking-wider uppercase">
            <Check /> Finalizar treino
          </SubmitButton>
        </div>
      </div>
    </div>
  );
}

function SetRow({ index, set, onChange, onToggle }) {
  return (
    <>
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full text-sm font-semibold",
          set.done ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
        )}
      >
        {index + 1}
      </span>
      <Input
        inputMode="decimal"
        placeholder="0"
        value={set.weight}
        onChange={(e) => onChange({ weight: e.target.value.replace(/[^\d.,]/g, "") })}
        className={cn("h-11 text-center", set.done && "opacity-60")}
        aria-label={`Carga da série ${index + 1}`}
      />
      <Input
        inputMode="numeric"
        placeholder="0"
        value={set.reps}
        onChange={(e) => onChange({ reps: e.target.value.replace(/\D/g, "") })}
        className={cn("h-11 text-center", set.done && "opacity-60")}
        aria-label={`Repetições da série ${index + 1}`}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={set.done ? "Desmarcar série" : "Marcar série como feita"}
        className={cn(
          "flex h-11 items-center justify-center rounded-xl border transition-colors",
          set.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
        )}
      >
        <Check className="size-5" />
      </button>
    </>
  );
}

/** { "Supino": 45, ... } com a maior carga de cada exercício na lista de séries */
function maxWeights(sets) {
  const result = {};
  for (const s of sets) result[s.exercise_name] = Math.max(result[s.exercise_name] ?? 0, s.weight);
  return result;
}
