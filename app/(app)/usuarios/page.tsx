"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { backendMessage } from "@/lib/errores";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { UsuarioFila, type FilaUsuario } from "./UsuarioFila";
import {
  UsuarioModal,
  textoDeInvitacionFallida,
  type ResultadoAlta,
} from "./UsuarioModal";

/**
 * Pantalla: Gestión de usuarios y roles (KAR-55) — EXCLUSIVA del rol dueña.
 * Consume las seis funciones de convex/users.ts (KAR-54 + KAR-89), que ya están
 * mergeadas y desplegadas. Diseño: Design/…/Usuarios.dc.html.
 *
 * ESTA PANTALLA NO ES LA QUE PROTEGE NADA. El middleware protege `/usuarios`
 * solo por sesión y el AppShell se limita a ocultar la pestaña; la garantía es
 * `requireOwner` en las seis funciones del backend. Lo de aquí es cosmética: que
 * un vendedor no aterrice en una pantalla que no le sirve.
 */
export default function UsuariosPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const esDuena = user?.role === "duena";

  /**
   * ⚠️ EL `"skip"` NO ES OPCIONAL, y no se puede quitar sin romper esto.
   *
   * `useQuery` es un hook: no se puede llamar condicionalmente. Si se suscribe
   * para un vendedor, `requireOwner` lanza —y lanza un `Error` normal, no un
   * `ConvexError`—, así que en producción el mensaje se redacta y, sobre todo,
   * convex/react vuelve a lanzar el error de una query DURANTE EL RENDER: el
   * vendedor no vería la redirección de abajo sino la pantalla de error de la
   * ruta.
   *
   * Pasando `"skip"` en el lugar de los argumentos, la query no se suscribe y no
   * sale ni una llamada a la red.
   */
  const usuarios = useQuery(api.users.listar, esDuena ? {} : "skip");

  const cambiarEstado = useMutation(api.users.cambiarEstado);
  const eliminar = useMutation(api.users.eliminar);

  const { showToast, toast } = useToast();
  const [editando, setEditando] = useState<FilaUsuario | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [avisoAlta, setAvisoAlta] = useState<ResultadoAlta | null>(null);

  useEffect(() => {
    // `undefined` es "cargando", NO "no eres dueña". Confundirlos echaría a la
    // dueña de su propia pantalla en el primer render.
    if (user === undefined) return;
    if (!esDuena) router.replace("/seguimientos");
  }, [user, esDuena, router]);

  if (user === undefined || !esDuena) return null;

  function abrirAlta() {
    setEditando(null);
    setModalAbierto(true);
  }

  function abrirEdicion(fila: FilaUsuario) {
    setEditando(fila);
    setModalAbierto(true);
  }

  function alAlta(resultado: ResultadoAlta) {
    if (resultado.invitacion.enviada) {
      showToast(
        `Usuario creado. Le enviamos la invitación a ${resultado.email}.`,
      );
      setAvisoAlta(null);
      return;
    }
    // Aviso PERSISTENTE, no toast: la cuenta existe y esa persona no puede
    // entrar. Es algo que hay que resolver, y un toast de 3 segundos que no se
    // puede pulsar sirve para confirmar, no para pedir una acción.
    setAvisoAlta(resultado);
  }

  async function alCambiarEstado(fila: FilaUsuario, active: boolean) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await cambiarEstado({ userId: fila._id, active });
      showToast(
        active
          ? `${r.nombre} vuelve a tener acceso.`
          : `${r.nombre} ya no tiene acceso.` +
              (r.sesionesCerradas > 0 ? " Se cerró su sesión." : ""),
      );
    } catch (e) {
      showToast(backendMessage(e, "No se pudo cambiar el estado."));
    } finally {
      setOcupado(false);
    }
  }

  async function alEliminar(fila: FilaUsuario) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await eliminar({ userId: fila._id });
      setConfirmandoId(null);
      showToast(`${r.nombre} se eliminó del CRM.`);
    } catch (e) {
      showToast(backendMessage(e, "No se pudo eliminar."));
    } finally {
      setOcupado(false);
    }
  }

  const activos = usuarios?.filter((u) => u.active).length ?? 0;
  const filaDelAviso =
    avisoAlta === null
      ? null
      : (usuarios?.find((u) => u._id === avisoAlta.userId) ?? null);

  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-8">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold leading-snug text-text-primary">
            Usuarios y roles
          </h1>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
            <CandadoIcon />
            Solo dueña
          </span>
        </div>
        <p className="text-base text-text-secondary">
          Gestiona las cuentas con acceso a KSE CRM.
        </p>
      </header>

      {avisoAlta !== null && (
        <AvisoAlta
          aviso={avisoAlta}
          fila={filaDelAviso}
          onReenviar={() => {
            if (filaDelAviso !== null) abrirEdicion(filaDelAviso);
          }}
          onCerrar={() => setAvisoAlta(null)}
        />
      )}

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Usuarios activos
        </span>
        <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold text-text-secondary">
          {usuarios === undefined ? "—" : activos}
        </span>
      </div>

      {usuarios === undefined ? (
        <Esqueleto />
      ) : (
        <div className="mb-5 flex flex-col gap-2">
          {/* Sin estado vacío a propósito: si `requireOwner` ha pasado, la dueña
              está en la tabla, así que esta lista nunca puede venir vacía. */}
          {usuarios.map((fila) => (
            <UsuarioFila
              key={fila._id}
              fila={fila}
              confirmando={confirmandoId === fila._id}
              ocupado={ocupado}
              onEditar={() => abrirEdicion(fila)}
              onPedirBorrado={() => setConfirmandoId(fila._id)}
              onCancelarBorrado={() => setConfirmandoId(null)}
              onEliminar={() => void alEliminar(fila)}
              onCambiarEstado={(active) => void alCambiarEstado(fila, active)}
              onExplicar={showToast}
            />
          ))}
        </div>
      )}

      <Button
        variant="secondary"
        className="w-full"
        onClick={abrirAlta}
        disabled={usuarios === undefined}
      >
        Agregar usuario
      </Button>

      {modalAbierto && (
        <UsuarioModal
          fila={editando}
          onCerrar={() => setModalAbierto(false)}
          onAlta={alAlta}
          showToast={showToast}
        />
      )}

      {toast}
    </section>
  );
}

/**
 * El alta pudo crear la cuenta y NO enviar la invitación. Decir solo "usuario
 * creado" sería mentir por omisión: esa persona no puede entrar y nadie se lo ha
 * dicho. Por eso este aviso no se va solo y lleva la acción para arreglarlo.
 */
function AvisoAlta({
  aviso,
  fila,
  onReenviar,
  onCerrar,
}: {
  aviso: ResultadoAlta;
  fila: FilaUsuario | null;
  onReenviar: () => void;
  onCerrar: () => void;
}) {
  if (aviso.invitacion.enviada) return null;
  return (
    <div
      role="status"
      className="mb-5 rounded-lg border border-warning-100 bg-warning-50 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">
            La cuenta de {aviso.nombre} se creó, pero no pudimos enviarle la
            invitación.
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {textoDeInvitacionFallida(aviso.invitacion, Date.now())}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mt-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={onReenviar}
          disabled={fila === null}
        >
          Reenviar invitación
        </Button>
      </div>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="mb-5 flex flex-col gap-2" aria-hidden>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-[70px] animate-pulse rounded-lg border border-border bg-surface-2"
        />
      ))}
    </div>
  );
}

function CandadoIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
