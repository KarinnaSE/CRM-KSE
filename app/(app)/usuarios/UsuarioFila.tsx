"use client";

import { useEffect, useRef } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";

/**
 * Una fila de la lista de usuarios (KAR-55).
 *
 * El tipo sale del propio backend en vez de escribirse a mano: si `users.listar`
 * cambia de forma, esto deja de compilar en vez de mentir en silencio.
 */
export type FilaUsuario = FunctionReturnType<typeof api.users.listar>[number];

const ETIQUETA_ROL: Record<"duena" | "vendedor", string> = {
  duena: "Dueña",
  vendedor: "Vendedor",
};

export function UsuarioFila({
  fila,
  confirmando,
  ocupado,
  onEditar,
  onPedirBorrado,
  onCancelarBorrado,
  onEliminar,
  onCambiarEstado,
  onExplicar,
}: {
  fila: FilaUsuario;
  confirmando: boolean;
  ocupado: boolean;
  onEditar: () => void;
  onPedirBorrado: () => void;
  onCancelarBorrado: () => void;
  onEliminar: () => void;
  onCambiarEstado: (active: boolean) => void;
  onExplicar: (motivo: string) => void;
}) {
  const esDuena = fila.role === "duena";

  // Desactivar/Reactivar y eliminar están PROHIBIDOS por el backend sobre la
  // cuenta dueña y sobre la propia. Ofrecer el botón sería ofrecer un error.
  const puedeCambiarEstado = !fila.esYo && !esDuena;

  // La papelera se ESCONDE donde la acción no tiene sentido y nunca lo va a
  // tener, y se DESHABILITA CON EL MOTIVO donde la dueña tiene que aprender la
  // regla ("ya registró información, desactívala en su lugar"). Ver el plan §5.
  const mostrarPapelera = !fila.esYo && !esDuena;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 shadow-sm transition-colors hover:bg-surface-2",
        !fila.active && "opacity-60",
      )}
    >
      <Avatar name={fila.name || "?"} size="md" />

      <div className="min-w-0 flex-1 basis-40">
        <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-base font-semibold text-text-primary">
            {fila.name || "(sin nombre)"}
          </span>
          {fila.esYo && (
            <span className="text-xs font-normal text-text-tertiary">(tú)</span>
          )}
          <EtiquetaRol role={fila.role} />
        </div>
        <div className="truncate text-sm text-text-secondary">{fila.email}</div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {!fila.active && (
          <span className="whitespace-nowrap rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-text-tertiary">
            Inactivo
          </span>
        )}
        {fila.sinContrasena && (
          /**
           * OJO CON ESTE TEXTO. "Sin contraseña" NO es "sin acceso": si su correo
           * es de Google, esa persona puede entrar con "Continuar con Google" sin
           * haber usado nunca la invitación. Lo dice el comentario de
           * `users.listar` y es la razón de que el distintivo se llame así.
           */
          <span
            title="Todavía no ha configurado su contraseña. Si su correo es de Google, puede entrar con «Continuar con Google»."
            className="whitespace-nowrap rounded-full border border-warning-100 bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-600"
          >
            Sin contraseña
          </span>
        )}
        {fila.role === null && (
          <span
            title="Cuenta mal provisionada: no tiene rol. Edítala para asignarle uno."
            className="whitespace-nowrap rounded-full border border-error-200 bg-error-50 px-2.5 py-0.5 text-xs font-semibold text-error-600"
          >
            Sin rol
          </span>
        )}
      </div>

      {confirmando ? (
        <ConfirmacionBorrado
          nombre={fila.name || fila.email}
          ocupado={ocupado}
          onSi={onEliminar}
          onNo={onCancelarBorrado}
        />
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onEditar}
            disabled={ocupado}
            className="h-9 whitespace-nowrap rounded-md border border-border bg-surface px-3.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            Editar
          </button>

          {puedeCambiarEstado &&
            (fila.active ? (
              <button
                type="button"
                onClick={() => onCambiarEstado(false)}
                disabled={ocupado}
                className="h-8 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-text-tertiary transition-colors hover:border-error-200 hover:bg-error-50 hover:text-error-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                Desactivar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onCambiarEstado(true)}
                disabled={ocupado}
                className="h-8 whitespace-nowrap rounded-md border border-success-200 bg-success-50 px-2.5 text-xs font-semibold text-success-700 transition-colors hover:bg-success-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reactivar
              </button>
            ))}

          {mostrarPapelera && <Papelera fila={fila} ocupado={ocupado} onPedirBorrado={onPedirBorrado} onExplicar={onExplicar} />}
        </div>
      )}
    </div>
  );
}

