import {
  action,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { INVITE_TTL_MS, normalizeEmail } from "./authShared";
import { currentActiveUser, requireOwner } from "./authz";
import { hashCode, MAX_VERIFY_ATTEMPTS } from "./passwordReset";
import { generateNumericCode } from "./passwordResetEmail";
import { sendInvitationEmail } from "./invitationEmail";

/**
 * Entidad Usuario y su GESTIÓN (KAR-54 / KAR-55 / KAR-89).
 *
 * Toda función de este archivo empieza por `requireOwner` salvo `me`, que es la
 * sonda de sesión y cuyo contrato es devolver `null` para quien no ha entrado.
 * Esa es la garantía real de "solo la dueña"; que la pantalla esconda botones o
 * redirija es comodidad, no seguridad.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS TRES DECISIONES DE PRODUCTO QUE EXPLICAN CASI TODO LO DE AQUÍ
 *
 * (a) DESACTIVAR ES LA BAJA NORMAL; ELIMINAR, SOLO PARA CUENTAS SIN RASTRO.
 *     Borrar a alguien no destruye lo que registró —clientes, notas,
 *     seguimientos y ventas son filas propias— pero sí su FIRMA: la ficha pasa a
 *     decir "Usuario eliminado" y el seguimiento "Sin asignar". Como lo que se
 *     busca es que otra persona pueda retomar su trabajo, y desactivar conserva
 *     el historial CON el nombre, eliminar queda reservado a quien no llegó a
 *     registrar nada (ver `dejoRastro`).
 *
 * (b) LA CONTRASEÑA LA FIJA LA PERSONA, NO LA DUEÑA.
 *     El alta crea la cuenta SIN secreto y manda un código por correo; la
 *     persona elige su contraseña reutilizando el MOTOR de recuperación ya
 *     endurecido en KAR-100/KAR-110. Ojo: se comparte el motor, no la pantalla
 *     — desde KAR-111 quien está invitado escribe su correo en el inicio de
 *     sesión y le sale directamente "Configura tu contraseña", sin pasar por
 *     "¿Olvidaste tu contraseña?", que era justo lo que no tenía sentido
 *     pedirle a quien nunca ha tenido una. Nadie más llega a
 *     conocerla, y no hay que inventar un canal para una contraseña inicial.
 *     Comprobado contra la librería: `createAccount` acepta cuenta sin secreto
 *     y `Scrypt.verify` devuelve `false` contra un hash vacío, así que una
 *     cuenta sin secreto no entra con NINGUNA contraseña.
 *
 * (c) CAMBIAR EL CORREO O ELIMINAR DESVINCULA GOOGLE SIEMPRE.
 *     Cierra el hallazgo A9 de la auditoría del login: tras el primer inicio de
 *     sesión con Google el vínculo deja de depender del correo y vive en
 *     `authAccounts` por el `sub`, así que quitarle el correo a alguien no le
 *     quitaba el acceso.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Los dos roles del CRM. Mismo union que el esquema. */
const roleValidator = v.union(v.literal("duena"), v.literal("vendedor"));

/**
 * Límites de longitud. Están en el BACKEND y no solo en el formulario porque el
 * formulario no es el único que puede llamar aquí — es la misma deuda que el
 * auditor marcó en `clients.create`.
 */
const NAME_MAX = 80;
const EMAIL_MAX = 254; // máximo de una dirección de correo (RFC 5321)

/**
 * Forma mínima de un correo. Deliberadamente laxa: validar direcciones a fondo
 * con una expresión regular es un error clásico (rechaza direcciones válidas), y
 * quien de verdad decide si el correo existe es la entrega del propio correo.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─────────────────────── Sonda de sesión ─────────────────────── */

/**
 * Usuario de la sesión actual, o `null`. Es la única función de `users` sin
 * `requireAuthUser`: `null` es la respuesta legítima para anónimo, no un error.
 *
 * Comparte criterio con `requireAuthUser` y con el `isAuthenticated` de
 * `auth.ts` a través de `currentActiveUser`, así que la UI nunca puede creerse
 * dentro cuando la capa de datos ya la ha echado. Fail-closed: sin sesión,
 * sesión revocada o caducada, usuario inexistente o `active !== true` → `null`.
 */
export const me = query({
  args: {},
  handler: async (ctx) => await currentActiveUser(ctx),
});

/* ─────────────────────── Validación (pura) ─────────────────────── */

function validarNombre(valor: string): string {
  // Se colapsan los espacios interiores: "Ana   Torres" y "Ana Torres" son la
  // misma persona y no deben verse distintas en la lista.
  const nombre = valor.trim().replace(/\s+/g, " ");
  if (nombre === "") {
    throw new ConvexError("El nombre es obligatorio.");
  }
  if (nombre.length > NAME_MAX) {
    throw new ConvexError(
      `El nombre no puede superar los ${NAME_MAX} caracteres.`,
    );
  }
  return nombre;
}

function validarCorreo(valor: string): string {
  const email = normalizeEmail(valor);
  if (email === "") {
    throw new ConvexError("El correo es obligatorio.");
  }
  if (email.length > EMAIL_MAX) {
    throw new ConvexError(
      `El correo no puede superar los ${EMAIL_MAX} caracteres.`,
    );
  }
  if (!EMAIL_RE.test(email)) {
    throw new ConvexError("Escribe un correo electrónico válido.");
  }
  return email;
}

/* ─────────────────────── Helpers de base de datos ─────────────────────── */

/**
 * ¿Esta persona registró ALGO en el CRM?
 *
 * Son las seis referencias `v.id("users")` del modelo, cada una por su índice
 * (ver la nota de convex/schema.ts). Se consultan EN SERIE y se corta en la
 * primera que da resultado: lo normal es que la primera sonda ya responda que
 * sí, y quien no dejó rastro paga las seis lecturas, que son de una fila.
 *
 * Se incluyen `assignedTo` y `completedBy` aunque sean opcionales: un
 * seguimiento asignado a alguien, o cerrado por alguien, es rastro suyo aunque
 * no lo creara él.
 */
async function dejoRastro(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const sondas = [
    () =>
      ctx.db
        .query("clients")
        .withIndex("by_registeredBy", (q) => q.eq("registeredBy", userId))
        .first(),
    () =>
      ctx.db
        .query("interactions")
        .withIndex("by_author", (q) => q.eq("authorId", userId))
        .first(),
    () =>
      ctx.db
        .query("followups")
        .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
        .first(),
    () =>
      ctx.db
        .query("followups")
        .withIndex("by_assignedTo", (q) => q.eq("assignedTo", userId))
        .first(),
    () =>
      ctx.db
        .query("followups")
        .withIndex("by_completedBy", (q) => q.eq("completedBy", userId))
        .first(),
    () =>
      ctx.db
        .query("sales")
        .withIndex("by_registeredBy", (q) => q.eq("registeredBy", userId))
        .first(),
  ];
  for (const sonda of sondas) {
    if ((await sonda()) !== null) return true;
  }
  return false;
}

/** Todas las cuentas de acceso de una persona (password, google, …). */
async function cuentasDe(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"authAccounts">[]> {
  return await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();
}

function cuentaPassword(
  cuentas: Doc<"authAccounts">[],
): Doc<"authAccounts"> | null {
  return cuentas.find((cuenta) => cuenta.provider === "password") ?? null;
}

/**
 * Cierra TODAS las sesiones de una persona, con sus refresh tokens.
 *
 * Se hace a mano y no con `invalidateSessions` de la librería porque esa exige
 * contexto de ACTION, y aquí interesa que el cambio de estado y el corte de
 * sesión ocurran en la MISMA transacción: no puede quedar una cuenta
 * desactivada con las sesiones vivas ni al revés.
 *
 * Borrar los refresh tokens es la mitad que importa: sin ellos el cliente
 * renovaría el JWT indefinidamente. Es el mismo descuido que arregló KAR-101.
 */
async function cortarSesiones(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<number> {
  const sesiones = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const sesion of sesiones) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", sesion._id))
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(sesion._id);
  }
  return sesiones.length;
}

/**
 * Borra la fila de cuota de solicitudes de un correo.
 *
 * `passwordResetRequests` se indexa por CORREO y no por usuario, así que no se
 * limpia sola al borrar a nadie: hay que acordarse en los dos sitios donde un
 * correo deja de pertenecer a alguien, que son el renombrado y la baja
 * definitiva. Si se olvida uno, queda una fila que ya no es de nadie y que
 * heredaría la próxima persona a la que se le diera de alta ese correo.
 */
async function borrarCuotaDe(ctx: MutationCtx, email: string): Promise<void> {
  const correo = normalizeEmail(email);
  if (correo === "") return;
  const cuota = await ctx.db
    .query("passwordResetRequests")
    .withIndex("by_email", (q) => q.eq("email", correo))
    .unique();
  if (cuota !== null) await ctx.db.delete(cuota._id);
}

/** Borra los códigos de recuperación/invitación pendientes de una cuenta. */
async function borrarCodigosDe(
  ctx: MutationCtx,
  accountId: Id<"authAccounts">,
): Promise<void> {
  const filas = await ctx.db
    .query("passwordResetCodes")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  for (const fila of filas) await ctx.db.delete(fila._id);
}

/**
 * Comprueba que se puede operar sobre ese usuario, y lo devuelve.
 *
 * Las dos prohibiciones vienen de KAR-89. La de "tu propia cuenta" es hoy
 * REDUNDANTE —`requireOwner` ya garantiza que quien llama es la dueña, y la
 * primera regla ya protege a la dueña— y se deja a propósito: si algún día hay
 * un segundo rol administrativo, esta es la línea que impide que alguien se
 * cierre la puerta a sí mismo.
 */
async function usuarioGestionable(
  ctx: QueryCtx | MutationCtx,
  duena: Doc<"users">,
  userId: Id<"users">,
  accion: string,
): Promise<Doc<"users">> {
  const usuario = await ctx.db.get(userId);
  if (usuario === null) {
    throw new ConvexError("Ese usuario ya no existe.");
  }
  if (usuario.role === "duena") {
    throw new ConvexError(`No se puede ${accion} la cuenta dueña.`);
  }
  if (usuario._id === duena._id) {
    throw new ConvexError(`No puedes ${accion} tu propia cuenta.`);
  }
  return usuario;
}

/** ¿Existe ya una cuenta con rol dueña? Ver la nota de convex/auth.ts. */
async function hayDuena(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  const duena = await ctx.db
    .query("users")
    .filter((q) => q.eq(q.field("role"), "duena"))
    .first();
  return duena !== null;
}

/* ─────────────────────── Lista ─────────────────────── */

/**
 * Los usuarios del CRM, con lo que la pantalla necesita para no mentir.
 *
 * `sinContrasena` significa "no puede entrar POR CONTRASEÑA", NO "no tiene
 * acceso": si su correo es de Google, esa persona puede entrar con "Continuar
 * con Google" sin haber usado nunca la invitación, porque la política de
 * convex/auth.ts solo exige que el correo verificado corresponda a un usuario
 * provisionado.
 *
 * POR ESO VA ACOMPAÑADO DE `conGoogle` (KAR-115). A solas, `sinContrasena` solo
 * daba para escribir "Sin contraseña" en la pantalla, que se lee como "algo le
 * falta" y era FALSO para quien ya estaba entrando todos los días con Google.
 * Pasó en producción con una cuenta recién invitada. Los dos campos juntos
 * separan los dos casos que de verdad son distintos —quien tiene acceso por otra
 * puerta y quien todavía no tiene ninguno—, y solo el segundo pide que la dueña
 * haga algo.
 *
 * OJO CON LO QUE `conGoogle` NO DICE. Es "hay una cuenta de Google VINCULADA",
 * que no es lo mismo que "su correo es de Google": la fila `authAccounts` nace
 * la PRIMERA vez que esa persona entra con Google. Así que `sinContrasena &&
 * !conGoogle` no significa "no puede entrar", solo "todavía no ha entrado por
 * ahí". La pantalla no debe afirmar lo contrario.
 */
export const listar = query({
  args: {},
  handler: async (ctx) => {
    const duena = await requireOwner(ctx);
    const usuarios = await ctx.db.query("users").collect();

    const filas = [];
    for (const usuario of usuarios) {
      const cuentas = await cuentasDe(ctx, usuario._id);
      const password = cuentaPassword(cuentas);
      const esDuena = usuario.role === "duena";
      const esYo = usuario._id === duena._id;

      let motivoNoEliminar: string | null = null;
      if (esDuena) {
        motivoNoEliminar = "La cuenta dueña no se puede eliminar.";
      } else if (esYo) {
        motivoNoEliminar = "No puedes eliminar tu propia cuenta.";
      } else if (await dejoRastro(ctx, usuario._id)) {
        motivoNoEliminar =
          "Ya registró información en el CRM. Desactívala para quitarle el " +
          "acceso conservando su historial.";
      }

      filas.push({
        _id: usuario._id,
        name: usuario.name ?? "",
        email: usuario.email ?? "",
        // Se devuelve tal cual, sin inventar un valor por defecto: un usuario sin
        // rol es un dato roto y la pantalla debe poder enseñarlo como tal.
        role: usuario.role ?? null,
        // Fail-closed, igual que `currentActiveUser`: solo `true` es activo.
        active: usuario.active === true,
        esYo,
        sinContrasena: password === null || password.secret === undefined,
        // Ver la cabecera: vinculada, no "su correo es de Google".
        conGoogle: cuentas.some((cuenta) => cuenta.provider === "google"),
        puedeEliminar: motivoNoEliminar === null,
        motivoNoEliminar,
      });
    }

    // La dueña primero y luego por nombre: el orden de `_creationTime` no le
    // dice nada a nadie.
    return filas.sort((a, b) => {
      if (a.role !== b.role) return a.role === "duena" ? -1 : 1;
      return a.name.localeCompare(b.name, "es");
    });
  },
});

/* ─────────────────────── Invitación ─────────────────────── */

/**
 * Resultado de intentar invitar. Se devuelve en vez de lanzarse porque NINGUNO
 * de estos casos es un fallo del alta: la cuenta ya existe y la dueña puede
 * reenviar.
 */
type ResultadoInvitacion =
  | { enviada: true }
  | { enviada: false; motivo: "codigo_vivo"; expiresAt: number }
  | { enviada: false; motivo: "cuota" }
  | { enviada: false; motivo: "no_forzable" }
  | { enviada: false; motivo: "correo" };

/**
 * Emite un código y manda la invitación. Reutiliza ENTERA la maquinaria de
 * convex/passwordReset.ts —mismo hash con pepper, misma tabla, misma cuota,
 * mismos intentos con recarga— porque el código de invitación y el de
 * recuperación son literalmente el mismo objeto: los dos los consume
 * `resetPassword`.
 *
 * Lo único propio es el TTL (24 h en vez de 15 min, ver INVITE_TTL_MS) y el
 * texto del correo.
 *
 * `destino` DEBE ser `authAccounts.providerAccountId`, la dirección almacenada,
 * nunca una cadena que venga del cliente.
 */
async function enviarInvitacion(
  ctx: ActionCtx,
  {
    accountId,
    destino,
    nombre,
    forzar,
  }: {
    accountId: Id<"authAccounts">;
    destino: string;
    nombre: string;
    forzar: boolean;
  },
): Promise<ResultadoInvitacion> {
  const code = generateNumericCode();
  const codeHash = await hashCode(code);

  const resultado = await ctx.runMutation(
    internal.passwordReset.prepararEnvio,
    {
      accountId,
      email: destino,
      codeHash,
      expiresAt: Date.now() + INVITE_TTL_MS,
      attemptsLeft: MAX_VERIFY_ATTEMPTS,
      forzarPorDuena: forzar,
    },
  );

  if (!resultado.enviar) {
    if (resultado.motivo === "codigo_vivo") {
      return {
        enviada: false,
        motivo: "codigo_vivo",
        expiresAt: resultado.expiresAt,
      };
    }
    return { enviada: false, motivo: resultado.motivo };
  }

  try {
    await sendInvitationEmail(destino, code, nombre);
  } catch (e) {
    console.error(
      "[users] La cuenta existe, pero no se pudo enviar la invitación. " +
        "Se descarta el código para que la dueña pueda reenviarla enseguida.",
      e instanceof Error ? e.message : String(e),
    );
    // Sin esto quedaría un código que nadie ha recibido bloqueando la emisión
    // del siguiente durante 24 horas, justamente por la regla que protege los
    // códigos vivos.
    try {
      await ctx.runMutation(internal.passwordReset.descartarCodigo, {
        accountId,
        codeHash,
      });
    } catch (errorAlDescartar) {
      console.error(
        "[users] Además, no se pudo descartar el código guardado. Habrá que " +
          "forzar el reenvío.",
        errorAlDescartar instanceof Error
          ? errorAlDescartar.message
          : String(errorAlDescartar),
      );
    }
    return { enviada: false, motivo: "correo" };
  }

  return { enviada: true };
}

/* ─────────────────────── Alta ─────────────────────── */

/**
 * Guard + comprobaciones amables del alta, en contexto de query porque la action
 * no tiene base de datos.
 *
 * Lo que se comprueba aquí NO es la garantía: entre esta query y el
 * `createAccount` de la action hay dos transacciones distintas y cabe otra alta
 * en medio. La garantía está en `createOrUpdateUser` (convex/auth.ts), que corre
 * DENTRO de la transacción del insert. Esto existe para que el caso normal dé un
 * mensaje que se entienda en vez de un error redactado.
 */
export const contextoAlta = internalQuery({
  args: { email: v.string(), role: roleValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const existente = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();
    if (existente !== null) {
      throw new ConvexError("Ya hay un usuario con ese correo.");
    }

    // Y también sin cuenta de acceso suelta: `createAccount` NO lanza si ya
    // existe una cuenta con ese id y no se le pasa secreto — devuelve la cuenta
    // existente como si la acabara de crear. Sin esta comprobación, un alta
    // repetida diría "listo" sin haber creado nada.
    const cuenta = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", args.email),
      )
      .first();
    if (cuenta !== null) {
      throw new ConvexError("Ya hay una cuenta de acceso con ese correo.");
    }

    if (args.role === "duena" && (await hayDuena(ctx))) {
      throw new ConvexError(
        "El sistema solo permite una cuenta con rol dueña.",
      );
    }

    return null;
  },
});

