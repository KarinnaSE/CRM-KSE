import { cn } from "@/lib/utils";
import { STAGES, type StageKey } from "@/lib/utils";

/**
 * Badge de etapa del pipeline. Los colores salen de los tokens
 * --stage-1..5-{bg,text,border} (definidos en globals.css), mapeados por el
 * orden de STAGES: interesado(1) … perdido(5).
 */
const STAGE_INDEX: Record<StageKey, number> = STAGES.reduce(
  (acc, s, i) => ({ ...acc, [s.key]: i + 1 }),
  {} as Record<StageKey, number>,
);

const LABELS: Record<StageKey, string> = STAGES.reduce(
  (acc, s) => ({ ...acc, [s.key]: s.label }),
  {} as Record<StageKey, string>,
);

export function StageBadge({
  stage,
  className,
}: {
  stage: StageKey;
  className?: string;
}) {
  const n = STAGE_INDEX[stage];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold",
        className,
      )}
      style={{
        backgroundColor: `var(--stage-${n}-bg)`,
        color: `var(--stage-${n}-text)`,
        borderColor: `var(--stage-${n}-border)`,
      }}
    >
      {LABELS[stage]}
    </span>
  );
}
