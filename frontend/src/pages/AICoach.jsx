import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Lightbulb, RotateCcw, Save, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceChips, PageHeader, SubmitButton } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import api, { errorMessage } from "@/lib/api";
import { GOALS, LEVELS } from "@/lib/format";

const RESULT_KEY = "axii_ai_result";
const LOADING_MESSAGES = [
  "Conjurando o sinal Axii…",
  "Analisando seu perfil…",
  "Escolhendo os exercícios…",
  "Equilibrando volume e descanso…",
];

const toOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));

export default function AICoach() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    goal: user.goal ?? "hipertrofia",
    level: user.level ?? "iniciante",
    days_per_week: user.days_per_week ?? 3,
    session_minutes: 60,
    equipment: user.equipment ?? "academia completa",
    notes: "",
  });
  // O resultado fica salvo na sessão: dá para trocar de aba e voltar sem perder
  const [result, setResult] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(RESULT_KEY));
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length), 2200);
    return () => clearInterval(id);
  }, [loading]);

  function storeResult(value) {
    setResult(value);
    try {
      if (value) sessionStorage.setItem(RESULT_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(RESULT_KEY);
    } catch {
      /* sem armazenamento */
    }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setLoading(true);
    setMessageIndex(0);
    try {
      const { data } = await api.post("/ai/suggest", { ...form, notes: form.notes.trim() || null });
      storeResult(data);
      // Aproveita para guardar as escolhas no perfil
      updateProfile({
        goal: form.goal,
        level: form.level,
        days_per_week: form.days_per_week,
        equipment: form.equipment,
      }).catch(() => {});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Uma requisição por ficha; Promise.all envia todas ao mesmo tempo
      await Promise.all(
        result.plans.map((plan) =>
          api.post("/plans", {
            name: plan.name.slice(0, 80),
            notes: plan.notes,
            exercises: plan.exercises.map((ex) => ({
              name: ex.name.slice(0, 80),
              sets: Math.min(Math.max(ex.sets, 1), 20),
              reps: String(ex.reps).slice(0, 20),
              rest_seconds: Math.min(Math.max(ex.rest_seconds, 0), 900),
              notes: ex.notes?.slice(0, 200) || null,
            })),
          }),
        ),
      );
      storeResult(null);
      toast.success(`${result.plans.length} fichas salvas!`);
      navigate("/fichas");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <>
        <PageHeader title="Seu plano" subtitle="Gerado pela Axii IA" />
        <div className="flex flex-col gap-4">
          <Card className="border-primary/40 bg-primary/10">
            <CardContent className="text-sm leading-relaxed">{result.summary}</CardContent>
          </Card>

          {result.plans.map((plan, i) => (
            <Card key={i} className="gap-3">
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                {plan.notes && <p className="text-sm text-muted-foreground">{plan.notes}</p>}
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y divide-border">
                  {plan.exercises.map((ex, j) => (
                    <li key={j} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{ex.name}</p>
                        {ex.notes && <p className="text-xs text-muted-foreground">{ex.notes}</p>}
                      </div>
                      <Badge variant="secondary" className="shrink-0 tabular-nums">
                        {ex.sets}×{ex.reps} · {ex.rest_seconds}s
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}

          {result.tips?.length > 0 && (
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="size-4 text-yellow-300" /> Dicas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
                  {result.tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <p className="px-1 text-xs text-muted-foreground">
            Sugestão gerada por IA. Ajuste as cargas ao seu limite e, se tiver lesões, consulte um profissional.
          </p>

          <SubmitButton type="button" loading={saving} onClick={handleSave} className="h-12 text-base">
            <Save /> Salvar como minhas fichas
          </SubmitButton>
          <Button variant="ghost" onClick={() => storeResult(null)}>
            <RotateCcw /> Gerar outro plano
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Axii IA" subtitle="Seu plano de treino montado por IA" />

      <form onSubmit={handleGenerate} className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label>Objetivo</Label>
          <ChoiceChips options={toOptions(GOALS)} value={form.goal} onChange={(goal) => setForm({ ...form, goal })} />
        </div>
        <div className="grid gap-2">
          <Label>Nível</Label>
          <ChoiceChips options={toOptions(LEVELS)} value={form.level} onChange={(level) => setForm({ ...form, level })} />
        </div>
        <div className="grid gap-2">
          <Label>Dias de treino por semana</Label>
          <ChoiceChips
            options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: n }))}
            value={form.days_per_week}
            onChange={(days_per_week) => setForm({ ...form, days_per_week })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Tempo por treino</Label>
          <ChoiceChips
            options={[30, 45, 60, 75, 90].map((n) => ({ value: n, label: `${n} min` }))}
            value={form.session_minutes}
            onChange={(session_minutes) => setForm({ ...form, session_minutes })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="equipment">Equipamentos disponíveis</Label>
          <Input
            id="equipment"
            value={form.equipment}
            onChange={(e) => setForm({ ...form, equipment: e.target.value })}
            maxLength={200}
            className="h-12"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="notes">Observações (opcional)</Label>
          <Textarea
            id="notes"
            placeholder="Ex.: dor no joelho, quero focar em glúteos, não gosto de esteira…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            maxLength={500}
            rows={3}
          />
        </div>

        <SubmitButton loading={loading} className="h-12 text-base glow-brand">
          {loading ? LOADING_MESSAGES[messageIndex] : (
            <>
              <Sparkles /> Gerar meu plano
            </>
          )}
        </SubmitButton>
        {loading && <p className="text-center text-xs text-muted-foreground">Isso pode levar uns 20 segundos.</p>}
      </form>
    </>
  );
}
