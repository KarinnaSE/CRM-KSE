"use client";

import type { Doc } from "@/convex/_generated/dataModel";
import type { StageKey } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StageBadge } from "@/components/ui/StageBadge";
import { formatMxDate } from "./format";

export type ClientData = Doc<"clients"> & { registeredByName: string };

/**
 * Tarjeta lateral de la Ficha (KAR-17): datos de contacto, etapa (clic para cambiar),
 * metadata de registro y las 3 acciones. Reutiliza Avatar/StageBadge/Button.
 */
export function ClientCard({
  client,
  onChangeStage,
  onAddNota,
  onAddSeguimiento,
  onAddVenta,
}: {
  client: ClientData;
  onChangeStage: () => void;
  onAddNota: () => void;
  onAddSeguimiento: () => void;
  onAddVenta: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Hero */}
      <div className="border-b border-border px-5 py-6 text-center">
        <div className="flex justify-center">
          <Avatar name={client.name} size="xl" />
        </div>
        <h2 className="mt-3.5 text-xl font-bold leading-tight text-text-primary">
          {client.name}
        </h2>
        {client.company && (
          <div className="mt-1 text-sm text-text-secondary">{client.company}</div>
        )}
        <button
          type="button"
          onClick={onChangeStage}
          aria-label="Cambiar etapa"
          className="mt-3.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-2"
        >
          <StageBadge stage={client.stage as StageKey} />
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Contacto */}
      {(client.phone || client.email) && (
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
          {client.phone && (
            <ContactRow label="Teléfono" value={client.phone}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </ContactRow>
          )}
          {client.email && (
            <ContactRow label="Correo" value={client.email}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <path d="m22 6-10 7L2 6" />
              </svg>
            </ContactRow>
          )}
        </div>
      )}

      {/* Metadata de registro */}
      <div className="flex items-center gap-1.5 border-b border-border px-5 py-3">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="text-xs text-text-tertiary">
          Registrado por{" "}
          <strong className="font-semibold text-text-secondary">
            {client.registeredByName}
          </strong>{" "}
          · {formatMxDate(client.registeredAt)}
        </span>
      </div>

      {/* Acciones */}
      <div className="flex flex-col gap-2 px-5 py-4">
        <Button variant="secondary" className="w-full justify-center" onClick={onAddNota}>
          <PencilIcon /> Agregar nota
        </Button>
        <Button variant="secondary" className="w-full justify-center" onClick={onAddSeguimiento}>
          <CalendarIcon /> Programar seguimiento
        </Button>
        <Button variant="secondary" className="w-full justify-center" onClick={onAddVenta}>
          <DollarIcon /> Registrar venta
        </Button>
      </div>
    </div>
  );
}

function ContactRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2">
        {children}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-text-tertiary">{label}</div>
        <div className="truncate text-sm font-medium text-text-primary">{value}</div>
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
