import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
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

// Cada exercício ganha uma "key" local para o React não confundir os itens ao reordenar
let nextKey = 1;
const newExercise = (data = {}) => ({
  key: nextKey++,
  name: data.name ?? "",
  sets: String(data.sets ?? 3),
  reps: data.reps ?? "10",
  weight: data.weight != null ? String(data.weight).replace(".", ",") : "",
  rest_seconds: data.rest_seconds != null ? String(data.rest_seconds) : "60",
  notes: data.notes ?? "",
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

  const update = (key, field, value) =>
    setExercises((list) => list.map((ex) => (ex.key === key ? { ...ex, [field]: value } : ex)));

  const move = (index, delta) =>
    setExercises((list) => {
      const copy = [...list];
      [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]];
      return copy;
    });

  async function handleSave(e) {
    e.preventDefault();
    const filled = exercises.filter((ex) => ex.name.trim());
    const payload = {
      name: name.trim(),
      notes: notes.trim() || null,
      exercises: filled.map((ex) => ({
        name: ex.name.trim(),
        sets: Number(ex.sets) || 1,
        reps: ex.reps.trim() || "10",
        weight: parseNumber(ex.weight),
        rest_seconds: ex.rest_seconds === "" ? null : Number(ex.rest_seconds),
        notes: ex.notes.trim() || null,
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

        <h2 className="mt-2 text-lg font-semibold">Exercícios</h2>

        {exercises.map((ex, i) => (
          <Card key={ex.key} className="gap-3 py-4">
            <CardContent className="flex flex-col gap-3 px-4">
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-brand-soft">
                  {i + 1}
                </span>
                <Input
                  placeholder="Nome do exercício"
                  value={ex.name}
                  onChange={(e) => update(ex.key, "name", e.target.value)}
                  maxLength={80}
                  aria-label="Nome do exercício"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <Field label="Séries">
                  <Input
                    inputMode="numeric"
                    value={ex.sets}
                    onChange={(e) => update(ex.key, "sets", e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="Reps">
                  <Input value={ex.reps} onChange={(e) => update(ex.key, "reps", e.target.value)} maxLength={20} />
                </Field>
                <Field label="Carga (kg)">
                  <Input
                    inputMode="decimal"
                    placeholder="—"
                    value={ex.weight}
                    onChange={(e) => update(ex.key, "weight", e.target.value.replace(/[^\d.,]/g, ""))}
                  />
                </Field>
                <Field label="Desc. (s)">
                  <Input
                    inputMode="numeric"
                    value={ex.rest_seconds}
                    onChange={(e) => update(ex.key, "rest_seconds", e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
              </div>

              <Input
                placeholder="Observação (ex.: pegada fechada)"
                value={ex.notes}
                onChange={(e) => update(ex.key, "notes", e.target.value)}
                maxLength={200}
                className="text-sm"
              />

              <div className="flex justify-end gap-1">
                <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === exercises.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Descer"
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  onClick={() => setExercises((list) => list.filter((x) => x.key !== ex.key))}
                  aria-label="Remover exercício"
                >
                  <Trash2 />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button type="button" variant="outline" className="h-12 border-dashed" onClick={() => setExercises([...exercises, newExercise()])}>
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

function Field({ label, children }) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
