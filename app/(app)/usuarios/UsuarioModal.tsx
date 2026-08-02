"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { normalizeEmail } from "@/convex/authShared";
import { backendMessage } from "@/lib/errores";
import { cn } from "@/lib/utils";
import {
  marcarSalidaIntencionada,
  limpiarSalidaIntencionada,
} from "@/lib/salidaIntencionada";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/clientes/Modal";
import { formatearCaducidad } from "./caducidad";
import type { FilaUsuario } from "./UsuarioFila";

/**
 * Alta y edición de un usuario (KAR-55). Un solo componente con dos modos.
 *
 * NO PIDE CONTRASEÑA, y eso no es un olvido: la fija la persona invitada con un
 * código por correo (decisión (b) de KAR-54). Donde el diseño ponía "Nueva
 * contraseña (opcional)" va ahora "Reenviar invitación".
 */

/** Espejo de `validarNombre`/`validarCorreo` de convex/users.ts. */
const NOMBRE_MAX = 80;
const CORREO_MAX = 254;
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const labelClass = "text-sm font-medium text-text-primary";
const fieldClass =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary outline-none placeholder:text-text-tertiary focus:border-interactive focus:ring-2 focus:ring-focus-ring disabled:opacity-60";

type Rol = "duena" | "vendedor";

/**
 * `reintentable` NO es cosmético: decide si se pinta un botón que vuelve a
 * llamar a `reenviarInvitacion`, y eso puede MANDAR UN CORREO.
 *
 * El motivo está en la asimetría del backend, que hay que tener delante al tocar
 * esto. `contextoReenvio` solo rechaza una cuenta que ya tiene contraseña cuando
 * `forzar` es cierto (`convex/users.ts`, "if (args.forzar && password.secret
 * !== undefined)"), y `prepararEnvio` solo comprueba el secreto cuando
 * `forzarPorDuena` es cierto. O sea que una llamada con `forzar: false` NO está
 * guardada contra ese caso: si no queda código vivo, emite y envía.
 *
 * Así que cuando el backend ya nos ha DICHO que esa persona tiene contraseña,
 * ofrecer un "Reintentar" —que llama con `forzar: false`— le mandaría una
 * invitación a alguien que no la necesita, con un código para cambiar la
 * contraseña que ya tiene. Ese estado es TERMINAL y no lleva acción.
 */
type Reenvio =
  | { estado: "inerte" }
  | { estado: "enviando" }
  | { estado: "confirmar"; expiresAt: number }
  | { estado: "mensaje"; texto: string; reintentable: boolean };

type ResultadoCrear = FunctionReturnType<typeof api.users.crear>;
/** Lo que la pantalla necesita para decidir qué enseñar tras un alta. */
export type ResultadoAlta = ResultadoCrear & { nombre: string; email: string };

/**
 * Texto de un intento de invitación que NO salió. Vive aquí y se exporta porque
 * lo usan dos sitios: el bloque de reenvío del modal y el aviso persistente del
 * alta, en la pantalla. Dos copias del mismo texto se desvían.
 *
 * Estos son los `motivo` que `crear`/`reenviarInvitacion` DEVUELVEN. Los rechazos
 * que LANZAN (cuenta desactivada, ya tiene contraseña, ya no existe) son
 * ConvexError y llegan por el `catch`, con el texto ya redactado por el backend.
 */
export function textoDeInvitacionFallida(
  invitacion: Extract<ResultadoCrear["invitacion"], { enviada: false }>,
  ahora: number,
): string {
  switch (invitacion.motivo) {
    case "codigo_vivo":
      return (
        "Ya tenía una invitación viva, y no se toca: sigue siendo válida hasta " +
        `${formatearCaducidad(invitacion.expiresAt, ahora)}.`
      );
    case "cuota":
      return (
        "Se han enviado demasiados correos a esa dirección en poco tiempo. " +
        "Espera unos minutos e inténtalo otra vez."
      );
    case "no_forzable":
      return "Esa persona ya configuró su contraseña; no necesita invitación.";
    default:
      return "No pudimos enviar el correo. Inténtalo de nuevo en un momento.";
  }
}

