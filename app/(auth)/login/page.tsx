"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CODE_LENGTH,
  PASSWORD_RULE_TEXT,
  normalizeEmail,
  passwordProblem,
} from "@/convex/authShared";
import { backendMessage } from "@/lib/errores";
import { Button } from "@/components/ui/Button";

/**
 * Pantalla: Login — puerta de entrada obligatoria del MVP (KAR-7).
 * Diseño de referencia: Design/…/Login.dc.html.
 *
 * Inicio de sesión con email + contraseña y con Google (KAR-94). El registro
 * está deshabilitado (backend + UI). Credenciales demo (solo dev):
 * karinnase@gmail.com / Seguimiento7Azul,
 * karinnaserrano111@gmail.com / Propuesta4Verde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOGIN EN DOS PASOS (KAR-111). Primero se pide el correo y SOLO el correo;
 * después, según lo que devuelva `passwordReset.iniciarAcceso`, se pide la
 * contraseña o se manda a configurar la primera con un código.
 *
 * Existe porque antes, para poner su PRIMERA contraseña, una persona recién
 * invitada tenía que pulsar "¿Olvidaste tu contraseña?". No había olvidado nada,
 * y de paso se le enseñaba a pinchar enlaces de recuperación, que es el reflejo
 * que explota el phishing.
 *
 * LO QUE SOSTIENE LA SEGURIDAD DE ESTA PANTALLA, y hay que respetarlo al tocarla:
 *
 *   1. Los tres casos no reveladores —correo desconocido, correo con contraseña
 *      y cuenta desactivada— llevan al MISMO paso y muestran el MISMO texto. Si
 *      alguno se separa, este formulario pasa a ser un directorio de quién tiene
 *      cuenta en el CRM.
 *   2. El fallo del paso de la contraseña es genérico ("Correo o contraseña
 *      incorrectos"). Es lo que hace que una cuenta inexistente y una
 *      desactivada se confundan con una contraseña mal escrita.
 *   3. Si `iniciarAcceso` falla, se cae al paso de la contraseña. Fail-closed
 *      aquí significa "la rama que no cuenta nada".
 *
 * Toda la recuperación por código (KAR-96, rehecha en KAR-100) sigue viviendo
 * DENTRO de esta pantalla, no en una ruta aparte. No se usa el flujo de reset de
 * Convex Auth sino `api.passwordReset` (ver el motivo en convex/passwordReset.ts);
 * como ese flujo no deja sesión iniciada, al terminar se inicia sesión aquí con
 * la contraseña recién puesta y se entra a /seguimientos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

/**
 * Pasos de la pantalla. "email" es el estado por defecto (KAR-111).
 *
 *   email       Solo se pide el correo. Con la respuesta de `iniciarAcceso` se
 *               decide a cuál de los dos siguientes se va.
 *   password    Quien ya tiene contraseña. Desde aquí sale la recuperación.
 *   invitacion  Quien NUNCA ha tenido contraseña: código + elegir la primera.
 *   enterCode   Recuperación de toda la vida: código + contraseña nueva.
 *
 * "invitacion" y "enterCode" comparten formulario y manejador —los dos llaman a
 * `resetPassword`— y solo cambian los textos. Es a propósito: dos copias de la
 * pantalla que fija contraseñas se desincronizarían al primer arreglo. Pero los
 * TEXTOS no se comparten, porque el objetivo de KAR-111 es justamente que a
 * quien entra por primera vez no se le hable de olvidar ni de recuperar nada.
 */
type Mode = "email" | "password" | "invitacion" | "enterCode";

/** Los dos pasos que piden código. Comparten formulario, no palabras. */
const esPasoDeCodigo = (m: Mode) => m === "invitacion" || m === "enterCode";

