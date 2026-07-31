"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { backendMessage } from "@/lib/errores";
import { cn, STAGES, type StageKey } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/clientes/Modal";
import { ClientCard } from "@/components/clientes/ClientCard";
import { HistoryTimeline } from "@/components/clientes/HistoryTimeline";
import { mxDateInputValue } from "@/components/clientes/format";

/**
 * Ficha del cliente (KAR-17) — pantalla central del CRM. Reúne la tarjeta del cliente
 * (con etapa cambiable, KAR-16) y el historial en dos listas: interacciones (notas KAR-15 +
 * seguimientos KAR-18) y ventas (KAR-23, lista independiente), con 4 modales de acción. El chrome
 * global (header/nav/perfil) lo da AppShell;
 * aquí solo va el contenido. Los datos vienen de `clients.get` / `clients.historial`; las
 * escrituras sellan el usuario en el backend.
 */

type ModalKind = "stage" | "nota" | "seguimiento" | "venta" | null;

const labelClass = "text-sm font-medium text-text-primary";
const fieldClass =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary outline-none placeholder:text-text-tertiary focus:border-interactive focus:ring-2 focus:ring-focus-ring disabled:opacity-60";
const textareaClass =
  "min-h-[88px] w-full resize-y rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text-primary outline-none placeholder:text-text-tertiary focus:border-interactive focus:ring-2 focus:ring-focus-ring disabled:opacity-60";

export function FichaClient({ clientId }: { clientId: string }) {
  const client = useQuery(api.clients.get, { id: clientId });
  const historial = useQuery(api.clients.historial, { clientId });

  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }
  const close = () => setModal(null);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24 pt-5">
      <Link
        href="/clientes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Clientes
      </Link>

      {client === undefined ? (
        <Skeleton />
      ) : client === null ? (
        <NotFound />
      ) : (
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-7">
          <div className="w-full md:sticky md:top-20 md:w-[280px] md:shrink-0">
            <ClientCard
              client={client}
              onChangeStage={() => setModal("stage")}
              onAddNota={() => setModal("nota")}
              onAddSeguimiento={() => setModal("seguimiento")}
              onAddVenta={() => setModal("venta")}
            />
          </div>
          <div className="min-w-0 flex-1">
            <HistoryTimeline
              interacciones={historial?.interacciones ?? []}
              ventas={historial?.ventas ?? []}
              ventasTotal={historial?.ventasTotal ?? 0}
              hasMore={historial?.hasMore ?? { interacciones: false, ventas: false }}
              loading={historial === undefined}
              onAddNota={() => setModal("nota")}
            />
          </div>
        </div>
      )}

      {client && modal === "stage" && (
        <StageModal
          clientId={clientId}
          current={client.stage as StageKey}
          onClose={close}
          showToast={showToast}
        />
      )}
      {client && modal === "nota" && (
        <NotaModal clientId={clientId} onClose={close} showToast={showToast} />
      )}
      {client && modal === "seguimiento" && (
        <SeguimientoModal clientId={clientId} onClose={close} showToast={showToast} />
      )}
      {client && modal === "venta" && (
        <VentaModal clientId={clientId} onClose={close} showToast={showToast} />
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-[60] mx-auto w-fit rounded-full bg-text-primary px-4 py-2 text-sm text-surface shadow-lg"
        >
          {toast}
        </div>
      )}
    </section>
  );
}

/* ───────────── Modal: Cambiar etapa (KAR-16) ───────────── */