function EtiquetaRol({ role }: { role: FilaUsuario["role"] }) {
  if (role === null) return null;
  const esDuena = role === "duena";
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        esDuena
          ? "border-brand-200 bg-brand-100 text-brand-700"
          : "border-info-100 bg-info-50 text-info-600",
      )}
    >
      {ETIQUETA_ROL[role]}
    </span>
  );
}

/**
 * Papelera. Cuando `puedeEliminar` es falso NO se usa el atributo `disabled`, y
 * la razón es concreta: un botón `disabled` sale del orden de tabulación y no
 * dispara eventos de ratón, así que ni quien navega con teclado ni quien usa el
 * móvil llega jamás al `title`. Y este CRM se usa sobre todo desde el móvil,
 * donde no hay hover y un `title` es invisible.
 *
 * Con `aria-disabled` el botón sigue siendo alcanzable y al pulsarlo EXPLICA en
 * vez de no hacer nada. Lo que no hace, en ningún caso, es abrir la confirmación
 * ni llamar a `eliminar`.
 */
function Papelera({
  fila,
  ocupado,
  onPedirBorrado,
  onExplicar,
}: {
  fila: FilaUsuario;
  ocupado: boolean;
  onPedirBorrado: () => void;
  onExplicar: (motivo: string) => void;
}) {
  const bloqueada = !fila.puedeEliminar;
  const motivo = fila.motivoNoEliminar ?? "";

  return (
    <button
      type="button"
      aria-disabled={bloqueada || undefined}
      aria-label={bloqueada ? `No se puede eliminar a ${fila.name}: ${motivo}` : `Eliminar a ${fila.name}`}
      title={bloqueada ? motivo : "Eliminar"}
      onClick={() => {
        if (ocupado) return;
        if (bloqueada) {
          onExplicar(motivo);
          return;
        }
        onPedirBorrado();
      }}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-tertiary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        bloqueada
          ? "cursor-not-allowed opacity-50"
          : "hover:border-error-200 hover:bg-error-50 hover:text-error-600",
      )}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </svg>
    </button>
  );
}

/**
 * Confirmación en línea, como el diseño. El foco inicial va al "No": en una
 * acción destructiva, el botón por defecto es el que NO destruye. Y el "Sí"
 * lleva su `aria-label` completo, porque un "Sí" suelto no dice nada fuera de
 * contexto.
 */
function ConfirmacionBorrado({
  nombre,
  ocupado,
  onSi,
  onNo,
}: {
  nombre: string;
  ocupado: boolean;
  onSi: () => void;
  onNo: () => void;
}) {
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    noRef.current?.focus();
  }, []);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-sm font-medium text-text-secondary">¿Eliminar?</span>
      <button
        type="button"
        onClick={onSi}
        disabled={ocupado}
        aria-label={`Sí, eliminar a ${nombre}`}
        className="h-8 rounded-md bg-error-500 px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        Sí
      </button>
      <button
        ref={noRef}
        type="button"
        onClick={onNo}
        disabled={ocupado}
        aria-label="No eliminar"
        className="h-8 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        No
      </button>
    </div>
  );
}
