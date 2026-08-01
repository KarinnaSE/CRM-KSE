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

/** Política de contraseñas del CRM. El máximo acota el coste de Scrypt. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Texto de ayuda de la UI. Vive aquí para que no se desvíe de las reglas. */
export const PASSWORD_RULE_TEXT =
  `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, con al menos una mayúscula y un número.`;

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
  return null;
}

/** Igual que `passwordProblem`, pero lanzando. Para el backend. */
export function validatePassword(password: string): void {
  const problema = passwordProblem(password);
  if (problema !== null) throw new Error(problema);
}