function StageModal({
  clientId,
  current,
  onClose,
  showToast,
}: {
  clientId: string;
  current: StageKey;
  onClose: () => void;
  showToast: (m: string) => void;
}) {
  const updateStage = useMutation(api.clients.updateStage);
  const [saving, setSaving] = useState(false);

  async function pick(stage: StageKey) {
    if (saving) return;
    if (stage === current) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await updateStage({ id: clientId as Id<"clients">, stage });
      showToast("Etapa actualizada.");
      onClose();
    } catch (e) {
      showToast(backendMessage(e, "No se pudo cambiar la etapa."));
      setSaving(false);
    }
  }

  return (
    <Modal title="Cambiar etapa" onClose={onClose} maxWidthClass="max-w-sm">
      <div className="flex flex-col gap-2">
        {STAGES.map((s, i) => {
          const isCurrent = s.key === current;
          return (
            <button
              key={s.key}
              type="button"
              disabled={saving}
              onClick={() => pick(s.key)}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-left transition-colors disabled:opacity-60",
                isCurrent
                  ? "border-interactive bg-brand-50"
                  : "border-border bg-surface hover:bg-surface-2",
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--stage-${i + 1}-text)` }}
              />
              <span className="flex-1 text-sm font-medium text-text-primary">
                {s.label}
              </span>
              {isCurrent && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="var(--interactive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/* ───────────── Modal: Agregar nota (KAR-15) ───────────── */

const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp", on: "border-[oklch(0.52_0.17_145)] bg-[oklch(0.97_0.04_145)] text-[oklch(0.35_0.14_145)]" },
  { key: "email", label: "Email", on: "border-info-500 bg-info-50 text-info-700" },
  { key: "llamada", label: "Llamada", on: "border-[oklch(0.58_0.16_290)] bg-[oklch(0.97_0.04_290)] text-[oklch(0.38_0.14_290)]" },
] as const;

function NotaModal({
  clientId,
  onClose,
  showToast,
}: {
  clientId: string;
  onClose: () => void;
  showToast: (m: string) => void;
}) {
  const createNota = useMutation(api.interactions.create);
  const [channel, setChannel] = useState<"whatsapp" | "email" | "llamada">("llamada");
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => mxDateInputValue(0));
  const [saving, setSaving] = useState(false);
  const [textError, setTextError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!text.trim()) {
      setTextError(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createNota({ clientId: clientId as Id<"clients">, text, channel, date });
      showToast("Nota guardada.");
      onClose();
    } catch (e) {
      setError(
        backendMessage(e, "No se pudo guardar la nota. Revisa los datos e inténtalo de nuevo."),
      );
      setSaving(false);
    }
  }

  return (
    <Modal title="Agregar nota" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Canal</span>
          <div className="flex gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={saving}
                onClick={() => setChannel(c.key)}
                className={cn(
                  "h-9 flex-1 rounded-md border text-sm font-medium transition-colors disabled:opacity-60",
                  channel === c.key
                    ? c.on
                    : "border-border bg-surface text-text-secondary hover:bg-surface-2",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nota-text" className={labelClass}>
            Nota <span className="text-error-500">*</span>
          </label>
          <textarea
            id="nota-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTextError(false);
            }}
            disabled={saving}
            aria-invalid={textError}
            aria-describedby={textError ? "nota-text-error" : undefined}
            placeholder="¿Qué pasó en esta interacción?"
            className={cn(textareaClass, textError && "border-error-500")}
          />
          {textError && (
            <p id="nota-text-error" className="text-sm text-error-600">
              El texto es obligatorio.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nota-date" className={labelClass}>
            Fecha
          </label>
          <input
            id="nota-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={saving}
            className={fieldClass}
          />
        </div>

        <ModalError error={error} />
        <ModalActions saving={saving} submitLabel="Guardar nota" onClose={onClose} />
      </form>
    </Modal>
  );
}

/* ───────────── Modal: Programar seguimiento (KAR-18) ───────────── */

function SeguimientoModal({
  clientId,
  onClose,
  showToast,
}: {
  clientId: string;
  onClose: () => void;
  showToast: (m: string) => void;
}) {
  const crear = useMutation(api.seguimientos.crear);
  const [date, setDate] = useState(() => mxDateInputValue(1)); // mañana por defecto
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ date?: boolean; reason?: boolean }>({});
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const next = { date: !date, reason: !reason.trim() };
    if (next.date || next.reason) {
      setErrors(next);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await crear({ clientId: clientId as Id<"clients">, dueDate: date, reason });
      showToast("Seguimiento programado.");
      onClose();
    } catch (e) {
      setError(
        backendMessage(e, "No se pudo programar el seguimiento. Inténtalo de nuevo."),
      );
      setSaving(false);
    }
  }

  return (
    <Modal title="Programar seguimiento" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seg-date" className={labelClass}>
            Fecha <span className="text-error-500">*</span>
          </label>
          <input
            id="seg-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setErrors((s) => ({ ...s, date: false }));
            }}
            disabled={saving}
            aria-invalid={errors.date ?? false}
            aria-describedby={errors.date ? "seg-date-error" : undefined}
            className={cn(fieldClass, errors.date && "border-error-500")}
          />
          {errors.date && (
            <p id="seg-date-error" className="text-sm text-error-600">
              La fecha es obligatoria.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="seg-reason" className={labelClass}>
            Motivo <span className="text-error-500">*</span>
          </label>
          <textarea
            id="seg-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setErrors((s) => ({ ...s, reason: false }));
            }}
            disabled={saving}
            aria-invalid={errors.reason ?? false}
            aria-describedby={errors.reason ? "seg-reason-error" : undefined}
            placeholder="¿Por qué volver a contactar?"
            className={cn(textareaClass, errors.reason && "border-error-500")}
          />
          {errors.reason && (
            <p id="seg-reason-error" className="text-sm text-error-600">
              El motivo es obligatorio.
            </p>
          )}
        </div>

        <ModalError error={error} />
        <ModalActions saving={saving} submitLabel="Programar" onClose={onClose} />
      </form>
    </Modal>
  );
}

/* ───────────── Modal: Registrar venta (KAR-23) ───────────── */

const PRODUCTS = [
  { key: "formacion", label: "Formación" },
  { key: "consultoria", label: "Consultoría" },
  { key: "plantilla", label: "Plantilla" },
  { key: "otro", label: "Otro" },
] as const;

function VentaModal({
  clientId,
  onClose,
  showToast,
}: {
  clientId: string;
  onClose: () => void;
  showToast: (m: string) => void;
}) {
  const createVenta = useMutation(api.sales.create);
  const [productType, setProductType] =
    useState<"formacion" | "consultoria" | "plantilla" | "otro">("formacion");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => mxDateInputValue(0));
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setAmountError(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createVenta({
        clientId: clientId as Id<"clients">,
        productType,
        amount: value,
        date,
      });
      showToast("Venta registrada.");
      onClose();
    } catch (e) {
      setError(
        backendMessage(e, "No se pudo registrar la venta. Inténtalo de nuevo."),
      );
      setSaving(false);
    }
  }

  return (
    <Modal title="Registrar venta" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Tipo de producto</span>
          <div className="flex flex-wrap gap-2">
            {PRODUCTS.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={saving}
                onClick={() => setProductType(p.key)}
                className={cn(
                  "h-10 min-w-[calc(50%-4px)] flex-1 rounded-md border text-sm font-medium transition-colors disabled:opacity-60",
                  productType === p.key
                    ? "border-interactive bg-brand-50 font-semibold text-brand-700"
                    : "border-border bg-surface text-text-secondary hover:bg-surface-2",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="venta-amount" className={labelClass}>
            Monto <span className="text-error-500">*</span>
          </label>
          <div
            className={cn(
              "flex h-10 items-center overflow-hidden rounded-md border bg-surface focus-within:border-interactive focus-within:ring-2 focus-within:ring-focus-ring",
              amountError ? "border-error-500" : "border-border",
            )}
          >
            <span className="pl-3 text-text-tertiary">$</span>
            <input
              id="venta-amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setAmountError(false);
              }}
              disabled={saving}
              aria-invalid={amountError}
              aria-describedby={amountError ? "venta-amount-error" : undefined}
              placeholder="0.00"
              className="h-10 min-w-0 flex-1 bg-transparent px-2 text-base text-text-primary outline-none placeholder:text-text-tertiary disabled:opacity-60"
            />
            <span className="pr-3 text-sm text-text-tertiary">MXN</span>
          </div>
          {amountError && (
            <p id="venta-amount-error" className="text-sm text-error-600">
              El monto debe ser mayor que 0.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="venta-date" className={labelClass}>
            Fecha
          </label>
          <input
            id="venta-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={saving}
            className={fieldClass}
          />
        </div>

        <ModalError error={error} />
        <ModalActions saving={saving} submitLabel="Registrar venta" onClose={onClose} />
      </form>
    </Modal>
  );
}

/* ───────────── Piezas compartidas de los modales ───────────── */

function ModalError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-error-200 bg-error-50 px-3.5 py-2.5 text-sm text-error-700"
    >
      {error}
    </div>
  );
}

function ModalActions({
  saving,
  submitLabel,
  onClose,
}: {
  saving: boolean;
  submitLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex gap-2.5 pt-1">
      <Button
        type="button"
        variant="secondary"
        className="w-full justify-center"
        disabled={saving}
        onClick={onClose}
      >
        Cancelar
      </Button>
      <Button type="submit" variant="primary" className="w-full justify-center" disabled={saving}>
        {saving ? (
          <>
            <Spinner /> Guardando…
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/35 border-t-white"
      aria-hidden
    />
  );
}

/* ───────────── Estados ───────────── */

function NotFound() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <h1 className="text-xl font-bold text-text-primary">Cliente no encontrado</h1>
      <p className="mt-1.5 max-w-xs text-sm text-text-secondary">
        Puede que este cliente haya sido eliminado o que el enlace no sea válido.
      </p>
      <div className="mt-4">
        <Link href="/clientes">
          <Button variant="secondary" size="sm">
            Ver lista de clientes
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6 md:flex-row md:gap-7">
      <div className="h-80 w-full rounded-xl bg-surface-2 md:w-[280px] md:shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="mb-3 h-4 w-48 rounded bg-surface-2" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
