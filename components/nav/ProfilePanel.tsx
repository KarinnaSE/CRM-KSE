"use client";

import { useEffect, useRef } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

/**
 * Panel de Perfil (KAR-56, diseño KAR-48). Bottom-sheet en móvil / dropdown
 * arriba-derecha en escritorio. Se comporta como diálogo modal:
 *   - Escape lo cierra.
 *   - Al abrir, el foco entra al panel (al botón de salir); al cerrar, vuelve
 *     al disparador que lo abrió — PERO solo si ese disparador sigue en el DOM.
 *     Durante el cierre de sesión navegamos a /login y el AppShell se desmonta,
 *     así que el disparador ya no está `isConnected` y no se intenta enfocar un
 *     nodo muerto (R2 del plan).
 *   - El foco queda atrapado dentro del panel mientras está abierto (Tab cicla).
 *   - El scroll del fondo se bloquea mientras el panel vive.
 *
 * NO gestiona la salida: recibe `onLogout` ya blindado por el AppShell (estado
 * `loggingOut`). Aquí solo se refleja ese estado en la UI (spinner + texto +
 * botón deshabilitado); el orden marcar→signOut→replace vive en el AppShell y
 * este componente no lo toca (R1 del plan).
 */
export function ProfilePanel({
  user,
  onClose,
  onLogout,
  loggingOut,
}: {
  user: Doc<"users">;
  onClose: () => void;
  onLogout: () => void | Promise<void>;
  loggingOut: boolean;
}) {
  const isOwner = user.role === "duena";
  const panelRef = useRef<HTMLDivElement>(null);

  // Foco de entrada/salida + bloqueo de scroll del fondo. Se ejecuta una vez
  // por vida del panel: montar = abrir, desmontar = cerrar.
  useEffect(() => {
    const disparador = document.activeElement as HTMLElement | null;
    panelRef.current
      ?.querySelector<HTMLElement>("button:not([disabled])")
      ?.focus();

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflowPrevio;
      // Solo devolvemos el foco si el disparador sigue vivo (ver cabecera).
      if (disparador?.isConnected) disparador.focus();
    };
  }, []);

  // Escape cierra; Tab queda atrapado entre el primer y el último focusable.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      const activo = document.activeElement;
      if (e.shiftKey && activo === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Perfil"
        className={cn(
          "fixed z-50 border border-border bg-surface shadow-lg",
          // Móvil: bottom-sheet. Escritorio: dropdown arriba a la derecha.
          "inset-x-0 bottom-0 rounded-t-xl p-5",
          "md:inset-x-auto md:bottom-auto md:right-4 md:top-16 md:w-72 md:rounded-xl",
        )}
      >
        {/* Asa de arrastre: puramente visual (el diseño no pide gesto), solo
            móvil. Color por variable para no depender de utilidades de neutral. */}
        <div
          aria-hidden
          className="mx-auto mb-3 h-1 w-10 rounded-full md:hidden"
          style={{ backgroundColor: "var(--neutral-200)" }}
        />

        <div className="flex items-center gap-3">
          <Avatar name={user.name ?? "?"} size="xl" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-text-primary">
              {user.name ?? "Usuario"}
            </p>
            <p className="truncate text-sm text-text-secondary">{user.email}</p>
            <RoleBadge owner={isOwner} />
          </div>
        </div>

        <div className="mt-4 border-t border-border-subtle pt-3">
          <Button
            variant="danger"
            size="sm"
            className="w-full justify-start"
            disabled={loggingOut}
            onClick={() => void onLogout()}
          >
            {loggingOut ? <Spinner /> : <LogoutIcon />}
            {loggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
          </Button>
        </div>
      </div>
    </>
  );
}

function RoleBadge({ owner }: { owner: boolean }) {
  return (
    <span
      className="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
      style={
        owner
          ? { backgroundColor: "var(--brand-100)", color: "var(--brand-700)" }
          : { backgroundColor: "var(--info-50)", color: "var(--info-600)" }
      }
    >
      {owner ? "Dueña" : "Vendedor"}
    </span>
  );
}

const LogoutIcon = () => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </svg>
);

const Spinner = () => (
  <span
    aria-hidden
    className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-error-200 border-t-error-600"
  />
);
