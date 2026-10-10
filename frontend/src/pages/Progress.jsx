import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { CalendarDays, ChartLine, ChevronDown, Plus, Ruler, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, SubmitButton } from "@/components/common";
import api, { errorMessage } from "@/lib/api";
import { formatDate, formatKg, formatRelative, parseNumber, sessionVolume, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = ["historico", "exercicios", "corpo"];

export default function Progress() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get("aba")) ? params.get("aba") : "historico";

  return (
    <>
      <PageHeader title="Progresso" subtitle="Acompanhe sua evolução" />
      <Tabs value={tab} onValueChange={(value) => setParams({ aba: value }, { replace: true })}>
        <TabsList className="mb-4 grid h-11 w-full grid-cols-3">
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="exercicios">Exercícios</TabsTrigger>
          <TabsTrigger value="corpo">Corpo</TabsTrigger>
        </TabsList>
        <TabsContent value="historico">
          <History />
        </TabsContent>
        <TabsContent value="exercicios">
          <ExerciseProgress />
        </TabsContent>
        <TabsContent value="corpo">
          <Body />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ---------------- Histórico ----------------

function History() {
  const [sessions, setSessions] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    api.get("/sessions").then(({ data }) => setSessions(data)).catch(() => setSessions([]));
  }, []);

  async function handleDelete(id) {
    if (!window.confirm("Apagar este treino do histórico?")) return;
    try {
      await api.delete(`/sessions/${id}`);
      setSessions((list) => list.filter((s) => s.id !== id));
      toast.success("Treino apagado.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (sessions === null) return <ListSkeleton />;
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nenhum treino registrado"
        description="Comece um treino a partir de uma ficha e ele aparece aqui."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {sessions.map((s) => {
        const open = openId === s.id;
        const byExercise = groupSets(s.sets);
        return (
          <li key={s.id}>
            <Card className="gap-0 py-0">
              <button
                type="button"
                className="flex w-full items-center gap-3 p-4 text-left"
                onClick={() => setOpenId(open ? null : s.id)}
              >
                <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary leading-none">
                  <span className="text-lg font-bold">{s.date.slice(8, 10)}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {formatDate(s.date, { month: "short" })}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.plan_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatRelative(s.date)} · {s.sets.length} séries · {formatKg(sessionVolume(s))}
                  </p>
                </div>
                <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <CardContent className="flex flex-col gap-3 border-t border-border px-4 py-4">
                  {Object.entries(byExercise).map(([name, sets]) => (
                    <div key={name}>
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-sm text-muted-foreground">
                        {sets.map((x) => `${x.reps}×${formatKg(x.weight)}`).join(" · ")}
                      </p>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="self-start text-destructive" onClick={() => handleDelete(s.id)}>
                    <Trash2 /> Apagar treino
                  </Button>
                </CardContent>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function groupSets(sets) {
  const groups = {};
  for (const s of sets) (groups[s.exercise_name] ??= []).push(s);
  return groups;
}

// ---------------- Evolução por exercício ----------------

const exerciseChartConfig = {
  max_weight: { label: "Carga máx.", color: "var(--chart-1)" },
  best_1rm: { label: "1RM estimada", color: "var(--chart-2)" },
};

function ExerciseProgress() {
  const [names, setNames] = useState(null);
  const [selected, setSelected] = useState("");
  const [points, setPoints] = useState(null);

  useEffect(() => {
    api
      .get("/progress/exercises")
      .then(({ data }) => {
        setNames(data);
        if (data.length) setSelected(data[0]);
      })
      .catch(() => setNames([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setPoints(null);
    api
      .get("/progress/exercise", { params: { name: selected } })
      .then(({ data }) => setPoints(data))
      .catch(() => setPoints([]));
  }, [selected]);

  if (names === null) return <ListSkeleton />;
  if (names.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Sem dados ainda"
        description="Depois do primeiro treino registrado, a evolução de cada exercício aparece aqui."
      />
    );
  }

  const first = points?.[0];
  const last = points?.at(-1);
  const best = points?.reduce((max, p) => Math.max(max, p.max_weight), 0);

  return (
    <div className="flex flex-col gap-4">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-12 w-full">
          <SelectValue placeholder="Escolha um exercício" />
        </SelectTrigger>
        <SelectContent>
          {names.map((n) => (
            <SelectItem key={n} value={n}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {points === null ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Recorde" value={formatKg(best)} />
            <MiniStat label="Último" value={formatKg(last?.max_weight)} />
            <MiniStat
              label="Evolução"
              value={first && last ? `${last.max_weight - first.max_weight >= 0 ? "+" : ""}${formatKg(last.max_weight - first.max_weight)}` : "—"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Carga por treino</CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              {points.length < 2 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Registre esse exercício em pelo menos 2 dias para ver o gráfico.
                </p>
              ) : (
                <ChartContainer config={exerciseChartConfig} className="aspect-[4/3] w-full">
                  <LineChart data={points} margin={{ left: 0, right: 12, top: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(d) => formatDate(d)} minTickGap={24} />
                    <YAxis width={36} tickLine={false} axisLine={false} domain={["dataMin - 5", "dataMax + 5"]} />
                    <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => formatDate(p?.[0]?.payload?.date)} />} />
                    <Line dataKey="max_weight" type="monotone" stroke="var(--color-max_weight)" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line dataKey="best_1rm" type="monotone" stroke="var(--color-best_1rm)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
          <p className="px-1 text-xs text-muted-foreground">
            1RM estimada = carga máxima teórica para 1 repetição (fórmula de Epley). Serve para comparar treinos com repetições diferentes.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------- Medidas corporais ----------------

const MEASURES = [
  { key: "weight", label: "Peso", unit: "kg" },
  { key: "body_fat", label: "Gordura", unit: "%" },
  { key: "chest", label: "Peito", unit: "cm" },
  { key: "waist", label: "Cintura", unit: "cm" },
  { key: "hips", label: "Quadril", unit: "cm" },
  { key: "arm", label: "Braço", unit: "cm" },
  { key: "thigh", label: "Coxa", unit: "cm" },
];

function Body() {
  const [items, setItems] = useState(null);
  const [metric, setMetric] = useState("weight");
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api.get("/measurements").then(({ data }) => setItems(data)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function handleDelete(id) {
    if (!window.confirm("Apagar este registro?")) return;
    try {
      await api.delete(`/measurements/${id}`);
      setItems((list) => list.filter((m) => m.id !== id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (items === null) return <ListSkeleton />;

  const measure = MEASURES.find((m) => m.key === metric);
  const series = items.filter((m) => m[metric] != null);
  const available = MEASURES.filter((m) => items.some((i) => i[m.key] != null));

  return (
    <div className="flex flex-col gap-4">
      <Button className="h-12" onClick={() => setOpen(true)}>
        <Plus /> Registrar medidas
      </Button>

      {items.length === 0 ? (
        <EmptyState icon={Ruler} title="Nenhuma medida registrada" description="Registre seu peso e medidas para acompanhar a evolução do corpo." />
      ) : (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {available.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-4 text-sm",
                  metric === m.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ChartLine className="size-4 text-brand-soft" /> {measure.label} ({measure.unit})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              {series.length < 2 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">Registre pelo menos 2 vezes para ver o gráfico.</p>
              ) : (
                <ChartContainer config={{ [metric]: { label: measure.label, color: "var(--chart-1)" } }} className="aspect-[4/3] w-full">
                  <LineChart data={series} margin={{ left: 0, right: 12, top: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(d) => formatDate(d)} minTickGap={24} />
                    <YAxis width={36} tickLine={false} axisLine={false} domain={["dataMin - 2", "dataMax + 2"]} />
                    <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => formatDate(p?.[0]?.payload?.date)} />} />
                    <Line dataKey={metric} type="monotone" stroke={`var(--color-${metric})`} strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            {[...items].reverse().map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{formatDate(m.date, { day: "2-digit", month: "short", year: "numeric" })}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {MEASURES.filter((x) => m[x.key] != null)
                      .map((x) => `${x.label} ${String(m[x.key]).replace(".", ",")}${x.unit}`)
                      .join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(m.id)} aria-label="Apagar">
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <MeasurementDrawer open={open} onOpenChange={setOpen} onSaved={load} />
    </div>
  );
}

function MeasurementDrawer({ open, onOpenChange, onSaved }) {
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = { date };
    for (const m of MEASURES) payload[m.key] = parseNumber(values[m.key]);
    setSaving(true);
    try {
      await api.post("/measurements", payload);
      toast.success("Medidas registradas!");
      setValues({});
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent>
        <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-lg flex-col overflow-y-auto">
          <DrawerHeader>
            <DrawerTitle>Registrar medidas</DrawerTitle>
            <DrawerDescription>Preencha só o que você mediu.</DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-3 px-4">
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="m-date">Data</Label>
              <Input id="m-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required />
            </div>
            {MEASURES.map((m) => (
              <div key={m.key} className="grid gap-1.5">
                <Label htmlFor={`m-${m.key}`}>
                  {m.label} <span className="text-muted-foreground">({m.unit})</span>
                </Label>
                <Input
                  id={`m-${m.key}`}
                  inputMode="decimal"
                  value={values[m.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [m.key]: e.target.value.replace(/[^\d.,]/g, "") })}
                />
              </div>
            ))}
          </div>
          <DrawerFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SubmitButton loading={saving} className="h-12">
              Salvar
            </SubmitButton>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

// ---------------- Auxiliares ----------------

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate font-semibold">{value}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 rounded-2xl" />
      ))}
    </div>
  );
}
