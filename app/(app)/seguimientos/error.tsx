"use client";

import { Button } from "@/components/ui/Button";

/**
 * Error boundary de la ruta Seguimientos. Se muestra si la query
 * `pendientes` falla al cargar. Ofrece reintentar (`reset()`).
 */
export default function SeguimientosError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-16 text-center">
      <h1 className="text-md font-bold text-text-primary">
        No se pudieron cargar los seguimientos
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Ocurrió un problema al obtener tus pendientes. Vuelve a intentarlo.
      </p>
      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={() => reset()}>
          Reintentar
        </Button>
      </div>
    </section>
  );
}
