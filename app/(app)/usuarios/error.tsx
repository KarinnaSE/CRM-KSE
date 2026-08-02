"use client";

import { Button } from "@/components/ui/Button";

/**
 * Error boundary de la ruta Usuarios. Calcado del de Seguimientos.
 *
 * NO está aquí por el vendedor —a ese lo cubre el `"skip"` de page.tsx, que
 * impide que la query llegue a suscribirse— sino porque `users.listar` puede
 * fallar por otras razones (que la sesión de la dueña caduque mientras mira la
 * pantalla, por ejemplo) y sin boundary el fallo sube hasta la raíz.
 */
export default function UsuariosError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-16 text-center">
      <h1 className="text-md font-bold text-text-primary">
        No se pudieron cargar los usuarios
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Ocurrió un problema al obtener las cuentas. Vuelve a intentarlo.
      </p>
      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={() => reset()}>
          Reintentar
        </Button>
      </div>
    </section>
  );
}