/**
 * Da de alta a una persona y le manda la invitación.
 *
 * Es una ACTION porque `createAccount` lo exige (necesita llamar a la mutation
 * `auth:store` de la librería). Crear el usuario con un `db.insert("users", …)`
 * pelado dejaría una fila sin credenciales, incapaz de iniciar sesión nunca.
 *
 * NO SE PIDE CONTRASEÑA (decisión (b)): la cuenta nace sin secreto.
 *
 * Si el correo falla, el alta NO se deshace. Deshacerla sería peor: dejaría a la
 * dueña sin saber si la cuenta existe, y el borrado tendría que ocurrir en otra
 * transacción que también puede fallar. La salida es "Reenviar invitación".
 */
export const crear = action({
  args: { name: v.string(), email: v.string(), role: roleValidator },
  handler: async (ctx, args) => {
    const nombre = validarNombre(args.name);
    const email = validarCorreo(args.email);

    await ctx.runQuery(internal.users.contextoAlta, { email, role: args.role });

    const { account, user } = await createAccount<DataModel>(ctx, {
      provider: "password",
      // SIN `secret`. Ver la decisión (b) en la cabecera.
      account: { id: email },
      profile: { name: nombre, email, role: args.role, active: true },
    });

    /**
     * COMPROBACIÓN DE QUE ESTA ALTA CREÓ ALGO DE VERDAD.
     *
     * `createAccount` NO lanza si ya existía una cuenta con ese id y no se le
     * pasa secreto: devuelve la existente como si acabara de crearla. El
     * precheck de `contextoAlta` cubre el caso normal, pero corre en otra
     * transacción, así que dos altas simultáneas lo pasan las dos.
     *
     * No es teoría: medido con 6 altas a la vez con el mismo correo, CINCO
     * respondían "creado" con el mismo `userId` y solo se creaba un usuario. La
     * base de datos quedaba bien, pero la respuesta mentía.
     *
     * Lo único que se puede comprobar después es si la cuenta que ahora existe
     * es EXACTAMENTE la que se pidió:
     *
     *   - Si lo es, el alta es idempotente y decir que salió bien es cierto.
     *     Es el caso real: doble clic en "Agregar usuario".
     *   - Si no lo es, esa cuenta es de otra persona (o estaba desactivada) y
     *     hay que decirlo, con el mismo mensaje que habría dado el precheck.
     *
     * Ojo al tocar esto: NO se puede usar `_creationTime` para distinguir quién
     * ganó la carrera. En una carrera real la fila la crea el ganador a
     * milisegundos del `Date.now()` del perdedor, así que la comparación de
     * tiempos daría lo contrario de lo que parece.
     */
    if (
      user.email !== email ||
      user.name !== nombre ||
      user.role !== args.role ||
      user.active !== true
    ) {
      throw new ConvexError("Ya hay una cuenta de acceso con ese correo.");
    }

    const invitacion = await enviarInvitacion(ctx, {
      accountId: account._id,
      destino: account.providerAccountId,
      nombre,
      forzar: false,
    });

    return { userId: user._id, invitacion };
  },
});

