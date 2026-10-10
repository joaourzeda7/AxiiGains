import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { LogOut, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChoiceChips, PageHeader, SubmitButton } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import { errorMessage } from "@/lib/api";
import { GOALS, LEVELS } from "@/lib/format";

const toOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));

// Já está rodando como app instalado? (iOS usa navigator.standalone)
const isInstalled =
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isOnboarding = params.get("novo") === "1";
  const [form, setForm] = useState({
    name: user.name,
    goal: user.goal,
    level: user.level,
    days_per_week: user.days_per_week,
    equipment: user.equipment ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      // Só envia os campos preenchidos
      const changes = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== null && v !== ""));
      await updateProfile(changes);
      toast.success("Perfil salvo!");
      if (isOnboarding) navigate("/ia");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={isOnboarding ? "Seu perfil" : "Perfil"}
        subtitle={isOnboarding ? "Conte um pouco sobre seu treino" : user.email}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="h-12" />
        </div>
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
          <Label htmlFor="equipment">Equipamentos disponíveis</Label>
          <Input
            id="equipment"
            placeholder="Ex.: academia completa, só halteres…"
            value={form.equipment}
            onChange={(e) => setForm({ ...form, equipment: e.target.value })}
            maxLength={200}
            className="h-12"
          />
        </div>
        <SubmitButton loading={saving} className="h-12 text-base">
          {isOnboarding ? "Continuar" : "Salvar perfil"}
        </SubmitButton>
      </form>

      {!isInstalled && (
        <Card className="mt-8 gap-3">
          <CardHeader>
            <CardTitle className="text-base">Instale o AxiiGains no celular</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {isIOS ? (
              <ol className="flex flex-col gap-2">
                <li className="flex items-center gap-2">
                  1. No Safari, toque em <Share className="size-4 text-foreground" /> Compartilhar
                </li>
                <li className="flex items-center gap-2">
                  2. Escolha <SquarePlus className="size-4 text-foreground" /> “Adicionar à Tela de Início”
                </li>
              </ol>
            ) : (
              <p>No Chrome, abra o menu ⋮ e toque em “Instalar app” ou “Adicionar à tela inicial”.</p>
            )}
          </CardContent>
        </Card>
      )}

      {!isOnboarding && (
        <Button variant="ghost" className="mt-6 w-full text-destructive" onClick={logout}>
          <LogOut /> Sair da conta
        </Button>
      )}
    </>
  );
}