// `CODE_LENGTH` se IMPORTA de convex/authShared.ts. Antes esta pantalla
// declaraba su propio `const CODE_LENGTH = 6`, así que al cambiar la longitud en
// el backend la validación de aquí seguía exigiendo 6 y rechazaba códigos
// correctos, sin que fallara el build ni los tipos.
//
// LA CADUCIDAD YA NO SE ANUNCIA AQUÍ, y es a propósito (KAR-54). Desde que
// existen las invitaciones hay DOS plazos: 15 minutos para un código de
// recuperación y 24 horas para uno de invitación (CODE_TTL_MS e INVITE_TTL_MS).
// Esta pantalla no sabe —ni debe saber, porque delataría el estado de la
// cuenta— cuál de los dos tiene delante, así que anunciar un número concreto
// sería mentir a la mitad de la gente. El plazo lo dice el propio correo, que sí
// lo sabe con certeza.

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuthActions();
  const iniciarAcceso = useAction(api.passwordReset.iniciarAcceso);
  const requestCode = useAction(api.passwordReset.requestCode);
  const resetPassword = useAction(api.passwordReset.resetPassword);

  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  /**
   * Aviso de que la sesión terminó sola (KAR-112). El texto es NEUTRO a
   * propósito y no dice por qué: es cierto tanto si la sesión se revocó o
   * caducó como si desactivaron la cuenta —desactivar corta la sesión—, y
   * detallar el motivo aquí chocaría con la opacidad del login (ver el catch
   * del `signIn`, más abajo).
   *
   * El texto que había antes, "Tu cuenta no tiene acceso", salía sobre todo en
   * cierres de sesión NORMALES, donde era falso. Quien decide este destino es
   * `destinoDeSalida()` en lib/salidaIntencionada.ts; aquí solo se pinta.
   *
   * `disabled` es el valor ANTIGUO y se sigue aceptando durante la transición:
   * puede quedar alguna pestaña con ese enlace ya en vuelo, y es mejor que
   * enseñe el texto nuevo —cierto— que el viejo. Retirarlo es follow-up.
   */
  const motivoDeSalida = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    motivoDeSalida === "sesion" || motivoDeSalida === "disabled"
      ? "Tu sesión se cerró. Vuelve a entrar."
      : null,
  );

  // ── Estado de la recuperación de contraseña (KAR-96) ──
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Cualquier flujo en curso (contraseña, Google o recuperación) bloquea a los demás.
  const busy = loading || googleLoading || resetLoading;

  const codeIsComplete = new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
  // Misma política que el backend, importada de convex/authShared.ts para que no
  // puedan desviarse la una de la otra.
  const newPasswordProblem = passwordProblem(newPassword);

  /** Vuelve al primer paso, limpiando todo lo que dependía del correo. */
  function backToEmail() {
    setMode("email");
    setPassword("");
    setShowPassword(false);
    setCode("");
    setNewPassword("");
    setShowNewPassword(false);
    setError(null);
    setNotice(null);
  }

  /**
   * Paso 1 — el correo, y solo el correo.
   *
   * `iniciarAcceso` responde "password" o "codigo". El reparto está pensado para
   * que esta pantalla NO sea un directorio de quién tiene cuenta: un correo
   * desconocido, uno con contraseña y uno desactivado devuelven exactamente lo
   * mismo, así que probar direcciones al azar no distingue nada. Ver el
   * razonamiento completo en convex/passwordReset.ts.
   *
   * Si la llamada falla, se va a "password". Es la caída fail-closed: es la rama
   * que no revela nada, y quien de verdad tenga contraseña podrá entrar igual.
   */
  async function onSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const normalized = normalizeEmail(email);
    if (normalized === "") {
      setError("Escribe tu correo electrónico.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { paso } = await iniciarAcceso({ email: normalized });
      if (paso === "codigo") {
        setMode("invitacion");
        setNotice(
          "Te hemos enviado un código a tu correo para que elijas tu contraseña.",
        );
      } else {
        setMode("password");
      }
    } catch (e) {
      console.error(
        "Fallo al comprobar el acceso:",
        e instanceof Error ? e.message : String(e),
      );
      setMode("password");
    }
    setLoading(false);
  }

  /** Paso 2a — la contraseña de quien ya la tiene. */
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setLoading(true);
    setError(null);
    try {
      await signIn("password", {
        email: normalizeEmail(email),
        password,
        flow: "signIn",
      });
      router.replace("/seguimientos");
    } catch {
      // Mensaje GENÉRICO, y de él depende media seguridad de KAR-111: es lo que
      // hace que un correo sin cuenta y una cuenta desactivada sean
      // indistinguibles de una contraseña mal escrita. No detallar nunca.
      setError("Correo o contraseña incorrectos.");
      setLoading(false);
    }
  }

  // Login con Google (KAR-94). `signIn("google")` hace una redirección de página
  // completa al proveedor; el catch cubre errores al iniciar el flujo. El acceso
  // solo se concede a correos ya provisionados (la política vive en el backend);
  // una cuenta no autorizada regresa sin sesión y el middleware la deja en /login.
  async function onGoogle() {
    if (busy) return;
    setGoogleLoading(true);
    setError(null);
    try {
      await signIn("google");
    } catch {
      setError("No se pudo iniciar sesión con Google. Inténtalo de nuevo.");
      setGoogleLoading(false);
    }
  }

  /**
   * Paso 1 — pedir el código: `passwordReset.requestCode` emite un código, lo
   * guarda con caducidad y lo envía por correo.
   *
   * "Emite" y no "genera siempre": si la cuenta ya tiene un código vivo, el
   * backend NO lo rota ni manda otro, y el que la usuaria tiene en el buzón sigue
   * sirviendo. Eso es lo que impide que un desconocido invalide sin parar el
   * código ajeno (hallazgo A1, ver convex/passwordReset.ts). Desde aquí el caso
   * es indistinguible de un envío, y así debe seguir.
   *
   * A PROPÓSITO el resultado es indistinguible: se avanza al paso del código y se
   * muestra el mismo mensaje aunque el correo no exista, no tenga contraseña
   * (cuenta solo-Google) o se haya agotado la cuota. Así la pantalla no se
   * convierte en un oráculo para averiguar qué correos están dados de alta. El
   * backend refuerza lo mismo: devuelve siempre lo mismo y no escribe nada para
   * un correo desconocido.
   *
   * Y ese mensaje se AFIRMA, sin condicionales (KAR-105): "te hemos enviado un
   * código", no "si el correo está dado de alta, te hemos enviado un código".
   * Un condicional no filtra nada por sí mismo —sigue siendo el mismo texto en
   * todos los casos—, pero le cuenta a quien lo lea que estar dado de alta es un
   * requisito, que es justo lo que este flujo procura no airear.
   */
  async function pedirCodigoDeRecuperacion(
    normalized: string,
    isResend: boolean,
  ) {
    setResetLoading(true);
    setError(null);
    try {
      await requestCode({ email: normalized });
    } catch (e) {
      // La PANTALLA calla a propósito (ver el comentario del bloque), pero el
      // error sí se registra: si no, una mala configuración del correo es
      // invisible y el soporte se vuelve adivinación. No abre un oráculo de
      // enumeración porque la acción NUNCA lanza por "el correo no existe" —
      // ese caso devuelve lo mismo que un envío correcto. Aquí solo caben
      // fallos de red, de Resend o del pepper.
      // Solo el mensaje, no el objeto entero: un error serializado completo
      // arrastra la traza y lo que haya devuelto el proveedor, y esto acaba en
      // la consola del navegador de la usuaria.
      console.error(
        "Fallo al solicitar el código de recuperación:",
        e instanceof Error ? e.message : String(e),
      );
    }
    setResetLoading(false);
    // Se limpia el campo por higiene, no porque el código anterior haya dejado de
    // servir: desde el arreglo del hallazgo A1 una petición nueva ya NO invalida
    // un código vivo.
    setCode("");
    if (!isResend) {
      setNewPassword("");
      setMode("enterCode");
    }
    setNotice(
      isResend
        ? // Este mensaje decía "El anterior ya no es válido", y desde el arreglo
          // de A1 eso es FALSO: si el código anterior sigue vivo, es justo el que
          // hay que usar, porque no se emite otro. Decirle a alguien que tire un
          // código que funciona es peor que no decirle nada.
          //
          // La redacción de ahora es cierta en los dos casos —haya código nuevo o
          // siga valiendo el viejo— y no filtra nada: habla del buzón de quien
          // pregunta, no de si la cuenta existe.
          `Revisa tu correo. Si ya tenías un código sin usar, sigue siendo válido.`
        : // Sin plazo en el texto, por lo explicado arriba en CODE_LENGTH: hay
          // dos caducidades posibles y esta pantalla no distingue cuál aplica.
          // Se mantiene la forma AFIRMATIVA de KAR-105 y se añade el caso del
          // código vivo, que aquí es indistinguible de un envío nuevo.
          `Te hemos enviado un código de ${CODE_LENGTH} dígitos a tu correo. Si ya tenías uno sin usar, ese sigue siendo el válido.`,
    );
  }

  /**
   * "¿Olvidaste tu contraseña?", desde el paso de la contraseña. Aquí la frase
   * SÍ es cierta: quien llega a este paso tiene una contraseña que olvidar.
   *
   * Ya no hay un paso intermedio que vuelva a pedir el correo: lo tenemos del
   * paso 1.
   */
  async function onOlvideLaContrasena() {
    if (busy) return;
    const normalized = normalizeEmail(email);
    if (normalized === "") {
      backToEmail();
      return;
    }
    await pedirCodigoDeRecuperacion(normalized, false);
  }

  /**
   * Reenviar, desde cualquiera de los dos pasos que piden código.
   *
   * OJO CON ESTA RAMA, que es fácil de "simplificar" mal: el reenvío de una
   * INVITACIÓN no puede llamar a `requestCode`. Eso mandaría el correo de
   * RECUPERACIÓN —con su "recupera tu contraseña" y su "si no pediste este
   * cambio, tu contraseña actual sigue siendo válida"— a alguien que nunca ha
   * tenido contraseña, y reintroduciría por la puerta de atrás exactamente el
   * texto que KAR-111 viene a quitar. Se llama a `iniciarAcceso`, que es quien
   * manda la invitación.
   */
  async function onResendCode() {
    if (busy) return;
    const normalized = normalizeEmail(email);
    if (normalized === "") {
      backToEmail();
      return;
    }

    if (mode === "invitacion") {
      setResetLoading(true);
      setError(null);
      try {
        await iniciarAcceso({ email: normalized });
      } catch (e) {
        console.error(
          "Fallo al reenviar la invitación:",
          e instanceof Error ? e.message : String(e),
        );
      }
      setResetLoading(false);
      setCode("");
      // Cierto en los dos casos: haya salido uno nuevo o siga vivo el anterior.
      setNotice(
        "Revisa tu correo. Si ya te habíamos enviado un código sin usar, sigue siendo válido.",
      );
      return;
    }

    await pedirCodigoDeRecuperacion(normalized, true);
  }

  /**
   * Paso 2 — verificar el código y cambiar la contraseña.
   *
   * `resetPassword` cambia la contraseña e invalida TODAS las sesiones, pero no
   * deja ninguna abierta. Por eso a continuación se inicia sesión con la
   * contraseña recién puesta: se entra directo, igual que antes, sin tener que
   * replicar aquí el manejo de tokens y cookies que el proxy de Next ya hace
   * para `auth:signIn`.
   */
  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!codeIsComplete) {
      setError(`El código debe tener ${CODE_LENGTH} dígitos.`);
      return;
    }
    if (newPasswordProblem !== null) {
      setError(newPasswordProblem);
      return;
    }
    const normalized = normalizeEmail(email);
    setResetLoading(true);
    setError(null);
    setNotice(null);
    try {
      await resetPassword({ email: normalized, code, newPassword });
    } catch (e) {
      // Antes esto era `catch { setError("El código no es válido…") }`, que le
      // echaba la culpa al código pasara lo que pasara: un corte de red, un
      // pepper mal puesto o Convex caído se le presentaban a la usuaria como
      // "tu código no vale", que es justo el consejo contrario al que necesita.
      //
      // Ahora manda el backend: si el fallo es previsto llega como ConvexError
      // con su mensaje, y si no, se usa el genérico. Ver lib/errores.ts.
      //
      // El genérico dice "pide un código nuevo" a propósito. Hay un caso que
      // desde aquí no se puede distinguir: si la petición llegó y consumió el
      // código pero la respuesta se perdió por el camino, el código ya no sirve
      // aunque el fallo pareciera de red. Pedir otro es el consejo correcto en
      // los dos casos.
      setError(
        backendMessage(
          e,
          "No pudimos cambiar tu contraseña. Revisa tu conexión e inténtalo " +
            "de nuevo; si vuelve a fallar, pide un código nuevo.",
        ),
      );
      setResetLoading(false);
      return;
    }
    // La contraseña YA está cambiada. Si el inicio de sesión automático fallara
    // (un corte de red justo aquí), no se puede decir que el código sea inválido:
    // se manda a iniciar sesión a mano con la contraseña nueva.
    try {
      await signIn("password", {
        email: normalized,
        password: newPassword,
        flow: "signIn",
      });
      router.replace("/seguimientos");
    } catch {
      setResetLoading(false);
      // `backToEmail` limpia el error, así que va ANTES de fijarlo.
      backToEmail();
      setError(
        "Tu contraseña se cambió correctamente, pero no pudimos iniciar tu " +
          "sesión. Inicia sesión con tu contraseña nueva.",
      );
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Panel de marca (solo escritorio) ── */}
      <div
        aria-hidden
        className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden p-14 md:flex"
        style={{ backgroundColor: "var(--brand-950)" }}
      >
        <div className="relative z-10 max-w-xs text-center">
          <div className="text-6xl font-bold leading-none tracking-tight text-white">
            KSE
          </div>
          <div
            className="mt-1.5 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: "var(--brand-300)" }}
          >
            CRM
          </div>
          <div
            className="mx-auto my-6 h-[3px] w-12 rounded-full"
            style={{ backgroundColor: "var(--brand-500)" }}
          />
          <p className="text-xl font-normal leading-snug text-white">
            Tu negocio,
            <br />
            <strong className="font-bold" style={{ color: "var(--brand-300)" }}>
              bajo control.
            </strong>
          </p>
          <p className="mt-3.5 text-sm leading-relaxed text-neutral-400">
            Gestiona clientes, da seguimiento a oportunidades y cierra más
            ventas — desde donde estés.
          </p>
        </div>
        <p className="absolute bottom-6 text-[11px] text-neutral-600">
          KSE CRM © 2026
        </p>
      </div>

      {/* ── Panel del formulario ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-surface px-6 py-16">
        <div className="w-full max-w-sm">
          {/* Logo (solo móvil) */}
          <div className="mb-10 md:hidden">
            <div className="text-2xl font-bold leading-none tracking-tight text-interactive">
              KSE
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
              CRM
            </div>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-bold text-text-primary">
              {mode === "invitacion"
                ? "Configura tu contraseña"
                : mode === "enterCode"
                  ? "Introduce el código"
                  : "Iniciar sesión"}
            </h1>
            {/* Los textos de "invitacion" y "enterCode" son DISTINTOS a propósito
                aunque el formulario sea el mismo: a quien entra por primera vez
                no se le habla de olvidar, recuperar ni restablecer nada, porque
                no ha perdido nada. Es el motivo de ser de KAR-111. */}
            <p className="mt-1.5 text-base text-text-secondary">
              {mode === "email"
                ? "Escribe tu correo para continuar."
                : mode === "password"
                  ? "Escribe tu contraseña para entrar."
                  : mode === "invitacion"
                    ? "Es la primera vez que entras, así que todavía no tienes contraseña. Te hemos enviado un código para que elijas la tuya."
                    : "Escribe el código que te enviamos y elige tu contraseña nueva."}
            </p>
          </div>

          {/* ─────────── Paso 1: el correo, y solo el correo ─────────── */}
          {mode === "email" && (
            <>
              <form
                onSubmit={onSubmitEmail}
                noValidate
                className="flex flex-col gap-[18px]"
              >
                {/* Correo */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium text-text-primary"
                  >
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    disabled={busy}
                    placeholder="tu@correo.com"
                    className="h-10 rounded-md border border-border bg-surface px-3 text-base text-text-primary outline-none placeholder:text-text-tertiary focus:border-interactive focus:ring-2 focus:ring-focus-ring disabled:opacity-60"
                  />
                </div>

                {error && <ErrorBanner message={error} />}

                {/* Submit */}
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy}
                  className="mt-1 h-12 w-full text-base"
                >
                  {loading ? (
                    <>
                      <Spinner /> Comprobando…
                    </>
                  ) : (
                    "Continuar"
                  )}
                </Button>
              </form>

              {/* Separador */}
              <div className="my-5 flex items-center gap-3" aria-hidden>
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  o
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Continuar con Google (KAR-94) */}
              <button
                type="button"
                onClick={onGoogle}
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-md border border-border bg-surface text-base font-medium text-text-primary transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                {googleLoading ? <Spinner dark /> : <GoogleIcon />}
                {googleLoading ? "Conectando…" : "Continuar con Google"}
              </button>

              {/* Pista de credenciales demo (SOLO desarrollo). Se inlinea el chequeo
                  de NODE_ENV para que la eliminación de código muerto la borre por
                  completo del bundle de producción (no solo evitar el render). */}
              {process.env.NODE_ENV !== "production" && (
                <div className="mt-7 rounded-md border border-brand-100 bg-brand-50 px-4 py-3.5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
                    Credenciales de prueba (solo desarrollo)
                  </p>
                  <div className="flex flex-col gap-1 text-sm text-text-secondary">
                    <p>
                      <strong className="font-semibold text-text-primary">
                        Marta:
                      </strong>{" "}
                      karinnase@gmail.com / Seguimiento7Azul
                    </p>
                    <p>
                      <strong className="font-semibold text-text-primary">
                        Carlos:
                      </strong>{" "}
                      karinnaserrano111@gmail.com / Propuesta4Verde
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─────────── Paso 2a: la contraseña ─────────── */}
          {mode === "password" && (
            <form
              onSubmit={onSubmit}
              noValidate
              className="flex flex-col gap-[18px]"
            >
              {/* EL CAMPO DE CORREO SIGUE AQUÍ, y no es decorativo.
                  Un login en dos pasos rompe los gestores de contraseñas si el
                  formulario de la contraseña no lleva también el usuario: muchos
                  dejan de ofrecer el autorrelleno o guardan la entrada sin saber
                  a quién pertenece. Va de solo lectura, en el mismo <form> que la
                  contraseña y con autoComplete="username", que es lo que esperan.
                  Para cambiarlo está el botón de al lado. */}
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <label
                    htmlFor="email-fijo"
                    className="text-sm font-medium text-text-primary"
                  >
                    Correo electrónico
                  </label>
                  <button
                    type="button"
                    onClick={backToEmail}
                    disabled={busy}
                    className="text-sm font-medium text-interactive underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    Cambiar
                  </button>
                </div>
                <input
                  id="email-fijo"
                  type="email"
                  autoComplete="username"
                  value={email}
                  readOnly
                  className="h-10 rounded-md border border-border bg-surface-2 px-3 text-base text-text-secondary outline-none"
                />
              </div>

              {/* Contraseña */}
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-text-primary"
                  >
                    Contraseña
                  </label>
                  <button
                    type="button"
                    onClick={onOlvideLaContrasena}
                    disabled={busy}
                    className="text-sm font-medium text-interactive underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="flex items-center overflow-hidden rounded-md border border-border bg-surface focus-within:border-interactive focus-within:ring-2 focus-within:ring-focus-ring">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    disabled={busy}
                    placeholder="••••••••"
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 text-base text-text-primary outline-none placeholder:text-text-tertiary disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    className="flex h-10 w-10 shrink-0 items-center justify-center text-text-tertiary hover:text-text-secondary"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {error && <ErrorBanner message={error} />}

              <Button
                type="submit"
                variant="primary"
                disabled={busy}
                className="mt-1 h-12 w-full text-base"
              >
                {loading || resetLoading ? (
                  <>
                    <Spinner /> Verificando…
                  </>
                ) : (
                  "Iniciar sesión"
                )}
              </Button>
            </form>
          )}

          {/* ─────────── Paso 2b: código + contraseña ───────────
              Un solo formulario para la invitación y para la recuperación: los
              dos llaman a `resetPassword` y comparten toda la lógica. Lo único
              que se bifurca son las palabras. */}
          {esPasoDeCodigo(mode) && (
            <form
              onSubmit={onVerifyCode}
              noValidate
              className="flex flex-col gap-[18px]"
            >
              {notice && (
                <div
                  role="status"
                  className="rounded-md border border-brand-100 bg-brand-50 px-3.5 py-3"
                >
                  <p className="text-sm leading-relaxed text-brand-700">
                    {notice}
                  </p>
                </div>
              )}

              {/* Código */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="code"
                  className="text-sm font-medium text-text-primary"
                >
                  Código de {CODE_LENGTH} dígitos
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={CODE_LENGTH}
                  value={code}
                  onChange={(e) => {
                    // Solo dígitos: evita que un pegado con espacios o guiones
                    // invalide un código correcto.
                    setCode(
                      e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH),
                    );
                    setError(null);
                  }}
                  disabled={busy}
                  placeholder={"0".repeat(CODE_LENGTH)}
                  className="h-10 rounded-md border border-border bg-surface px-3 text-center text-lg tracking-[0.3em] text-text-primary outline-none placeholder:tracking-[0.3em] placeholder:text-text-tertiary focus:border-interactive focus:ring-2 focus:ring-focus-ring disabled:opacity-60"
                />
              </div>

              {/* Contraseña nueva */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="new-password"
                  className="text-sm font-medium text-text-primary"
                >
                  {mode === "invitacion" ? "Tu contraseña" : "Contraseña nueva"}
                </label>
                <div className="flex items-center overflow-hidden rounded-md border border-border bg-surface focus-within:border-interactive focus-within:ring-2 focus-within:ring-focus-ring">
                  <input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setError(null);
                    }}
                    disabled={busy}
                    placeholder="••••••••"
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 text-base text-text-primary outline-none placeholder:text-text-tertiary disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    aria-label={
                      showNewPassword
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                    className="flex h-10 w-10 shrink-0 items-center justify-center text-text-tertiary hover:text-text-secondary"
                  >
                    {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                <p className="text-xs text-text-tertiary">
                  {PASSWORD_RULE_TEXT}
                </p>
              </div>

              {error && <ErrorBanner message={error} />}

              <Button
                type="submit"
                variant="primary"
                disabled={
                  busy || !codeIsComplete || newPasswordProblem !== null
                }
                className="mt-1 h-12 w-full text-base"
              >
                {resetLoading ? (
                  <>
                    <Spinner /> Guardando…
                  </>
                ) : mode === "invitacion" ? (
                  "Guardar contraseña y entrar"
                ) : (
                  "Cambiar contraseña y entrar"
                )}
              </Button>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onResendCode}
                  disabled={busy}
                  className="text-sm font-medium text-interactive underline-offset-2 hover:underline disabled:opacity-60"
                >
                  Reenviar código
                </button>
                <button
                  type="button"
                  onClick={backToEmail}
                  disabled={busy}
                  className="text-sm font-medium text-text-secondary underline-offset-2 hover:underline disabled:opacity-60"
                >
                  Volver al inicio de sesión
                </button>
              </div>
            </form>
          )}

          <p className="mt-7 text-center text-xs text-text-tertiary">
            KSE CRM © 2026
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Piezas de UI ───────────── */

/** Banner de error compartido por los tres pasos. */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-error-200 bg-error-50 px-3.5 py-3"
    >
      <span className="mt-0.5 shrink-0 text-error-600">
        <AlertIcon />
      </span>
      <p className="text-sm leading-relaxed text-error-700">{message}</p>
    </div>
  );
}

/* ───────────── Iconos ───────────── */

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={
        dark
          ? "h-[18px] w-[18px] animate-spin rounded-full border-2 border-text-tertiary/40 border-t-text-secondary"
          : "h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/35 border-t-white"
      }
      aria-hidden
    />
  );
}

/* Logo de Google (multicolor oficial). */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