/* ─────────────────────── Reenviar invitación ─────────────────────── */

/** Guard + datos del reenvío. Mismo papel que `contextoAlta`. */
export const contextoReenvio = internalQuery({
  args: { userId: v.id("users"), forzar: v.boolean() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const usuario = await ctx.db.get(args.userId);
    if (usuario === null) {
      throw new ConvexError("Ese usuario ya no existe.");
    }
    // Una cuenta desactivada no puede usar el código ni aunque lo reciba:
    // `requestCode` y `resetPassword` comprueban `active` desde el hallazgo A8.
    // Mandarlo sería prometer algo que no va a funcionar.
    if (usuario.active !== true) {
      throw new ConvexError(
        "Esa cuenta está desactivada. Reactívala antes de reenviarle la invitación.",
      );
    }

    const password = cuentaPassword(await cuentasDe(ctx, usuario._id));
    if (password === null) {
      throw new ConvexError("Esa persona no tiene una cuenta de acceso.");
    }
    if (args.forzar && password.secret !== undefined) {
      // OJO AL CAMINO QUE DESCRIBE ESTE TEXTO: desde KAR-111 el inicio de sesión
      // pide PRIMERO el correo, y «¿Olvidaste tu contraseña?» solo aparece en el
      // paso siguiente. Decir "en la pantalla de inicio de sesión" a secas
      // mandaba a la dueña a buscar un enlace que ahí no está. Si el login
      // vuelve a cambiar de forma, este mensaje hay que revisarlo.
      throw new ConvexError(
        "Esa persona ya tiene contraseña. Si no puede entrar, que escriba su " +
          "correo en el inicio de sesión y pulse «¿Olvidaste tu contraseña?» " +
          "en el paso siguiente.",
      );
    }

    return {
      accountId: password._id,
      destino: password.providerAccountId,
      nombre: usuario.name ?? "",
    };
  },
});

