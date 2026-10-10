import { useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <header className="flex items-end justify-between gap-3 pt-6 pb-5">
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
        <h1 className="truncate text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
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
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6">
      <Logo className="size-20 animate-pulse" />
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
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
