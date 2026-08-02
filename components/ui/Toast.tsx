"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Aviso breve al pie de la pantalla (KAR-55).
 *
 * No es un componente nuevo: es la TERCERA copia del mismo bloque, que estaba
 * duplicado a mano en `app/(app)/seguimientos/page.tsx` y en
 * `app/(app)/clientes/[id]/FichaClient.tsx`. Es la misma historia que
 * `lib/errores.ts` tiene escrita sobre sí mismo.
 *
 * Y las dos copias YA habían divergido: una usaba `z-50` y la otra `z-[60]`. No
 * era estético — los modales son `z-50`, así que la copia con `z-50` quedaba
 * TAPADA por un modal abierto. Se unifica en `z-[60]`, que es la correcta, y por
 * eso el toast tiene que estar por encima de cualquier modal: la pantalla de
 * usuarios enseña avisos con el modal abierto.
 */

const DURACION_MS = 3000;

/**
 * Estado + pintado del toast. Devuelve `showToast` para el resto de la pantalla
 * y el nodo ya montado, para que ningún punto de llamada tenga que acordarse del
 * temporizador ni del z-index.
 */
export function useToast(): {
  showToast: (mensaje: string) => void;
  toast: React.ReactNode;
} {
  const [mensaje, setMensaje] = useState<string | null>(null);
  // El id del temporizador vive en un ref para poder CANCELARLO: sin esto, dos
  // avisos seguidos comparten el reloj del primero y el segundo se va antes de
  // tiempo. Las copias que se sustituyen tenían ese defecto.
  const temporizador = useRef<number | null>(null);

  const showToast = useCallback((texto: string) => {
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    setMensaje(texto);
    temporizador.current = window.setTimeout(() => {
      setMensaje(null);
      temporizador.current = null;
    }, DURACION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (temporizador.current !== null) {
        window.clearTimeout(temporizador.current);
      }
    };
  }, []);

  return { showToast, toast: <Toast mensaje={mensaje} /> };
}

export function Toast({ mensaje }: { mensaje: string | null }) {
  if (mensaje === null) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-24 z-[60] mx-auto w-fit max-w-[92vw] rounded-full bg-text-primary px-4 py-2 text-center text-sm text-surface shadow-lg"
    >
      {mensaje}
    </div>
  );
}
