"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { StageKey } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { StageBadge } from "@/components/ui/StageBadge";

/** Forma del ítem que devuelve `seguimientos.pendientes` (§4 del plan). */
export type Seguimiento = {
  id: string;
  clientId: string;
  clientName: string;
  company: string;
  stage: StageKey;
  reason: string;
  assignee: string;
  dueDate: number;
};

// Formateadores CDMX creados UNA vez a nivel de módulo (no por fila): en listas de
// hasta ~150 filas evita recrear Intl.DateTimeFormat en cada render.
const MX_TZ = "America/Mexico_City";
const LATE_FMT = new Intl.DateTimeFormat("es-MX", {
  timeZone: MX_TZ,
  day: "numeric",
  month: "short",
});
const UPCOMING_FMT = new Intl.DateTimeFormat("es-MX", {
  timeZone: MX_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Etiqueta de fecha según la sección: "Hoy", "Atrasado · 14 jul" o "mié 22 jul". */
function dueLabel(variant: "late" | "today" | "upcoming", dueDate: number): string {
  if (variant === "today") return "Hoy";
  if (variant === "late") return `Atrasado · ${LATE_FMT.format(dueDate)}`;
  return UPCOMING_FMT.format(dueDate);
}

/**
 * Fila de un seguimiento. Al tocarla navega a la Ficha del cliente
 * (/clientes/[id]); el botón "Hecho" cierra el seguimiento sin navegar.
 * `onComplete` devuelve una promesa: durante ella el botón se deshabilita
 * (anti doble-click) y solo si resuelve bien se anima la salida.
 */
export function SeguimientoItem({
  item,
  variant,
  onComplete,
}: {
  item: Seguimiento;
  variant: "late" | "today" | "upcoming";
  onComplete: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const late = variant === "late";

  async function handleDone(e: React.MouseEvent) {
    e.stopPropagation(); // no navegar a la Ficha
    if (pending) return;
    setPending(true);
    try {
      await onComplete(item.id);
      setLeaving(true); // anima la salida solo tras confirmación del servidor
    } catch {
      setPending(false); // rehabilita; el toast lo muestra la pantalla
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/clientes/${item.clientId}`)}
      onKeyDown={(e) => {
        // Un role="button" debe activarse con Enter y Space (Space además
        // evita el scroll de página con preventDefault).
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/clientes/${item.clientId}`);
        }
      }}
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg border p-3 shadow-sm transition",
        late
          ? "border-error-200 bg-error-50"
          : "border-border bg-surface hover:bg-surface-2",
        leaving && "pointer-events-none translate-x-6 opacity-0",
      )}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: late ? "var(--error-500)" : "var(--brand-400)",
      }}
    >
      <Avatar name={item.clientName} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-text-primary">
            {item.clientName}
          </span>
          <StageBadge stage={item.stage} />
        </div>

        {item.company && (
          <p className={cn("text-sm", late ? "text-error-600" : "text-text-secondary")}>
            {item.company}
          </p>
        )}

        <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
          {item.reason}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
          <span
            className={cn(
              "flex items-center gap-1",
              late && "font-medium text-error-600",
            )}
          >
            <CalendarIcon />
            {dueLabel(variant, item.dueDate)}
          </span>
          <span className="flex items-center gap-1">
            <UserIcon />
            {item.assignee}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleDone}
        disabled={pending}
        aria-label="Marcar como hecho"
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 self-start rounded-full border px-3 text-xs font-semibold",
          "border-success-200 bg-success-50 text-success-700 hover:bg-success-100",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <CheckIcon />
        Hecho
      </button>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
