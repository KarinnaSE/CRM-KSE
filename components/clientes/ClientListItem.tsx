import Link from "next/link";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn, type StageKey } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { StageBadge } from "@/components/ui/StageBadge";

/**
 * Fila de la Lista de clientes (KAR-14). A diferencia de SeguimientoItem (que
 * usa role="button" porque contiene un botón hijo "Hecho"), esta fila SOLO
 * navega, así que es un <Link> semántico: teclado nativo, abrir en pestaña
 * nueva y menú contextual funcionan sin código extra (condición del auditor).
 *
 * Muestra Avatar + nombre + StageBadge + empresa + contacto (teléfono si hay,
 * si no email, si no "Sin contacto").
 */
export function ClientListItem({ client }: { client: Doc<"clients"> }) {
  const phone = client.phone?.trim();
  const email = client.email?.trim();
  const contact = phone || email || "Sin contacto";
  const hasContact = Boolean(phone || email);

  return (
    <Link
      href={`/clientes/${client._id}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <Avatar name={client.name} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-text-primary">
            {client.name}
          </span>
          <StageBadge stage={client.stage as StageKey} />
        </div>

        {client.company && (
          <p className="truncate text-sm text-text-secondary">{client.company}</p>
        )}

        <p
          className={cn(
            "mt-0.5 truncate text-xs",
            hasContact ? "text-text-tertiary" : "italic text-text-tertiary",
          )}
        >
          {contact}
        </p>
      </div>

      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="shrink-0">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}
