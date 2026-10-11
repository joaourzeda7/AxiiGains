import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

export function Logo({ className }) {
  return (
    <img
      src="/icon.svg"
      alt="AxiiGains"
      className={cn("rounded-[22%] shadow-lg shadow-primary/30", className)}
    />
  );
}

/** Título grande no topo da tela, com botão de voltar opcional e ação à direita. */
export function PageHeader({ title, subtitle, back, action }) {
  const navigate = useNavigate();
  return (
    <header className="pt-6 pb-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {back && (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(back))}
              className="-ml-1 mb-1 flex items-center text-sm text-brand-soft"
            >
              <ChevronLeft className="size-5" /> Voltar
            </button>
          )}
          <h1 className="title-rune truncate text-3xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="rule-fade mt-4" />
    </header>
  );
}

export function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      {Icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-brand-soft">
          <Icon className="size-7" />
        </div>
      )}
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-5 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

export function FullScreenLoader() {
  // Se demorar, provavelmente o servidor estava dormindo: explicamos em vez de deixar a pessoa no escuro
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8 text-center">
      <Logo className="size-20 animate-pulse" />
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className={cn("text-sm text-muted-foreground transition-opacity duration-500", slow ? "opacity-100" : "opacity-0")}>
        Despertando o servidor…
      </p>
    </div>
  );
}

/** Mostrado quando o servidor não respondeu nem depois de várias tentativas. */
export function ServerUnavailable() {
  const { retry } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <CloudOff className="size-10 text-brand-soft" />
      <div>
        <h1 className="title-rune text-xl font-bold">Servidor indisponível</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verifique sua internet. Se o app ficou um tempo sem uso, o servidor pode estar acordando.
        </p>
      </div>
      <Button onClick={retry} className="h-11 px-6">
        Tentar de novo
      </Button>
    </div>
  );
}

export function SubmitButton({ loading, children, ...props }) {
  return (
    <Button type="submit" size="lg" disabled={loading} {...props}>
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

/** Botões de escolha (ex.: dias por semana) — mais fácil de tocar que um select no celular. */
export function ChoiceChips({ options, value, onChange, className }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-10 min-w-10 rounded-xl border px-3 text-sm font-medium transition-colors",
            value === opt.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Título de seção (ex.: "Esta semana"), com um complemento opcional à direita. */
export function SectionTitle({ children, aside }) {
  return (
    <div className="mt-2 flex items-baseline justify-between">
      <h2 className="title-rune text-sm font-bold">{children}</h2>
      {aside && <span className="text-xs text-brand-soft">{aside}</span>}
    </div>
  );
}

/** Anel de progresso circular. value vai de 0 a 1. */
export function ProgressRing({ value, size = 48, stroke = 5, color = "var(--chart-1)", children }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, value || 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--accent)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums">{children}</div>
    </div>
  );
}
