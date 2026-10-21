import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Camera, ChevronRight, Loader2, LogOut, Share, ShieldCheck, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, ChoiceChips, PageHeader, SubmitButton } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import api, { errorMessage } from "@/lib/api";
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

      <AvatarPicker />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="h-12" />
        </div>
        <div className="grid gap-2">
          <Label>Objetivo</Label>
          <ChoiceChips options={toOptions(GOALS)} value={form.goal} onChange={(goal) => setForm((f) => ({ ...f, goal }))} />
        </div>
        <div className="grid gap-2">
          <Label>Nível</Label>
          <ChoiceChips options={toOptions(LEVELS)} value={form.level} onChange={(level) => setForm((f) => ({ ...f, level }))} />
        </div>
        <div className="grid gap-2">
          <Label>Dias de treino por semana</Label>
          <ChoiceChips
            options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: n }))}
            value={form.days_per_week}
            onChange={(days_per_week) => setForm((f) => ({ ...f, days_per_week }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="equipment">Equipamentos disponíveis</Label>
          <Input
            id="equipment"
            placeholder="Ex.: academia completa, só halteres…"
            value={form.equipment}
            onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}
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

      {user.is_admin && !isOnboarding && (
        <Link to="/admin" className="mt-6 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <ShieldCheck className="size-5 text-brand-soft" />
          <span className="flex-1 font-medium">Painel do admin</span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </Link>
      )}

      {!isOnboarding && (
        <Button variant="ghost" className="mt-6 w-full text-destructive" onClick={logout}>
          <LogOut /> Sair da conta
        </Button>
      )}
    </>
  );
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Foto de perfil com botão de câmera para trocar e opção de remover. */
function AvatarPicker() {
  const { user, setUser } = useAuth();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher a mesma foto de novo depois
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Foto grande demais (máximo 8 MB).");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.put("/auth/me/avatar", form);
      setUser(data);
      toast.success("Foto atualizada!");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      const { data } = await api.delete("/auth/me/avatar");
      setUser(data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="relative shrink-0"
        aria-label="Trocar foto de perfil"
      >
        <Avatar user={user} className="size-20 text-3xl" />
        <span className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </span>
      </button>
      <div className="min-w-0">
        <p className="truncate font-semibold">{user.name}</p>
        <div className="mt-1 flex gap-3 text-sm">
          <button type="button" className="text-brand-soft" onClick={() => inputRef.current?.click()} disabled={busy}>
            {user.avatar_url ? "Trocar foto" : "Adicionar foto"}
          </button>
          {user.avatar_url && (
            <button type="button" className="text-muted-foreground" onClick={handleRemove} disabled={busy}>
              Remover
            </button>
          )}
        </div>
      </div>
      {/* No iPhone, aceitar só JPG/PNG/WebP faz o próprio Safari converter as fotos HEIC */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
