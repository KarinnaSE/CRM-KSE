"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  PASSWORD_RULE_TEXT,
  normalizeEmail,
  passwordProblem,
} from "@/convex/authShared";
import { Button } from "@/components/ui/Button";

/**
 * Pantalla: Login — puerta de entrada obligatoria del MVP (KAR-7).
 * Diseño de referencia: Design/…/Login.dc.html.
 *
 * Inicio de sesión con email + contraseña y con Google (KAR-94). El registro
 * está deshabilitado (backend + UI). Credenciales demo (solo dev):
 * karinnase@gmail.com / Marta2026, karinnaserrano111@gmail.com / Carlos2026.
 *
 * Incluye la recuperación de contraseña por código (KAR-96, rehecha en KAR-100)
 * como pasos DENTRO de esta misma pantalla (no hay ruta nueva): pedir código →
 * introducir código y nueva contraseña. Ya no se usa el flujo de reset de Convex
 * Auth, sino `api.passwordReset` (ver el motivo en convex/passwordReset.ts); como
 * ese flujo no deja sesión iniciada, al terminar se inicia sesión aquí con la
 * contraseña recién puesta y se entra a /seguimientos igual que antes.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

/** Pasos de la pantalla. "signIn" es el estado por defecto. */
type Mode = "signIn" | "requestCode" | "enterCode";

const CODE_LENGTH = 6;

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuthActions();
  const requestCode = useAction(api.passwordReset.requestCode);
  const resetPassword = useAction(api.passwordReset.resetPassword);

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "disabled"
      ? "Tu cuenta no tiene acceso. Contacta al administrador."
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

  /** Vuelve al inicio de sesión limpiando el estado de la recuperación. */
  function backToSignIn() {
    setMode("signIn");
    setCode("");
    setNewPassword("");
    setShowNewPassword(false);
    setError(null);
    setNotice(null);
  }

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
   * Paso 1 — pedir el código: `passwordReset.requestCode` genera el código, lo
   * guarda con caducidad y lo envía por correo, con cuota por correo.
   *
   * A PROPÓSITO el resultado es indistinguible: se avanza al paso del código y se
   * muestra el mismo mensaje aunque el correo no exista, no tenga contraseña
   * (cuenta solo-Google) o se haya agotado la cuota. Así la pantalla no se
   * convierte en un oráculo para averiguar qué correos están dados de alta. El
   * backend refuerza lo mismo: devuelve siempre lo mismo y no escribe nada para
   * un correo desconocido.
   */
  async function requestCodeFor(normalized: string, isResend: boolean) {
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
    // Cada petición invalida el código anterior, así que se limpia el campo para
    // que no quede a la vista un código que ya no sirve.
    setCode("");
    if (!isResend) setNewPassword("");
    setMode("enterCode");
    setNotice(
      isResend
        ? `Te hemos enviado un código nuevo. El anterior ya no es válido.`
        : `Si el correo está dado de alta, te hemos enviado un código de ${CODE_LENGTH} dígitos. Caduca en 15 minutos.`,
    );
  }

  async function onRequestCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const normalized = normalizeEmail(email);
    if (normalized === "") {
      setError("Escribe tu correo electrónico.");
      return;
    }
    await requestCodeFor(normalized, false);
  }

  /** Reenvía el código sin hacer volver al paso anterior. */
  async function onResendCode() {
    if (busy) return;
    const normalized = normalizeEmail(email);
    if (normalized === "") {
      setMode("requestCode");
      return;
    }
    await requestCodeFor(normalized, true);
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
    } catch {
      setError("El código no es válido o ha caducado.");
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
      // `backToSignIn` limpia el error, así que va ANTES de fijarlo.
      backToSignIn();
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
              {mode === "signIn"
                ? "Iniciar sesión"
                : mode === "requestCode"
                  ? "Recuperar contraseña"
                  : "Introduce el código"}
            </h1>
            <p className="mt-1.5 text-base text-text-secondary">
              {mode === "signIn"
                ? "Accede a tu cuenta de KSE CRM."
                : mode === "requestCode"
                  ? "Te enviaremos un código a tu correo para que puedas elegir una contraseña nueva."
                  : "Escribe el código que te enviamos y elige tu contraseña nueva."}
            </p>
          </div>

          {/* ─────────── Paso: iniciar sesión ─────────── */}
          {mode === "signIn" && (
            <>
              <form
                onSubmit={onSubmit}
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
                      onClick={() => {
                        setError(null);
                        setNotice(null);
                        setMode("requestCode");
                      }}
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
                        showPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña"
                      }
                      className="flex h-10 w-10 shrink-0 items-center justify-center text-text-tertiary hover:text-text-secondary"
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
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
                      <Spinner /> Verificando…
                    </>
                  ) : (
                    "Iniciar sesión"
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
                      karinnase@gmail.com / Marta2026
                    </p>
                    <p>
                      <strong className="font-semibold text-text-primary">
                        Carlos:
                      </strong>{" "}
                      karinnaserrano111@gmail.com / Carlos2026
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─────────── Paso: pedir el código ─────────── */}
          {mode === "requestCode" && (
            <form
              onSubmit={onRequestCode}
              noValidate
              className="flex flex-col gap-[18px]"
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="reset-email"
                  className="text-sm font-medium text-text-primary"
                >
                  Correo electrónico
                </label>
                <input
                  id="reset-email"
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

              <Button
                type="submit"
                variant="primary"
                disabled={busy}
                className="mt-1 h-12 w-full text-base"
              >
                {resetLoading ? (
                  <>
                    <Spinner /> Enviando…
                  </>
                ) : (
                  "Enviarme el código"
                )}
              </Button>

              <button
                type="button"
                onClick={backToSignIn}
                disabled={busy}
                className="text-sm font-medium text-text-secondary underline-offset-2 hover:underline disabled:opacity-60"
              >
                Volver al inicio de sesión
              </button>
            </form>
          )}

          {/* ─────────── Paso: código + contraseña nueva ─────────── */}
          {mode === "enterCode" && (
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
                  placeholder="000000"
                  className="h-10 rounded-md border border-border bg-surface px-3 text-center text-lg tracking-[0.3em] text-text-primary outline-none placeholder:tracking-[0.3em] placeholder:text-text-tertiary focus:border-interactive focus:ring-2 focus:ring-focus-ring disabled:opacity-60"
                />
              </div>

              {/* Contraseña nueva */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="new-password"
                  className="text-sm font-medium text-text-primary"
                >
                  Contraseña nueva
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
                  onClick={backToSignIn}
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