/**
 * Reenvía la invitación. Para las tres situaciones reales: el correo se perdió,
 * el código caducó, o la persona no llegó a tiempo.
 *
 * Con `forzar: false` respeta la regla "un código vivo es sagrado" y devuelve
 * `codigo_vivo` con su hora de caducidad para que la dueña lea la verdad en vez
 * de un silencio.
 *
 * Con `forzar: true` reemite aunque haya código vivo, y es la ÚNICA excepción a
 * esa regla en todo el sistema. Está acotada por tres sitios, y hacen falta los
 * tres:
 *   1. aquí, `requireOwner` (vía `contextoReenvio`);
 *   2. aquí, que esa cuenta no tenga contraseña todavía — así este camino nunca
 *      puede destruir el código de recuperación de alguien que sí la tiene;
 *   3. y sobre todo DENTRO de `prepararEnvio`, que vuelve a comprobar lo mismo
 *      en la propia transacción y además pide la cuota ANTES de borrar nada. Lo
 *      de aquí es para el mensaje; lo de allí es la garantía.
 */
export const reenviarInvitacion = action({
  args: { userId: v.id("users"), forzar: v.boolean() },
  // Los dos tipos van ANOTADOS a mano y no inferidos: esta action llama por
  // `internal.users` a una función de su propio módulo, y eso crea un ciclo de
  // inferencia que TypeScript resuelve como `any` (TS7022/TS7023). Anotar corta
  // el ciclo y, de paso, deja el contrato escrito.
  handler: async (ctx, args): Promise<ResultadoInvitacion> => {
    const contexto: {
      accountId: Id<"authAccounts">;
      destino: string;
      nombre: string;
    } = await ctx.runQuery(internal.users.contextoReenvio, {
      userId: args.userId,
      forzar: args.forzar,
    });
    return await enviarInvitacion(ctx, { ...contexto, forzar: args.forzar });
  },
});

