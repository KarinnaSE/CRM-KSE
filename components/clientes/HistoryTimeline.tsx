"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { formatMxDate, formatMxn } from "./format";

type Historial = FunctionReturnType<typeof api.clients.historial>;
export type TimelineItem = Historial["items"][number];

const CHANNEL_LABELS = {
  whatsapp: "WhatsApp",
  email: "Email",
  llamada: "Llamada",
} as const;

const PRODUCT_LABELS = {
  formacion: "Formación",
  consultoria: "Consultoría",
  plantilla: "Plantilla",
  otro: "Otro",
} as const;

/**
 * Panel principal de la Ficha (KAR-17): historial unificado de notas + seguimientos + ventas,
 * más reciente primero. Cabecera con contador, estado vacío con CTA, y aviso "hay más" cuando
 * el historial supera la cota del backend.
 */
export function HistoryTimeline({
  items,
  hasMore,
  loading,
  onAddNota,
}: {
  items: TimelineItem[];
  hasMore: boolean;
  loading: boolean;
  onAddNota: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-text-tertiary">
          Historial de interacciones
        </span>
        {!loading && (
          <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold text-text-secondary">
            {items.length}
          </span>
        )}
      </div>

      {loading ? (
        <TimelineSkeleton />
      ) : items.length === 0 ? (
        <EmptyHistory onAddNota={onAddNota} />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <HistoryRow key={`${item.kind}-${item.id}`} item={item} />
          ))}
          {hasMore && (
            <p className="mt-1 text-xs text-text-tertiary">
              Hay más actividad de la mostrada.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ item }: { item: TimelineItem }) {
  let text: string;
  let label: string;
  if (item.kind === "nota") {
    text = item.text;
    label = CHANNEL_LABELS[item.channel];
  } else if (item.kind === "seguimiento") {
    text = item.reason;
    label = item.done ? "Seguimiento (hecho)" : "Seguimiento programado";
  } else {
    text = `Venta registrada — ${PRODUCT_LABELS[item.productType]} · ${formatMxn(item.amount)}`;
    label = "Venta";
  }

  return (
    <div className="flex gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-sm">
      <KindIcon item={item} />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm leading-relaxed text-text-primary">{text}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
          <span>{label}</span>
          <span className="opacity-50">·</span>
          <span>{formatMxDate(item.occurredAt)}</span>
          <span className="opacity-50">·</span>
          <span className="font-semibold text-text-secondary">{item.author}</span>
        </div>
      </div>
    </div>
  );
}

/** Círculo con icono según el tipo/canal del evento. */
function KindIcon({ item }: { item: TimelineItem }) {
  let bg: string;
  let stroke: string;
  let path: React.ReactNode;

  if (item.kind === "nota" && item.channel === "whatsapp") {
    bg = "oklch(0.95 0.06 145)";
    stroke = "oklch(0.40 0.17 145)";
    path = <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
  } else if (item.kind === "nota" && item.channel === "email") {
    bg = "var(--info-50)";
    stroke = "var(--info-600)";
    path = (
      <>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <path d="m22 6-10 7L2 6" />
      </>
    );
  } else if (item.kind === "nota") {
    bg = "oklch(0.96 0.04 290)";
    stroke = "oklch(0.45 0.16 290)";
    path = (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    );
  } else if (item.kind === "venta") {
    bg = "var(--success-50)";
    stroke = "var(--success-600)";
    path = <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />;
  } else {
    bg = "var(--brand-50)";
    stroke = "var(--brand-700)";
    path = (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    );
  }

  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: bg }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
        stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {path}
      </svg>
    </span>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}

function EmptyHistory({ onAddNota }: { onAddNota: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-12 text-center">
      <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </span>
      <div className="text-lg font-bold text-text-primary">Sin interacciones</div>
      <p className="max-w-xs text-sm text-text-secondary">
        Usa &laquo;Agregar nota&raquo; para registrar el primer contacto con este cliente.
      </p>
      <div className="mt-2">
        <Button variant="secondary" size="sm" onClick={onAddNota}>
          Agregar nota
        </Button>
      </div>
    </div>
  );
}
