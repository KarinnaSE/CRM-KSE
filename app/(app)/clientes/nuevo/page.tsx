"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { backendMessage } from "@/lib/errores";
import { cn, STAGES, type StageKey } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

/**
 * Pantalla: Nuevo cliente (KAR-12) — formulario de alta que consume
 * `clients.create` (KAR-11). El backend exige sesión activa y sella
 * `registeredBy`/`registeredAt` desde la identidad; aquí solo se capturan los
 * datos de contacto y la etapa inicial. Al guardar con datos válidos, navega a
 * la Ficha del cliente recién creado. El chrome global (nav/FAB) lo da AppShell.
 *
 * Reutiliza los patrones ya establecidos en la Ficha (FichaClient.tsx): estilos
 * de campo, `backendMessage`, estado `saving` y el selector de etapa en píldoras.
 */

/** Descripción corta por etapa (Detalle-Diseño 2026-07-07, KAR-12). */
const STAGE_DESC: Record<StageKey, string> = {
  interesado: "Contacto inicial, aún evaluando.",
  en_conversacion: "Hay diálogo activo con el cliente.",
  propuesta_enviada: "Se entregó propuesta, esperando respuesta.",
  comprado: "Venta cerrada exitosamente.",
  perdido: "No prosperó. Se puede reactivar después.",
};

const labelClass = "text-sm font-medium text-text-primary";
const fieldClass =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary outline-none placeholder:text-text-tertiary focus:border-interactive focus:ring-2 focus:ring-focus-ring disabled:opacity-60";

export default function NuevoClientePage() {
  const router = useRouter();
  const createCliente = useMutation(api.clients.create);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<StageKey>(STAGES[0].key);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: boolean; contact?: boolean }>({});
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    // Limpia cualquier alerta de backend previa en cada intento (evita que un
    // error viejo conviva con los errores de validación de campo). Auditoría #33.
    setError(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    const trimmedCompany = company.trim();

    // Espejo de la regla del backend: nombre + al menos teléfono o email.
    const next = {
      name: !trimmedName,
      contact: !trimmedPhone && !trimmedEmail,
    };
    if (next.name || next.contact) {
      setErrors(next);
      return;
    }

    setSaving(true);
    try {
      // Opcionales vacíos → undefined (no guardar strings en blanco).
      const id = await createCliente({
        name: trimmedName,
        company: trimmedCompany || undefined,
        phone: trimmedPhone || undefined,
        email: trimmedEmail || undefined,
        stage,
      });
      // Éxito: a la Ficha del cliente nuevo. No se rehabilita `saving` a
      // propósito (el botón queda inerte durante la navegación → anti-doble-submit).
      router.push(`/clientes/${id}`);
    } catch (err) {
      setError(
        backendMessage(err, "No se pudo crear el cliente. Revisa los datos e inténtalo de nuevo."),
      );
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl px-4 pb-24 pt-5">
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

      <h1 className="text-2xl font-bold text-text-primary">Nuevo cliente</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Captura los datos de contacto. Solo el nombre y un medio de contacto (teléfono o correo)
        son obligatorios.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-5">
        {/* ── Nombre ── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cli-name" className={labelClass}>
            Nombre completo <span className="text-error-500">*</span>
          </label>
          <input
            id="cli-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((s) => ({ ...s, name: false }));
            }}
            disabled={saving}
            aria-invalid={errors.name ?? false}
            aria-describedby={errors.name ? "cli-name-error" : undefined}
            placeholder="Ej. María García"
            className={cn(fieldClass, errors.name && "border-error-500")}
          />
          {errors.name && (
            <p id="cli-name-error" className="text-sm text-error-600">
              El nombre es obligatorio.
            </p>
          )}
        </div>

        {/* ── Empresa / negocio (opcional) ── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cli-company" className={labelClass}>
            Empresa / negocio <span className="text-text-tertiary">(opcional)</span>
          </label>
          <input
            id="cli-company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={saving}
            placeholder="Ej. Nutrición KSE"
            className={fieldClass}
          />
        </div>

        {/* ── Teléfono ── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cli-phone" className={labelClass}>
            Teléfono
          </label>
          <input
            id="cli-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setErrors((s) => ({ ...s, contact: false }));
            }}
            disabled={saving}
            aria-invalid={errors.contact ?? false}
            aria-describedby={errors.contact ? "cli-contact-error" : undefined}
            placeholder="+52 33 1234 5678"
            className={cn(fieldClass, errors.contact && "border-error-500")}
          />
        </div>

        {/* ── Correo ── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cli-email" className={labelClass}>
            Correo electrónico
          </label>
          <input
            id="cli-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((s) => ({ ...s, contact: false }));
            }}
            disabled={saving}
            aria-invalid={errors.contact ?? false}
            aria-describedby={errors.contact ? "cli-contact-error" : undefined}
            placeholder="correo@ejemplo.com"
            className={cn(fieldClass, errors.contact && "border-error-500")}
          />
          {errors.contact && (
            <p id="cli-contact-error" className="text-sm text-error-600">
              Ingresa al menos el teléfono o el correo electrónico.
            </p>
          )}
        </div>

        {/* ── Etapa inicial ── */}
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Etapa inicial</span>
          <div className="flex flex-col gap-2">
            {STAGES.map((s, i) => {
              const isActive = s.key === stage;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={saving}
                  onClick={() => setStage(s.key)}
                  aria-pressed={isActive}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-left transition-colors disabled:opacity-60",
                    isActive
                      ? "border-interactive bg-brand-50"
                      : "border-border bg-surface hover:bg-surface-2",
                  )}
                >
                  <span
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 self-start rounded-full"
                    style={{ backgroundColor: `var(--stage-${i + 1}-text)` }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">
                      {s.label}
                    </span>
                    <span className="block text-xs text-text-secondary">
                      {STAGE_DESC[s.key]}
                    </span>
                  </span>
                  {isActive && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                      stroke="var(--interactive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-error-200 bg-error-50 px-3.5 py-2.5 text-sm text-error-700"
          >
            {error}
          </div>
        )}

        {/* ── Acciones ── */}
        <div className="flex gap-2.5 pt-1">
          <Link
            href="/clientes"
            aria-disabled={saving}
            tabIndex={saving ? -1 : undefined}
            className={cn(
              "inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 text-base font-semibold text-text-primary transition-colors hover:bg-surface-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              saving && "pointer-events-none opacity-50",
            )}
          >
            Cancelar
          </Link>
          <Button type="submit" variant="primary" className="w-full justify-center" disabled={saving}>
            {saving ? (
              <>
                <Spinner /> Guardando…
              </>
            ) : (
              "Guardar cliente"
            )}
          </Button>
        </div>
      </form>
    </section>
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