/* ─────────────────────── Edición ─────────────────────── */

/**
 * Cambia nombre, correo y/o rol. Solo se tocan los campos que llegan.
 *
 * EL CAMBIO DE CORREO ARRASTRA CINCO CONSECUENCIAS, y las cinco ocurren en esta
 * misma transacción: la cuota del correo viejo, el renombrado de la cuenta
 * Password, el borrado de los códigos pendientes, la desvinculación de Google y
 * el corte de sesiones. Ver el bloque de abajo, que es la parte con más
 * seguridad dentro de esta función.
 */
export const actualizar = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(roleValidator),
  },
  handler: async (ctx, args) => {
    const duena = await requireOwner(ctx);
    const usuario = await ctx.db.get(args.userId);
    if (usuario === null) {
      throw new ConvexError("Ese usuario ya no existe.");
    }

    const cambios: Partial<Doc<"users">> = {};

    if (args.name !== undefined) {
      cambios.name = validarNombre(args.name);
    }

    if (args.role !== undefined && args.role !== usuario.role) {
      if (usuario.role === "duena") {
        throw new ConvexError("El rol de la cuenta dueña no se puede cambiar.");
      }
      if (args.role === "duena" && (await hayDuena(ctx))) {
        throw new ConvexError(
          "El sistema solo permite una cuenta con rol dueña.",
        );
      }
      cambios.role = args.role;
    }

    let correoNuevo: string | null = null;
    if (args.email !== undefined) {
      const email = validarCorreo(args.email);
      if (email !== usuario.email) {
        const otroUsuario = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", email))
          .first();
        if (otroUsuario !== null) {
          throw new ConvexError("Ya hay otro usuario con ese correo.");
        }
        const otraCuenta = await ctx.db
          .query("authAccounts")
          .withIndex("providerAndAccountId", (q) =>
            q.eq("provider", "password").eq("providerAccountId", email),
          )
          .first();
        if (otraCuenta !== null) {
          throw new ConvexError("Ya hay una cuenta de acceso con ese correo.");
        }
        correoNuevo = email;
        cambios.email = email;
      }
    }

    if (Object.keys(cambios).length === 0) {
      return {
        correoCambiado: false,
        googleDesvinculado: 0,
        sesionesCerradas: 0,
        esTuPropiaCuenta: usuario._id === duena._id,
      };
    }

    await ctx.db.patch(usuario._id, cambios);

    if (correoNuevo === null) {
      return {
        correoCambiado: false,
        googleDesvinculado: 0,
        sesionesCerradas: 0,
        esTuPropiaCuenta: usuario._id === duena._id,
      };
    }

    // ── Consecuencias del cambio de correo ──
    //
    // 0) La cuota de solicitudes del correo VIEJO. Va antes que nada porque
    //    `usuario` es la lectura previa al patch y todavía tiene la dirección
    //    anterior. Sin esto queda una fila de nadie: lo detectó la verificación
    //    de §10.9 al buscar huérfanos después de renombrar y borrar.
    await borrarCuotaDe(ctx, usuario.email ?? "");

    let googleDesvinculado = 0;
    for (const cuenta of await cuentasDe(ctx, usuario._id)) {
      if (cuenta.provider === "password") {
        // 1) La cuenta de acceso se renombra: mismo `_id`, misma contraseña, que
        //    sigue valiendo con la dirección nueva.
        await ctx.db.patch(cuenta._id, { providerAccountId: correoNuevo });

        // 2) Fuera los códigos pendientes. ESTO NO ES LIMPIEZA, ES SEGURIDAD: el
        //    código se envió a la dirección VIEJA, pero la cuenta a la que abre
        //    es ya la de la NUEVA. Sin este borrado, quien controle el buzón
        //    antiguo podría fijar la contraseña de la cuenta recién reasignada.
        await borrarCodigosDe(ctx, cuenta._id);
      } else if (cuenta.provider === "google") {
        // 3) Desvincular Google (decisión (c) / hallazgo A9). El siguiente
        //    "Continuar con Google" volverá a pasar por la política de
        //    `createOrUpdateUser`, que ahora buscará el correo NUEVO.
        await ctx.db.delete(cuenta._id);
        googleDesvinculado++;
      }
    }

    // 4) Cortar sus sesiones. Sin esto, (3) no sirve de nada mientras dure la
    //    sesión abierta, y los refresh tokens la renuevan indefinidamente.
    //    OJO: si la dueña se cambia su PROPIO correo, se cierra su propia
    //    sesión; por eso se devuelve `esTuPropiaCuenta`, para que la pantalla lo
    //    avise antes.
    const sesionesCerradas = await cortarSesiones(ctx, usuario._id);

    return {
      correoCambiado: true,
      googleDesvinculado,
      sesionesCerradas,
      esTuPropiaCuenta: usuario._id === duena._id,
    };
  },
});

