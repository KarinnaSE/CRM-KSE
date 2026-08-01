/**
 * Helpers de autenticación COMPARTIDOS entre el backend (convex/) y la pantalla
 * de login (KAR-100). NO son funciones Convex de red: es código puro, sin `ctx`
 * ni acceso a la base de datos, precisamente para poder importarlo también desde
 * el cliente y que la UI y el servidor nunca se desincronicen.
 *
 * Antes había dos copias de `normalizeEmail` (convex/auth.ts y la pantalla de
 * login) que había que mantener a mano en sincronía. Ahora vive aquí una sola.
 */

/**
 * Normaliza un correo para comparar de forma consistente (trim + minúsculas).
 *
 * Convex Auth NO normaliza `providerAccountId`: compara la cadena tal cual. Las
 * cuentas se provisionan en minúsculas, así que sin esto un correo escrito con
 * mayúsculas o con un espacio delante no encontraría su cuenta.
 */
export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * Forma del código de recuperación. Vive AQUÍ, y no en convex/passwordResetEmail.ts,
 * porque la pantalla de login también necesita la longitud para validar el campo
 * antes de llamar al backend — y ese archivo importa `./email`, que habla con
 * Resend: arrastrarlo al bundle del cliente sería meter el transporte de correo
 * en el navegador. Este módulo es puro y no importa nada.
 *
 * Antes la pantalla declaraba su PROPIO `const CODE_LENGTH = 6`. Con dos copias,
 * cambiar la longitud en el backend dejaba la validación de la UI rechazando
 * códigos correctos, sin que fallara ni el build ni los tipos.
 *
 * 8 dígitos, no 6 (auditoría de login, hallazgo A3). Con 10^6 códigos posibles y
 * un contador de intentos que se recarga, un atacante paciente acumula ~720
 * intentos al día: alrededor de un 2 % de éxito al mes. Con 10^8 eso baja al
 * 0,02 %. Se amplía el espacio en vez de recortar intentos A PROPÓSITO, porque
 * un cupo de intentos que se agota es algo que el atacante puede vaciar para
 * dejar a la usuaria sin recuperación — que es justo el agujero que cierra esta
 * ronda. Ver el razonamiento completo en convex/passwordReset.ts.
 */
export const CODE_LENGTH = 8;
export const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Vida del código de INVITACIÓN, que es distinta a propósito (KAR-54).
 *
 * Una recuperación la acaba de pedir la propia persona, con el navegador
 * abierto: 15 minutos le sobran. Una invitación no la espera nadie, y encima
 * viaja peor — las pasarelas corporativas la retienen para escanearla, el
 * greylisting la retrasa y una cuarentena puede quedársela horas. Con 15
 * minutos, el código caducaría EN TRÁNSITO y la persona recibiría un correo ya
 * inútil.
 *
 * 24 horas NO debilitan nada. Los intentos se recargan a razón de 5 cada 10
 * minutos (ver convex/passwordReset.ts), o sea unos 720 al día, y contra los
 * 10^8 códigos posibles eso es alrededor de un 0,0007 % en toda la ventana. La
 * cuota de 3 emisiones cada 15 minutos por correo sigue topando el volumen.
 *
 * La contrapartida —que un correo perdido bloquee la emisión del siguiente
 * durante un día, por la regla del código sagrado— la resuelve el reenvío
 * forzado de la dueña (`users.reenviarInvitacion`), que está acotado a
 * invitaciones pendientes.
 */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Política de contraseñas del CRM. El máximo acota el coste de Scrypt.
 *
 * El mínimo subió de 8 a 12 (auditoría de login, hallazgo A5). Con 8 y el límite
 * de 10 intentos por hora de Convex Auth quedaban 240 pruebas al día contra una
 * contraseña corta, y las cuentas de este CRM son de dos personas con rol dueña y
 * vendedor: no hay volumen que justifique aflojar.
 *
 * OJO — subir el mínimo NO deja fuera a nadie: `validatePasswordRequirements`
 * solo se invoca en los flujos `signUp` y `reset-verification`
 * (providers/Password.js), nunca en `signIn`. Las contraseñas que ya existen
 * siguen sirviendo para entrar; la política aplica a las nuevas.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Contraseñas y raíces prohibidas, en minúsculas.
 *
 * Lista corta y honesta a propósito. NO es una comprobación contra bases de
 * contraseñas filtradas: eso exigiría una llamada de red desde el backend en
 * mitad del cambio de contraseña y no es proporcionado aquí. Lo que sí cubre es
 * lo que de verdad se usa en un sistema pequeño: el nombre del producto, el de
 * las personas que lo usan y los teclados.
 *
 * El motivo de incluir `marta`, `carlos`, `kse` y `crm` es concreto: las
 * credenciales de desarrollo de este repositorio han sido `Marta2026` y
 * `Carlos2026`, que cumplían la política anterior al pie de la letra y siguen un
 * patrón adivinable ligado por nombre a las cuentas reales de producción.
 */
const PASSWORD_DENYLIST = [
  "password",
  "contrasena",
  "contraseña",
  "qwerty",
  "123456",
  "abc123",
  "letmein",
  "admin",
  "marta",
  "carlos",
  "kse",
  "crm",
];

/** Texto de ayuda de la UI. Vive aquí para que no se desvíe de las reglas. */
export const PASSWORD_RULE_TEXT =
  `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, con al menos una mayúscula y un ` +
  `número. No puede contener tu nombre ni el del CRM.`;

/**
 * Devuelve el problema de la contraseña, o `null` si es válida.
 *
 * Se expone en dos formas a propósito: `passwordProblem` para que la UI pinte el
 * mensaje y habilite/deshabilite el botón sin envolver nada en try/catch, y
 * `validatePassword` (que lanza) para encajar con la firma
 * `validatePasswordRequirements` que espera el proveedor Password.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  // `\p{Lu}` (en vez de [A-Z]) para que una mayúscula acentuada —Á, Ñ— también
  // cuente. Requiere el flag `u`.
  if (!/\p{Lu}/u.test(password)) {
    return "La contraseña debe incluir al menos una letra mayúscula.";
  }
  if (!/\d/.test(password)) {
    return "La contraseña debe incluir al menos un número.";
  }
  // Se compara en minúsculas y por INCLUSIÓN, no por igualdad: lo que se quiere
  // atajar es `Marta2026`, no solo `marta`.
  const enMinusculas = password.toLowerCase();
  if (PASSWORD_DENYLIST.some((prohibida) => enMinusculas.includes(prohibida))) {
    return (
      "Esa contraseña es demasiado fácil de adivinar: no puede contener tu " +
      "nombre, el del CRM ni una palabra común."
    );
  }
  return null;
}

/** Igual que `passwordProblem`, pero lanzando. Para el backend. */
export function validatePassword(password: string): void {
  const problema = passwordProblem(password);
  if (problema !== null) throw new Error(problema);
}
