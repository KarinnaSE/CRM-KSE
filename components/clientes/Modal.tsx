"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shell accesible de modal para las acciones de la Ficha (KAR-17).
 * Contrato de accesibilidad (condición del auditor): role="dialog" + aria-modal,
 * título asociado por aria-labelledby, foco inicial al abrir, y cierre con Escape o
 * clic en el backdrop. El anti-doble-submit vive en cada formulario (estado `saving`).
 */
export function Modal({
  title,
  onClose,
  children,
  maxWidthClass = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Ref a onClose para no re-ejecutar el efecto (y no reenganchar foco) en cada render del padre.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Guarda el disparador para devolverle el foco al cerrar (contrato de diálogo accesible).
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);

    // Foco inicial: primer campo del formulario o, en su defecto, el primer botón.
    const focusable =
      cardRef.current?.querySelector<HTMLElement>("input, textarea, select") ??
      cardRef.current?.querySelector<HTMLElement>("button");
    focusable?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-xl bg-surface p-6 shadow-lg",
          maxWidthClass,
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