/* ─────────────────────── Estado ─────────────────────── */

/**
 * Activa o desactiva a una persona (KAR-89). Es la BAJA NORMAL: conserva todo su
 * historial y su nombre en él.
 *
 * Desactivar corta el acceso de inmediato aunque tenga la sesión abierta, porque
 * `currentActiveUser` lee el documento del usuario en cada consulta. Aun así se
 * cierran también las sesiones: dejar vivos los refresh tokens de una cuenta
 * dada de baja es exactamente el descuido que arregló KAR-101.
 */
export const cambiarEstado = mutation({
  args: { userId: v.id("users"), active: v.boolean() },
  handler: async (ctx, args) => {
    const duena = await requireOwner(ctx);
    const usuario = await usuarioGestionable(
      ctx,
      duena,
      args.userId,
      args.active ? "reactivar" : "desactivar",
    );

    if ((usuario.active === true) === args.active) {
      return { cambiado: false, sesionesCerradas: 0, nombre: usuario.name ?? "" };
    }

    await ctx.db.patch(usuario._id, { active: args.active });
    const sesionesCerradas = args.active
      ? 0
      : await cortarSesiones(ctx, usuario._id);

    return { cambiado: true, sesionesCerradas, nombre: usuario.name ?? "" };
  },
});

/* ─────────────────────── Baja definitiva ─────────────────────── */

