import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo, SubmitButton } from "@/components/common";
import { useAuth } from "@/context/AuthContext";
import api, { errorMessage } from "@/lib/api";

/** Login e cadastro na mesma tela: mode = "login" | "register" */
export default function AuthPage({ mode }) {
  const isRegister = mode === "register";
  const { login, register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", invite: "" });
  const [loading, setLoading] = useState(false);
  const [inviteRequired, setInviteRequired] = useState(false);

  // O servidor diz se o cadastro exige código de convite (variável REGISTRATION_CODE)
  useEffect(() => {
    if (!isRegister) return;
    api
      .get("/auth/register-info")
      .then(({ data }) => setInviteRequired(data.invite_required))
      .catch(() => {});
  }, [isRegister]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    // Não navegamos daqui: ao definir o usuário, o <PublicOnly> (App.jsx) redireciona
    try {
      if (isRegister) {
        await register(form.name, form.email, form.password, form.invite);
        toast.success("Conta criada! Vamos configurar seu perfil.");
      } else {
        await login(form.email, form.password);
      }
    } catch (err) {
      toast.error(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 pt-safe pb-safe">
      {/* brilho roxo de fundo */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(ellipse_at_top,rgba(123,92,255,0.35),transparent_70%)]" />

      <div className="mb-10 flex flex-col items-center text-center">
        <Logo className="mb-5 size-20" />
        <h1 className="title-rune text-3xl font-bold">AxiiGains</h1>
        <p className="mt-1 text-muted-foreground">
          {isRegister ? "Crie sua conta e comece a evoluir" : "Seu treino, sob controle"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isRegister && (
          <div className="grid gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={form.name} onChange={set("name")} autoComplete="name" required className="h-12" />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            required
            className="h-12"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 8 : undefined}
            maxLength={72}
            value={form.password}
            onChange={set("password")}
            required
            className="h-12"
          />
          {isRegister && <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>}
        </div>
        {isRegister && inviteRequired && (
          <div className="grid gap-2">
            <Label htmlFor="invite">Código de convite</Label>
            <Input
              id="invite"
              autoCapitalize="none"
              autoComplete="off"
              value={form.invite}
              onChange={set("invite")}
              required
              className="h-12"
            />
            <p className="text-xs text-muted-foreground">Peça o código para quem te convidou.</p>
          </div>
        )}

        <SubmitButton loading={loading} className="mt-2 h-12 text-base">
          {isRegister ? "Criar conta" : "Entrar"}
        </SubmitButton>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {isRegister ? "Já tem conta? " : "Ainda não tem conta? "}
        <Link to={isRegister ? "/login" : "/cadastro"} className="font-medium text-brand-soft">
          {isRegister ? "Entrar" : "Criar conta"}
        </Link>
      </p>
    </div>
  );
}