export function UsuarioModal({
  fila,
  onCerrar,
  onAlta,
  showToast,
}: {
  /** `null` = alta. Un usuario = edición. */
  fila: FilaUsuario | null;
  onCerrar: () => void;
  onAlta: (resultado: ResultadoAlta) => void;
  showToast: (mensaje: string) => void;
}) {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const crear = useAction(api.users.crear);
  const actualizar = useMutation(api.users.actualizar);
  const reenviarInvitacion = useAction(api.users.reenviarInvitacion);

  const esEdicion = fila !== null;

  /**
   * EL MODAL CONGELA LA FILA AL ABRIRSE. `useState` con valor inicial y sin
   * re-sincronizar: `sinContrasena` y `active` se copian igual que los campos
   * del formulario.
   *
   * Es una decisión, no un descuido, y tiene dos razones. La de uso: un modal
   * cuyos botones aparecen y desaparecen bajo el dedo mientras escribes es peor
   * que uno estable. La de honestidad: así el modal deja de fingir que sabe el
   * estado actual, y la autoridad en el momento de pulsar pasa a ser el backend,
   * que es quien de verdad la tiene. Lo que se ve puede estar obsoleto; lo que
   * se ejecuta, no.
   */
  const [snapshot] = useState(() => ({
    esDuena: fila?.role === "duena",
    esYo: fila?.esYo === true,
    sinContrasena: fila?.sinContrasena === true,
    active: fila?.active !== false,
    email: fila?.email ?? "",
  }));

  const [nombre, setNombre] = useState(fila?.name ?? "");
  const [correo, setCorreo] = useState(fila?.email ?? "");
  const [rol, setRol] = useState<Rol>(
    fila?.role === "duena" ? "duena" : "vendedor",
  );

  const [saving, setSaving] = useState(false);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reenvio, setReenvio] = useState<Reenvio>({ estado: "inerte" });
  /** Confirmación previa al cambio de correo propio. Ver el bloque de §8. */
  const [confirmarCorreoPropio, setConfirmarCorreoPropio] = useState(false);

  const correoNormalizado = normalizeEmail(correo);
  const cambiaSuPropioCorreo =
    snapshot.esYo && correoNormalizado !== normalizeEmail(snapshot.email);

  /** Espejo de la validación del backend. NO la sustituye: solo evita gastar
   *  una llamada de red en un campo vacío. El mensaje que se enseña cuando el
   *  backend rechaza sale siempre de `backendMessage`. */
  function validar(): { nombre: string; correo: string } | null {
    const n = nombre.trim().replace(/\s+/g, " ");
    const c = correoNormalizado;
    let ok = true;

    if (n === "") {
      setErrorNombre("El nombre es obligatorio.");
      ok = false;
    } else if (n.length > NOMBRE_MAX) {
      setErrorNombre(`El nombre no puede superar los ${NOMBRE_MAX} caracteres.`);
      ok = false;
    } else setErrorNombre(null);

    if (c === "") {
      setErrorCorreo("El correo es obligatorio.");
      ok = false;
    } else if (c.length > CORREO_MAX) {
      setErrorCorreo(`El correo no puede superar los ${CORREO_MAX} caracteres.`);
      ok = false;
    } else if (!CORREO_RE.test(c)) {
      setErrorCorreo("Escribe un correo electrónico válido.");
      ok = false;
    } else setErrorCorreo(null);

    return ok ? { nombre: n, correo: c } : null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    // Limpia la alerta de backend anterior en cada intento: un error viejo
    // conviviendo con la validación nueva es confuso (auditoría #33).
    setError(null);

    const valido = validar();
    if (valido === null) return;

    // Cambiarse el correo a una misma cierra la sesión. Se avisa ANTES, y este
    // submit no guarda: pinta la confirmación y espera.
    if (esEdicion && cambiaSuPropioCorreo && !confirmarCorreoPropio) {
      setConfirmarCorreoPropio(true);
      return;
    }

    setSaving(true);
    try {
      if (!esEdicion) {
        await guardarAlta(valido.nombre, valido.correo);
      } else {
        await guardarEdicion(valido.nombre, valido.correo);
      }
    } catch (err) {
      setError(
        backendMessage(
          err,
          esEdicion
            ? "No se pudieron guardar los cambios. Inténtalo de nuevo."
            : "No se pudo crear el usuario. Inténtalo de nuevo.",
        ),
      );
      setSaving(false);
      setConfirmarCorreoPropio(false);
    }
  }

  async function guardarAlta(n: string, c: string) {
    const r = await crear({ name: n, email: c, role: rol });
    // El resultado de la invitación lo decide la pantalla: si NO se envió, el
    // aviso tiene que ser persistente y con acción, no un toast de 3 segundos.
    onAlta({ ...r, nombre: n, email: c });
    onCerrar();
  }

  async function guardarEdicion(n: string, c: string) {
    if (fila === null) return;

    const cambios: {
      userId: FilaUsuario["_id"];
      name?: string;
      email?: string;
      role?: Rol;
    } = { userId: fila._id };
    if (n !== fila.name) cambios.name = n;
    if (c !== normalizeEmail(fila.email)) cambios.email = c;
    if (!snapshot.esDuena && rol !== fila.role) cambios.role = rol;

    /**
     * ⚠️ INVARIANTE DE M1 — leer lib/salidaIntencionada.ts antes de tocar esto.
     *
     * La marca va ANTES del `await`. A partir de este punto no existe ningún
     * instante en el que `users.me` pueda pasar a `null` con la marca sin poner,
     * así que da igual si la salida acaba ejecutándola esta pantalla o el efecto
     * de AppShell: los dos calculan el mismo destino.
     *
     * Ponerla DESPUÉS del `await` no serviría de nada: entre medias cabe el
     * efecto, que es justo lo que se está evitando.
     */
    if (cambiaSuPropioCorreo) marcarSalidaIntencionada();

    let salir = false;
    try {
      const r = await actualizar(cambios);
      salir = r.correoCambiado && r.esTuPropiaCuenta;

      if (!salir) {
        onCerrar();
        if (r.correoCambiado) {
          showToast(
            `Correo actualizado. Se cerró la sesión de ${n}` +
              (r.googleDesvinculado > 0
                ? " y se desvinculó su cuenta de Google."
                : "."),
          );
        } else {
          showToast("Cambios guardados.");
        }
      }
    } finally {
      // Si NO hubo salida —error, o el correo no llegó a cambiar— la marca no
      // puede quedarse puesta: enmascararía un "sin acceso" real posterior.
      if (!salir) limpiarSalidaIntencionada();
    }

    if (salir) {
      // `signOut` puede haberlo hecho ya AppShell si ganó la carrera; el catch
      // vacío es deliberado y no oculta nada que importe.
      try {
        await signOut();
      } catch {
        /* ya cerrada */
      }
      router.replace("/login");
    }
  }

  async function pedirReenvio(forzar: boolean) {
    if (fila === null || reenvio.estado === "enviando") return;
    setReenvio({ estado: "enviando" });
    try {
      const r = await reenviarInvitacion({ userId: fila._id, forzar });
      if (r.enviada) {
        setReenvio({ estado: "inerte" });
        showToast(`Invitación enviada a ${fila.email}.`);
        return;
      }
      if (r.motivo === "codigo_vivo") {
        setReenvio({ estado: "confirmar", expiresAt: r.expiresAt });
        return;
      }
      setReenvio({
        estado: "mensaje",
        texto: textoDeInvitacionFallida(r, Date.now()),
        // `no_forzable` significa que esa cuenta YA tiene contraseña. Terminal.
        // `cuota` y `correo` son pasajeros y sí se pueden reintentar.
        reintentable: r.motivo !== "no_forzable",
      });
    } catch (err) {
      // Los rechazos de `contextoReenvio` son ConvexError con el texto ya
      // redactado para quien lo lee (cuenta desactivada, ya tiene contraseña,
      // ya no existe, no tiene cuenta de acceso). No se reescriben aquí.
      //
      // Y NINGUNO de ellos se arregla reintentando: son estados de la cuenta,
      // no fallos pasajeros. Se usa la misma regla que `lib/errores.ts` tiene
      // escrita —ConvexError es un fallo PREVISTO— para decidir que son
      // terminales. Lo que no es ConvexError es un imprevisto (red, servidor) y
      // ahí reintentar sí tiene sentido.
      setReenvio({
        estado: "mensaje",
        texto: backendMessage(
          err,
          "No se pudo reenviar la invitación. Inténtalo de nuevo.",
        ),
        reintentable: !(err instanceof ConvexError),
      });
    }
  }

  const titulo = esEdicion ? "Editar usuario" : "Agregar usuario";

  return (
    <Modal title={titulo} onClose={onCerrar}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Campo
          id="usr-nombre"
          label="Nombre completo"
          value={nombre}
          onChange={setNombre}
          placeholder="Ej. Ana Torres"
          disabled={saving}
          error={errorNombre}
          autoComplete="name"
        />
        <Campo
          id="usr-correo"
          label="Correo electrónico"
          value={correo}
          onChange={setCorreo}
          placeholder="correo@ejemplo.com"
          type="email"
          disabled={saving}
          error={errorCorreo}
          autoComplete="email"
        />

        {esEdicion && <BloqueInvitacion
          snapshot={snapshot}
          reenvio={reenvio}
          onReenviar={() => pedirReenvio(false)}
          onForzar={() => pedirReenvio(true)}
          onDejarlo={() => setReenvio({ estado: "inerte" })}
        />}

        <SelectorRol
          esDuena={snapshot.esDuena}
          rol={rol}
          onElegir={setRol}
          disabled={saving}
        />

        {confirmarCorreoPropio && (
          <div
            role="status"
            className="rounded-md border border-warning-100 bg-warning-50 p-3 text-sm text-text-primary"
          >
            <p className="font-semibold">
              Vas a cambiar tu correo a {correoNormalizado}.
            </p>
            <p className="mt-1 text-text-secondary">
              Se cerrará tu sesión y tendrás que volver a entrar con la dirección
              nueva. Tu contraseña es la misma.
            </p>
          </div>
        )}

        {error !== null && (
          <p role="alert" className="text-sm text-error-600">
            {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (confirmarCorreoPropio) {
                setConfirmarCorreoPropio(false);
                return;
              }
              onCerrar();
            }}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving
              ? "Guardando…"
              : confirmarCorreoPropio
                ? "Cambiar y salir"
                : esEdicion
                  ? "Guardar cambios"
                  : "Crear usuario"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BloqueInvitacion({
  snapshot,
  reenvio,
  onReenviar,
  onForzar,
  onDejarlo,
}: {
  snapshot: { sinContrasena: boolean; active: boolean };
  reenvio: Reenvio;
  onReenviar: () => void;
  onForzar: () => void;
  onDejarlo: () => void;
}) {
  if (!snapshot.sinContrasena) return null;

  /**
   * `contextoReenvio` rechaza una cuenta desactivada con un ConvexError, porque
   * `requestCode`/`resetPassword` comprueban `active` desde el hallazgo A8 y
   * mandar el código sería prometer algo que no va a funcionar. Se dice lo mismo
   * aquí y sin gastar la llamada.
   */
  if (!snapshot.active) {
    return (
      <p className="rounded-md bg-surface-2 p-3 text-sm text-text-secondary">
        Está desactivada. Reactívala para poder enviarle la invitación.
      </p>
    );
  }

  if (reenvio.estado === "confirmar") {
    return (
      <div
        role="status"
        className="rounded-md border border-border bg-surface-2 p-3 text-sm"
      >
        <p className="text-text-primary">
          Ya le enviamos una invitación y sigue siendo válida hasta{" "}
          {formatearCaducidad(reenvio.expiresAt, Date.now())}. Si envías otra, el
          código anterior dejará de funcionar.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onForzar}>
            Enviar otra de todas formas
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDejarlo}>
            Dejarlo así
          </Button>
        </div>
      </div>
    );
  }

  if (reenvio.estado === "mensaje") {
    return (
      <div className="rounded-md border border-border bg-surface-2 p-3 text-sm">
        <p className="text-text-primary">{reenvio.texto}</p>
        {/* Sin acción cuando el estado es terminal. Ver el comentario del tipo
            `Reenvio`: un "Reintentar" aquí llamaría con `forzar: false`, que el
            backend NO guarda contra cuentas que ya tienen contraseña. */}
        {reenvio.reintentable && (
          <div className="mt-2.5">
            <Button type="button" size="sm" variant="secondary" onClick={onReenviar}>
              Reintentar
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 p-3">
      <p className="text-sm text-text-secondary">
        Todavía no ha configurado su contraseña.
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onReenviar}
        disabled={reenvio.estado === "enviando"}
      >
        {reenvio.estado === "enviando" ? "Enviando…" : "Reenviar invitación"}
      </Button>
    </div>
  );
}

/**
 * Selector de rol. Dos notas, las dos del diseño y las dos ciertas:
 *   - editando a la dueña no hay selector, porque `actualizar` lanza "El rol de
 *     la cuenta dueña no se puede cambiar";
 *   - en cualquier otro caso "Dueña" no es elegible, porque a esta pantalla solo
 *     se llega SIENDO la dueña, o sea que siempre hay una.
 *
 * "Dueña" va con `aria-disabled` y no con `disabled`, por lo mismo que la
 * papelera: un `disabled` no es alcanzable y la nota se quedaría sin explicar.
 * La nota es texto visible, no un `title`.
 */
function SelectorRol({
  esDuena,
  rol,
  onElegir,
  disabled,
}: {
  esDuena: boolean;
  rol: Rol;
  onElegir: (r: Rol) => void;
  disabled: boolean;
}) {
  if (esDuena) {
    return (
      <div className="flex flex-col gap-2">
        <span className={labelClass}>Rol</span>
        <p className="rounded-md bg-surface-2 p-2.5 text-sm text-text-secondary">
          El rol de la cuenta dueña no se puede cambiar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={labelClass}>Rol</span>
      <div className="flex flex-wrap gap-2.5">
        <TarjetaRol
          titulo="Dueña"
          descripcion="Acceso completo al sistema"
          elegida={false}
          bloqueada
          onClick={() => {}}
        />
        <TarjetaRol
          titulo="Vendedor"
          descripcion="Gestión de clientes y ventas"
          elegida={rol === "vendedor"}
          bloqueada={disabled}
          onClick={() => onElegir("vendedor")}
        />
      </div>
      <p className="text-sm text-text-secondary">
        El sistema solo permite una cuenta con rol dueña.
      </p>
    </div>
  );
}

function TarjetaRol({
  titulo,
  descripcion,
  elegida,
  bloqueada,
  onClick,
}: {
  titulo: string;
  descripcion: string;
  elegida: boolean;
  bloqueada: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-disabled={bloqueada || undefined}
      aria-pressed={elegida}
      onClick={() => {
        if (bloqueada) return;
        onClick();
      }}
      className={cn(
        "min-w-[8rem] flex-1 rounded-md border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        elegida
          ? "border-info-500 bg-info-50"
          : "border-border bg-surface hover:bg-surface-2",
        bloqueada && "cursor-not-allowed opacity-50 hover:bg-surface",
      )}
    >
      <div className="mb-0.5 text-sm font-semibold text-text-primary">
        {titulo}
      </div>
      <div className="text-xs leading-snug text-text-secondary">
        {descripcion}
      </div>
    </button>
  );
}

function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  error,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled: boolean;
  error: string | null;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label} <span className="text-error-500">*</span>
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={error !== null || undefined}
        aria-describedby={error !== null ? `${id}-error` : undefined}
        className={cn(fieldClass, error !== null && "border-error-500")}
      />
      {error !== null && (
        <p id={`${id}-error`} className="text-sm text-error-600">
          {error}
        </p>
      )}
    </div>
  );
}