/**
 * Elimina a una persona, y SOLO si no llegó a registrar nada (decisión (a)).
 *
 * La comprobación y el borrado van en la misma mutation a propósito: las
 * mutations de Convex son transacciones serializables, así que nadie puede colar
 * un cliente a su nombre entre una cosa y la otra.
 *
 * Se limpian todas sus filas de autenticación, y eso no es cosmética: una fila
 * de `authAccounts` sin usuario es una credencial que apunta a la nada, y
 * `createAccount` la reutilizaría EN SILENCIO si alguien volviera a dar de alta
 * ese mismo correo.
 */
export const eliminar = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const duena = await requireOwner(ctx);
    const usuario = await usuarioGestionable(ctx, duena, args.userId, "eliminar");

    if (await dejoRastro(ctx, usuario._id)) {
      throw new ConvexError(
        "Esta persona registró información en el CRM. Desactívala para " +
          "quitarle el acceso conservando su historial.",
      );
    }

    const cuentas = await cuentasDe(ctx, usuario._id);
    for (const cuenta of cuentas) {
      await borrarCodigosDe(ctx, cuenta._id);

      // Códigos de verificación de la librería. Hoy no se generan —el flujo de
      // recuperación es propio y los flows de correo están cerrados por red en
      // convex/auth.ts— pero la tabla existe y tiene índice por cuenta, así que
      // se limpia igual en vez de confiar en que siga vacía.
      const verificaciones = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", cuenta._id))
        .collect();
      for (const fila of verificaciones) await ctx.db.delete(fila._id);

      // Bloqueo por intentos fallidos de inicio de sesión: Convex Auth lo guarda
      // en `authRateLimits` usando el `_id` de la CUENTA como `identifier` (ver
      // `clearSignInLockout`).
      const limite = await ctx.db
        .query("authRateLimits")
        .withIndex("identifier", (q) => q.eq("identifier", cuenta._id))
        .unique();
      if (limite !== null) await ctx.db.delete(limite._id);

      await ctx.db.delete(cuenta._id);
    }

    const sesionesCerradas = await cortarSesiones(ctx, usuario._id);

    // Cuota de solicitudes de recuperación, que va por CORREO y no por usuario.
    await borrarCuotaDe(ctx, usuario.email ?? "");

    const nombre = usuario.name ?? "";
    await ctx.db.delete(usuario._id);

    return { nombre, cuentasBorradas: cuentas.length, sesionesCerradas };
  },
});
