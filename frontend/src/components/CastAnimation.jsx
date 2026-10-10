import { useEffect } from "react";
import { Clock, Dumbbell, Layers, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatKg } from "@/lib/format";

// Contorno do olho (o mesmo do ícone do app)
const EYE = "M66 256 Q256 80 446 256 Q256 432 66 256 Z";
const SPARKS = 16;

/** Tela de "sinal conjurado" mostrada ao concluir um treino: o olho de bruxo desperta.
 *
 * A animação é só CSS (keyframes em index.css):
 *   0.0s  o contorno do olho se desenha (e um anel começa a girar)
 *   0.9s  a íris acende
 *   1.3s  a pupila se contrai até virar uma fenda, como nos olhos dos bruxos
 *   1.9s  explosão de luz e faíscas
 *   2.3s  o resumo do treino aparece
 *
 * O truque do "desenhar": pathLength="1" faz todo traço ter comprimento 1.
 * Com stroke-dasharray=1 e stroke-dashoffset=1 ele começa invisível; animar o
 * offset até 0 faz o traço "crescer" do início ao fim.
 */
export default function CastAnimation({ summary, onContinue }) {
  useEffect(() => {
    // vibra junto com a explosão (só no Android; o iPhone ignora)
    const id = setTimeout(() => navigator.vibrate?.([60, 40, 120]), 1900);
    return () => clearTimeout(id);
  }, []);

  const stats = [
    { icon: Clock, label: "Duração", value: formatDuration(summary.duration) },
    { icon: Layers, label: "Séries", value: summary.sets },
    { icon: Dumbbell, label: "Volume", value: formatKg(summary.volume) },
  ];

  return (
    <div
      className="cast-anim fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-background px-6 pt-safe pb-safe"
      role="dialog"
      aria-label="Treino concluído"
    >
      {/* brilho de fundo */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(123,92,255,0.35),transparent_60%)]" />

      <div className="relative size-64 shrink-0">
        {/* explosão de luz */}
        <div
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(233,225,255,0.7),rgba(123,92,255,0.35)_40%,transparent_70%)] blur-md opacity-0"
          style={{ animation: "cast-burst 0.9s ease-out 1.9s forwards" }}
        />

        {/* faíscas saindo do centro em todas as direções */}
        {Array.from({ length: SPARKS }, (_, i) => (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 -mt-1 -ml-1 size-2 rounded-full bg-white opacity-0 shadow-[0_0_8px_2px_rgba(185,164,255,0.9)]"
            style={{
              "--angle": `${(360 / SPARKS) * i}deg`,
              "--distance": `${110 + (i % 3) * 30}px`,
              animation: `cast-spark 0.9s ease-out ${1.9 + (i % 4) * 0.04}s forwards`,
            }}
          />
        ))}

        <svg viewBox="0 0 512 512" className="relative size-full overflow-visible">
          <defs>
            <radialGradient id="cast-iris" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#f1ebff" />
              <stop offset=".4" stopColor="#b9a4ff" />
              <stop offset="1" stopColor="#4b23c8" />
            </radialGradient>
          </defs>

          {/* anel tracejado que gira devagar */}
          <g style={{ transformOrigin: "256px 256px", animation: "cast-spin 14s linear infinite" }}>
            <circle
              cx="256"
              cy="256"
              r="196"
              fill="none"
              stroke="#b9a4ff"
              strokeWidth="2"
              strokeDasharray="6 14"
              opacity="0"
              style={{ animation: "cast-appear 0.6s ease-out 0.2s forwards" }}
            />
          </g>

          {/* contorno do olho */}
          <path
            d={EYE}
            fill="#120a26"
            fillOpacity="0.6"
            stroke="#ffffff"
            strokeWidth="12"
            strokeLinejoin="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset="1"
            style={{ animation: "cast-draw 1s ease-out forwards" }}
          />

          {/* íris com fibras; depois de acesa, pulsa */}
          <g opacity="0" style={{ animation: "cast-appear 0.4s ease-out 0.9s forwards" }}>
            <g style={{ animation: "cast-pulse 2.4s ease-in-out 1.9s infinite" }}>
              <circle cx="256" cy="256" r="96" fill="url(#cast-iris)" />
              <circle
                cx="256"
                cy="256"
                r="64"
                fill="none"
                stroke="#2a1466"
                strokeOpacity="0.45"
                strokeWidth="56"
                strokeDasharray="1.5 5"
              />
            </g>
          </g>

          {/* pupila: começa redonda e se contrai em fenda */}
          <g opacity="0" style={{ animation: "cast-appear 0.3s ease-out 1s forwards" }}>
            <ellipse
              cx="256"
              cy="256"
              rx="62"
              ry="84"
              fill="#07030f"
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: "cast-slit 0.7s cubic-bezier(.6,0,.3,1.3) 1.3s forwards",
              }}
            />
          </g>
          <ellipse
            cx="226"
            cy="218"
            rx="12"
            ry="8"
            fill="#ffffff"
            opacity="0"
            style={{ animation: "cast-appear 0.3s ease-out 1.7s forwards" }}
          />
        </svg>
      </div>

      {/* resumo */}
      <div className="relative mt-6 flex w-full max-w-sm flex-col items-center text-center">
        <p
          className="text-xs font-semibold tracking-[0.25em] text-brand-soft uppercase opacity-0"
          style={{ animation: "cast-fade-in 0.5s ease-out 2.3s forwards" }}
        >
          Sinal conjurado
        </p>
        <h1
          className="title-rune mt-1 text-3xl font-bold opacity-0"
          style={{ animation: "cast-fade-in 0.5s ease-out 2.4s forwards" }}
        >
          Treino concluído
        </h1>
        <p
          className="mt-1 text-sm text-muted-foreground opacity-0"
          style={{ animation: "cast-fade-in 0.5s ease-out 2.45s forwards" }}
        >
          {summary.planName}
        </p>

        <div
          className="mt-6 grid w-full grid-cols-3 gap-2 opacity-0"
          style={{ animation: "cast-fade-in 0.5s ease-out 2.6s forwards" }}
        >
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-3">
              <Icon className="mx-auto mb-1 size-4 text-brand-soft" />
              <p className="text-lg font-bold tabular-nums">{value}</p>
              <p className="text-[11px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {summary.records.length > 0 && (
          <div
            className="mt-3 w-full rounded-2xl border border-primary/40 bg-primary/10 p-4 text-left opacity-0"
            style={{ animation: "cast-fade-in 0.5s ease-out 2.75s forwards" }}
          >
            <p className="title-rune mb-2 flex items-center gap-2 text-sm font-bold">
              <Trophy className="size-4 text-amber-300" />
              {summary.records.length === 1 ? "Novo recorde" : `${summary.records.length} novos recordes`}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {summary.records.map((r) => (
                <li key={r.name} className="flex justify-between gap-3">
                  <span className="truncate text-muted-foreground">{r.name}</span>
                  <span className="shrink-0 font-semibold">{formatKg(r.weight)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          size="lg"
          className="mt-6 h-12 w-full text-base font-bold tracking-wider uppercase opacity-0"
          style={{ animation: "cast-fade-in 0.5s ease-out 2.9s forwards" }}
          onClick={onContinue}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}

function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}
