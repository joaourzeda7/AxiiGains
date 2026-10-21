import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Link2, Loader2, Plus, Trash2, Unlink2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, SubmitButton } from "@/components/common";
import api, { errorMessage } from "@/lib/api";
import { parseNumber } from "@/lib/format";
import { groupLabelsByIndex } from "@/lib/supersets";
import { cn } from "@/lib/utils";

const MAX_SETS = 20;

// Cada exercício e cada série ganham uma "key" local para o React não confundir os itens
// ao reordenar ou remover (o índice muda; a key, não)
let nextKey = 1;
const newSet = (data = {}) => ({
  key: nextKey++,
  reps: data.reps ?? "10",
  weight: data.weight != null ? String(data.weight).replace(".", ",") : "",
});
const newExercise = (data = {}) => ({
  key: nextKey++,
  name: data.name ?? "",
  rest_seconds: data.rest_seconds != null ? String(data.rest_seconds) : "60",
  notes: data.notes ?? "",
  linked_to_next: data.linked_to_next ?? false,
  sets: data.sets?.length ? data.sets.map(newSet) : [newSet(), newSet(), newSet()],
});

export default function PlanEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState(() => (isNew ? [newExercise()] : []));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api
      .get(`/plans/${id}`)
      .then(({ data }) => {
        setName(data.name);
        setNotes(data.notes ?? "");
        setExercises(data.exercises.map(newExercise));
      })
      .catch((err) => {
        toast.error(errorMessage(err));
        navigate("/fichas", { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id, isNew, navigate]);

  /** Aplica `change(exercício)` só no exercício com essa key. */
  const updateExercise = (key, change) =>
    setExercises((list) => list.map((ex) => (ex.key === key ? { ...ex, ...change(ex) } : ex)));

  const move = (index, delta) =>
    setExercises((list) => {
      const copy = [...list];
      [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]];
      return copy;
    });

  async function handleSave(e) {
    e.preventDefault();
    const filled = exercises.filter((ex) => ex.name.trim());
    // o último exercício não emenda em nada (o backend também garante isso)
    if (filled.length) filled[filled.length - 1] = { ...filled.at(-1), linked_to_next: false };
    const payload = {
      name: name.trim(),
      notes: notes.trim() || null,
      exercises: filled.map((ex) => ({
        name: ex.name.trim(),
        rest_seconds: ex.rest_seconds === "" ? null : Number(ex.rest_seconds),
        notes: ex.notes.trim() || null,
        linked_to_next: ex.linked_to_next,
        sets: ex.sets.map((s) => ({ reps: s.reps.trim() || "10", weight: parseNumber(s.weight) })),
      })),
    };
    setSaving(true);
    try {
      if (isNew) await api.post("/plans", payload);
      else await api.put(`/plans/${id}`, payload);
      toast.success("Ficha salva!");
      navigate("/fichas");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/plans/${id}`);
      toast.success("Ficha apagada. O histórico de treinos foi mantido.");
      navigate("/fichas", { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const groupLabels = groupLabelsByIndex(exercises);

  if (loading) {
    return (
      <div className="flex justify-center pt-24">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave}>
      <PageHeader title={isNew ? "Nova ficha" : "Editar ficha"} back="/fichas" />

      <div className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="plan-name">Nome da ficha</Label>
          <Input
            id="plan-name"
            placeholder="Ex.: Treino A — Peito e tríceps"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            className="h-12"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="plan-notes">Observações (opcional)</Label>
          <Textarea id="plan-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <h2 className="title-rune mt-2 text-lg font-bold">Exercícios</h2>

        {exercises.map((ex, i) => (
          <div key={ex.key} className="flex flex-col">
            <ExerciseCard
              index={i}
              exercise={ex}
              groupLabel={groupLabels[i]}
              isFirst={i === 0}
              isLast={i === exercises.length - 1}
              onChange={(change) => updateExercise(ex.key, change)}
              onMove={(delta) => move(i, delta)}
              onRemove={() => setExercises((list) => list.filter((x) => x.key !== ex.key))}
            />
            {i < exercises.length - 1 && (
              <LinkToggle
                linked={ex.linked_to_next}
                label={groupLabels[i]}
                onToggle={() => updateExercise(ex.key, (e) => ({ linked_to_next: !e.linked_to_next }))}
              />
            )}
          </div>
        ))}

        <Button type="button" variant="outline" className="h-12 border-dashed" onClick={() => setExercises((list) => [...list, newExercise()])}>
          <Plus /> Adicionar exercício
        </Button>

        <SubmitButton loading={saving} className="mt-2 h-12 text-base">
          Salvar ficha
        </SubmitButton>

        {!isNew && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="text-destructive">
                <Trash2 /> Apagar ficha
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar esta ficha?</AlertDialogTitle>
                <AlertDialogDescription>
                  A ficha será removida, mas os treinos que você já registrou continuam no histórico.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDelete}>
                  Apagar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </form>
  );
}

function ExerciseCard({ index, exercise: ex, groupLabel, isFirst, isLast, onChange, onMove, onRemove }) {
  const setField = (field, value) => onChange(() => ({ [field]: value }));
  const updateSet = (key, field, value) =>
    onChange((e) => ({ sets: e.sets.map((s) => (s.key === key ? { ...s, [field]: value } : s)) }));
  // Nova série copia a anterior: quem faz todas iguais só aperta o botão
  const addSet = () =>
    onChange((e) => ({ sets: [...e.sets, newSet({ ...e.sets.at(-1), weight: parseNumber(e.sets.at(-1)?.weight) })] }));
  const removeSet = (key) => onChange((e) => ({ sets: e.sets.filter((s) => s.key !== key) }));

  return (
    <Card className={cn("gap-3 py-4", groupLabel && "border-primary/45")}>
      <CardContent className="flex flex-col gap-3 px-4">
        {groupLabel && (
          <span className="-mb-1 self-start rounded-full bg-primary/20 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-brand-soft uppercase">
            {groupLabel}
          </span>
        )}
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-brand-soft">
            {index + 1}
          </span>
          <Input
            placeholder="Nome do exercício"
            value={ex.name}
            onChange={(e) => setField("name", e.target.value)}
            maxLength={80}
            aria-label="Nome do exercício"
          />
        </div>

        {/* Tabela de séries: cada uma com suas reps e carga */}
        <div className="grid grid-cols-[2rem_1fr_1fr_2.25rem] items-center gap-x-2 gap-y-1.5">
          <span className="text-center text-[10px] tracking-wider text-muted-foreground uppercase">Série</span>
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">Carga (kg)</span>
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">Reps</span>
          <span />
          {ex.sets.map((s, j) => (
            <SetRow
              key={s.key}
              number={j + 1}
              set={s}
              canRemove={ex.sets.length > 1}
              onChange={(field, value) => updateSet(s.key, field, value)}
              onRemove={() => removeSet(s.key)}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-brand-soft"
          disabled={ex.sets.length >= MAX_SETS}
          onClick={addSet}
        >
          <Plus /> Série
        </Button>

        <div className="grid grid-cols-[6rem_1fr] gap-2">
          {ex.linked_to_next ? (
            // emenda no próximo: o descanso que vale é o do último exercício do bloco
            <div className="grid gap-1">
              <span className="text-[11px] text-muted-foreground">Descanso</span>
              <span className="flex h-9 items-center text-sm text-brand-soft">nenhum</span>
            </div>
          ) : (
            <label className="grid gap-1">
              <span className="text-[11px] text-muted-foreground">Descanso (s)</span>
              <Input
                inputMode="numeric"
                value={ex.rest_seconds}
                onChange={(e) => setField("rest_seconds", e.target.value.replace(/\D/g, ""))}
              />
            </label>
          )}
          <label className="grid gap-1">
            <span className="text-[11px] text-muted-foreground">Observação</span>
            <Input
              placeholder="Ex.: pegada fechada"
              value={ex.notes}
              onChange={(e) => setField("notes", e.target.value)}
              maxLength={200}
              className="text-sm"
            />
          </label>
        </div>

        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" size="icon-sm" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Subir">
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={isLast} onClick={() => onMove(1)} aria-label="Descer">
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" onClick={onRemove} aria-label="Remover exercício">
            <Trash2 />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SetRow({ number, set, canRemove, onChange, onRemove }) {
  return (
    <>
      <span className="flex size-7 items-center justify-center justify-self-center rounded-full bg-secondary text-xs font-semibold">
        {number}
      </span>
      <Input
        inputMode="decimal"
        placeholder="—"
        value={set.weight}
        onChange={(e) => onChange("weight", e.target.value.replace(/[^\d.,]/g, ""))}
        className="h-10"
        aria-label={`Carga da série ${number}`}
      />
      <Input
        value={set.reps}
        onChange={(e) => onChange("reps", e.target.value)}
        maxLength={20}
        className="h-10"
        aria-label={`Repetições da série ${number}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!canRemove}
        onClick={onRemove}
        aria-label={`Remover série ${number}`}
        className="text-muted-foreground"
      >
        <X />
      </Button>
    </>
  );
}

/** Botão entre dois exercícios: liga/desliga o bi-set (emendar no próximo sem descanso). */
function LinkToggle({ linked, label, onToggle }) {
  return (
    <div className="relative flex h-12 items-center justify-center">
      {/* linha que "costura" os dois cards quando estão ligados */}
      <span className={cn("absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2", linked ? "bg-primary/60" : "bg-transparent")} />
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={linked}
        className={cn(
          "relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          linked ? "border-primary bg-[#1d1440] text-brand-soft" : "border-dashed border-border bg-background text-muted-foreground",
        )}
      >
        {linked ? <Link2 className="size-3.5" /> : <Unlink2 className="size-3.5" />}
        {linked ? `${label} · sem descanso entre eles` : "Juntar com o próximo (bi-set)"}
      </button>
    </div>
  );
}
