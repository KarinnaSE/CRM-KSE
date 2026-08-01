# KSE CRM

CRM a medida para un negocio de ventas digitales (formaciones, consultoría, plantillas). Ayuda a que no se pierdan ventas por falta de seguimiento: clientes, seguimientos y ventas en un solo lugar.

- **Producto (PRD):** Notion — `CRM-PRD` y la bitácora `CRM-Cambios y Mejoras`.
- **Plan de trabajo:** Linear — proyecto `CRM-MVP` (equipo KarinnaSE, prefijo `KAR`). Es la fuente de verdad para el desarrollo.
- **Diseño de referencia:** handoff de 7 pantallas (`.dc.html`); se mantiene fuera del repo (sus tokens ya están portados a `app/globals.css`).

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 3** con los tokens del design system portados a `app/globals.css`
- **Convex** como base de datos y backend (ver [`convex/`](./convex))
- Despliegue en **Railway**; código en **GitHub**

## Requisitos

- Node.js 20+ (ver `.nvmrc`)

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Conectar Convex (una sola vez): crea el proyecto, genera convex/_generated
#    y escribe NEXT_PUBLIC_CONVEX_URL en tu .env.local. Déjalo corriendo.
npx convex dev

# 3. En otra terminal, arrancar Next.js
npm run dev
```

Abre http://localhost:3000 — redirige a `/login`.

> Si aún no has corrido `npx convex dev`, la app arranca igual; simplemente las
> queries/mutations de Convex no estarán disponibles hasta configurarlo.

## Estructura

```
app/
  layout.tsx            Layout raíz (fuente DM Sans + Providers)
  providers.tsx         Proveedor de Convex (cliente)
  globals.css           Tokens del design system + Tailwind
  page.tsx              Redirige a /login
  (auth)/login/         Pantalla de Login
  (app)/                Pantallas autenticadas (con navegación persistente)
    layout.tsx          Navegación (Admin visible solo para la dueña)
    seguimientos/       Pantalla de entrada: atrasados + hoy (implementada)
    clientes/           Lista, /nuevo (alta) y /[id] (ficha)
    usuarios/           Gestión de usuarios y roles (solo dueña)
    perfil/             Perfil / cerrar sesión
components/             Componentes reutilizables (ui, nav, seguimientos, auth)
lib/                    Utilidades (cn, etapas del pipeline)
convex/                 Backend: schema y funciones (seguimientos, seed, dates)
```

## Variables de entorno

Copia `.env.example` a `.env.local`. `npx convex dev` rellena `CONVEX_DEPLOYMENT` y `NEXT_PUBLIC_CONVEX_URL` automáticamente. Nunca subas `.env.local` a GitHub.

### Variables del deployment de Convex (no van en `.env.local`)

Se fijan con `npx convex env set` (añade `--prod` para producción) y hay que tenerlas **en dev y en prod**:

| Variable | Secreto | Para qué |
|---|---|---|
| `AUTH_GOOGLE_ID` | no | Login con Google |
| `AUTH_GOOGLE_SECRET` | **sí** | Login con Google |
| `RESEND_API_KEY` | **sí** | Envío del código de recuperación |
| `PASSWORD_RESET_PEPPER` | **sí** | Clave del HMAC con el que se guardan los códigos |
| `SITE_URL` | no | Destino válido de los redirects de OAuth |
| `ALLOW_DEMO_SEED` | no | **Solo dev.** Habilita `seed:seedDemo` y `seed:clearAll` (borran datos) |
| `LOG_OTP_CODES` | no | **Solo dev.** Escribe el código de recuperación en el log del deployment |

**Las marcadas como secreto no se escriben en la línea de comandos.** Omite el valor y el CLI lo pide por stdin, así no queda en el historial del shell ni visible en la lista de procesos:

```bash
npx convex env set RESEND_API_KEY --prod          # ✅ pide el valor
npx convex env set RESEND_API_KEY 're_xxx' --prod # ❌ queda en el historial
```

El panel de Convex (Settings → Environment Variables) es igual de válido y no toca el shell.

`PASSWORD_RESET_PEPPER` se genera con `openssl rand -hex 32` y debe ser **distinta en dev y en prod**. Para no pasarla por el shell: `openssl rand -hex 32 | npx convex env set PASSWORD_RESET_PEPPER --prod`. Sin ella la recuperación de contraseña falla (a propósito: es fail-closed). Rotarla solo invalida los códigos en vuelo, que caducan en 15 minutos de todas formas.

## Operación y seguridad

### Comprobación antes de desplegar

```bash
npm run check:prod-env
```

Falla si el deployment de producción tiene alguna variable peligrosa: `ALLOW_DEMO_SEED`, `LOG_OTP_CODES`, `AUTH_LOG_LEVEL=DEBUG` o `AUTH_LOG_SECRETS=true`. Es fail-closed — si no puede leer el entorno, también falla. Un aviso en un README no impide un despiste; esto sí.

Funciona en las dos situaciones sin que haya que acordarse de nada: en una máquina de desarrollo usa `--prod`, y cuando detecta `CONVEX_DEPLOY_KEY` (o sea, en CI) lo omite, porque esa clave ya está ligada a un deployment concreto. Ese condicional es cosmético, no funcional — comprobado en el código del CLI: con una deploy key de deployment, `--prod` no da error, solo se ignora con un aviso. Omitirlo evita el ruido.

**Está conectado al build de Railway** (`railway.json`), delante de `convex deploy`:

```
npm run check:prod-env && npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build'
```

Consecuencia que hay que entender antes de tocarlo: **si el gate falla, el build falla y no se despliega nada**. Eso es exactamente lo que se busca —incluye el caso de que no pueda leer el entorno, porque es fail-closed—, pero significa que un gate roto bloquea también los despliegues urgentes. Producción sigue sirviendo la versión anterior mientras tanto, así que la salida siempre es revertir el commit del gate y volver a desplegar.

Qué hace peligrosa a cada una:

- **`ALLOW_DEMO_SEED`** habilita `seed:clearAll`, que borra `users`, `authAccounts` y `authSessions`.
- **`LOG_OTP_CODES`** escribe los códigos de recuperación en claro en los logs. Van separadas a propósito: activar el seed de demo no debe encender de paso el volcado de códigos, porque son riesgos distintos.
- **`AUTH_LOG_LEVEL=DEBUG`** hace que Convex Auth registre los argumentos de sus funciones internas, con códigos de verificación en claro y perfiles completos de OAuth. Por defecto es `INFO`.
- **`AUTH_LOG_SECRETS=true`** desactiva el redactado de secretos en esos mismos logs.

### Recuperación de contraseña: por qué nadie puede bloquearla

La regla que gobierna `convex/passwordReset.ts` es corta: **un código vivo es sagrado**. Ninguna petición nueva lo invalida, y ningún fallo de intentos lo mata de forma permanente. Detrás está el principio del que sale, que conviene tener presente al tocar cualquier límite de este flujo:

> **Todo cupo que se agota es un arma.** Cualquier contador que un desconocido pueda vaciar en nombre de la víctima deja de ser una defensa y pasa a ser el ataque.

La versión anterior tenía dos cupos agotables, y con cualquiera de los dos un anónimo que supiera un correo dejaba a esa persona sin recuperación de forma indefinida y **silenciosa**, porque la pantalla afirma que el correo salió:

1. **La cuota de 3 solicitudes cada 15 minutos la consumía cualquiera.** Gastando los tres huecos al principio de cada ventana —288 peticiones al día, un bucle trivial— la petición legítima no enviaba nada. Ahora, pedir cuando ya hay un código vivo no lo rota **y no consume cuota**: sin esas dos palancas, la víctima siempre acaba con un código utilizable en el buzón.
2. **Los 5 intentos de verificación se agotaban y borraban el código.** Eso reinstauraba la misma denegación por otra puerta: bastaba quemar los intentos de cada código recién emitido. Ahora los intentos **se recargan** con el tiempo (uno cada dos minutos), con la misma fórmula que la propia librería usa para el login. Un atacante retrasa a la usuaria unos minutos; no le quita el código.

Al quitar los cupos agotables hay que compensar la fuerza bruta por otro lado, y se hace **ampliando el espacio**: el código pasó de 6 a 8 dígitos. Recortar intentos habría sido volver a crear un cupo vaciable, o sea reintroducir el fallo.

Consecuencia que hay que asumir: si el primer correo se pierde, **no se emite otro hasta que el anterior caduque** (15 minutos). Es el precio de que el código no se pueda invalidar desde fuera, y es un límite que se cura solo.

### Política de contraseñas

Mínimo 12 caracteres, con al menos una mayúscula y un número, y una lista corta de denegación que rechaza palabras comunes y las que contienen el nombre de la persona o del CRM. Vive en `convex/authShared.ts`, que comparten la UI y el backend para que no puedan desviarse.

No es una comprobación contra bases de contraseñas filtradas: eso exigiría una llamada de red en mitad del cambio de contraseña y no es proporcionado aquí.

**Subir el mínimo no deja fuera a nadie.** `validatePasswordRequirements` solo se invoca en los flujos `signUp` y `reset-verification`, nunca en `signIn`: las contraseñas que ya existen siguen sirviendo para entrar, y la política aplica a las nuevas. Por eso endurecerla **no sustituye a rotar** las contraseñas de producción, que es un paso operativo aparte (ver break-glass).

### Correos que manda el sistema

Los dos van siempre a la dirección **almacenada en la cuenta** (`authAccounts.providerAccountId`), nunca a la que escriba quien rellena el formulario. Ninguno lleva contraseñas, códigos ni enlaces de un solo uso.

| Correo | Cuándo | Si falla el envío |
|---|---|---|
| Código de recuperación | Al pedir recuperar la contraseña | **Rompe el flujo.** Sin correo no hay nada que hacer con la pantalla del código. |
| Aviso de cambio de contraseña | Después de cambiarla (recuperación o break-glass) | **No rompe nada.** Ver abajo. |

**El aviso de cambio es best-effort, a conciencia.** No se envía en línea: se programa con `ctx.scheduler.runAfter(0, …)` y se manda en otro trabajo. El motivo es que ese correo nunca puede hacer fracasar un cambio de contraseña, y eso son dos cosas distintas: no propagar el error (basta un `try/catch`) y no gastar el tiempo de la función que lo llama (no basta). Si Resend se quedara pendiente y el runtime abortara la ejecución, no habría `catch` que corriera, y la pantalla de login traduce cualquier error a "El código no es válido o ha caducado" — con la contraseña ya cambiada y las sesiones ya cerradas.

Consecuencia que hay que asumir: **si el aviso falla, el cambio de contraseña NO se revierte** y la titular no se entera. El único rastro es el registro del deployment con prefijo `[passwordChangedEmail]`, y el trabajo consta como fallido en el panel de Convex. No hay reintentos.

El enlace a la pantalla de inicio de sesión sale de `SITE_URL` y solo se incluye si cumple **las tres** reglas: se construye con `new URL` (nunca concatenando), el esquema es `https` (o `http` en `localhost`), y **el host está en la lista cerrada de `convex/email.ts`** (`HOSTS_PERMITIDOS`, hoy solo `crm-kse.com`). Si falla cualquiera, el correo sale sin enlace: un aviso de seguridad mal configurado que enseñe a pinchar un dominio ajeno es peor que uno sin enlace.

Esa lista está escrita a mano a propósito. Si saliera de `SITE_URL` no defendería de nada, porque de lo que defiende es justamente de que `SITE_URL` esté mal — un valor como `https://crm-kse.com.atacante.net` pasaba las otras dos reglas sin problema. **Si algún día cambia el dominio del CRM, hay que tocar esa lista**, o los correos dejarán de llevar enlace.

### Content Security Policy

La CSP la emite `middleware.ts` en cada petición, construida en `lib/csp.ts`. **No está en `next.config.mjs`** y no puede estarlo: lleva un nonce distinto por petición y un `connect-src` que depende de `NEXT_PUBLIC_CONVEX_URL`, que cambia entre dev y producción.

| Directiva | Valor | Por qué |
|---|---|---|
| `script-src` | `'self' 'nonce-…' 'strict-dynamic'` (+ `'unsafe-eval'` **solo en dev**) | Lo que de verdad frena un XSS. `strict-dynamic` deja que los chunks de Next hereden la confianza del script de arranque. `next dev` necesita `eval` para los source maps. |
| `style-src` | `'self' 'unsafe-inline'` | **Concesión consciente.** La interfaz usa 15 atributos `style={{…}}` en 8 archivos; sin esto se queda sin diseño. Con estilos no se roba un token. |
| `connect-src` | `'self'` + Convex `https:` y `wss:` | **`'self'` no es opcional:** `signIn` y `signOut` van por un fetch same-origin a `/api/auth`, y las transiciones de Next piden sus payloads al propio origen. `default-src 'self'` **no** cubre esto: cuando `connect-src` existe, sustituye al respaldo de `default-src`. |
| `frame-ancestors` | `'none'` | Antiframing. `X-Frame-Options: DENY` sigue en `next.config.mjs` como segundo candado. |

**Modo de la CSP:** la constante `CSP_REPORT_ONLY` de `lib/csp.ts` decide si la cabecera es `Content-Security-Policy-Report-Only` (solo informa) o `Content-Security-Policy` (bloquea). Valores esperados:

- **`true`** en el primer despliegue — nada se bloquea, las violaciones solo aparecen en la consola del navegador.
- **`false`** una vez comprobado en producción que no hay violaciones.

Se despliega en dos pasos a propósito: una CSP mal calibrada no degrada la aplicación, la rompe, y en producción hay dos usuarias sin forma de avisar. Cambiar de modo es cambiar esa línea, así que en una revisión se ve de un vistazo si se está activando el bloqueo.

Si algún día se apunta a otro backend de Convex, la CSP lo sigue **solo si cambia `NEXT_PUBLIC_CONVEX_URL`**. Y si se sube a Next 16 (KAR-104), hay que volver a comprobar que el nonce sigue llegando al HTML: esa parte es interna de Next.

### Riesgos aceptados a conciencia

**El JWT de acceso se guarda en `localStorage`.** Un XSS podría leerlo y usarlo contra Convex.

*Por qué no se arregla:* el arreglo evidente, `storage="inMemory"`, **no funciona por un fallo de `@convex-dev/auth` 0.0.94** (la última publicada). La opción no pasa un almacén en memoria sino `null`, y el almacén al que se cae acaba siendo **de solo escritura**: `getItem` cierra sobre el objeto de estado inicial y devuelve `undefined` siempre. Consecuencia: el cliente nunca puede releer lo que guardó, adopta a ciegas el estado que le manda el servidor y, en el instante posterior a `signIn` en que ese estado aún viene sin token, se desconecta solo. Medido en KAR-103: la sesión **sí** se crea en el backend y el propio cliente la borra tres segundos después. Ver el análisis completo en el comentario de `app/layout.tsx`.

No se puede sortear desde la aplicación: el tipo de la opción es cerrado (`"localStorage" | "inMemory"`), así que no se puede inyectar un almacén propio, y parchear el interior de la librería cambiaría un riesgo conocido por uno desconocido.

*Qué queda expuesto, medido:* solo el JWT de acceso. El refresh token que se guarda a su lado es **literalmente la cadena `"dummy"`** —comprobado en el navegador—; el real vive solo en la cookie httpOnly. Ese JWT dura 30 minutos, **no puede renovarse**, y revocar la sesión corta el acceso robado en el acto porque la autorización valida contra `authSessions`. Y desde KAR-103 hay una **CSP con `script-src` en modo bloqueo**, así que para leerlo hay que vencer primero esa política.

**Se puede averiguar por tiempos qué correos están dados de alta.** Pedir recuperación con un correo registrado tarda lo que tarde Resend; con uno desconocido se sale en una consulta. Eso desmonta la indistinguibilidad que el resto del flujo persigue. El mismo canal existe en el login, donde Scrypt solo se ejecuta si la cuenta existe.

*Por qué no se arregla:* el arreglo natural —diferir el envío con `ctx.scheduler`— obligaría a pasar el código **en claro** como argumento de una función programada, y los argumentos aparecen en los registros del deployment. Guardarlo en una fila intermedia contradice el diseño HMAC+pepper, que existe justamente para que leer la tabla no dé códigos usables. Las dos salidas cambian una fuga menor por una mayor. Y el impacto aquí es nulo: hay dos cuentas y **sus correos están publicados en este mismo repositorio** (`convex/seed.ts` y la caja de credenciales demo del login). *Condición de revisión:* si el CRM deja de ser un sistema cerrado de dos personas, esto pasa a ser un hallazgo real.

**El login revela si un correo tiene una invitación pendiente.** Desde KAR-111 el inicio de sesión va en dos pasos: primero el correo, y después se pide la contraseña o el código según lo que devuelva `passwordReset.iniciarAcceso`. Esa ramificación es, por definición, contarle algo a quien pregunta.

*Por qué se acepta:* lo que decide si esto es grave o anecdótico es **hacia dónde cae lo desconocido**, y cae del lado bueno. Un correo sin cuenta, uno con contraseña y uno de una cuenta desactivada llevan los tres al mismo paso, con el mismo texto y sin escribir ni enviar nada, así que **probar direcciones al azar no distingue nada** y la enumeración masiva —el ataque que importa— no funciona. Lo único observable es que un correo concreto tenga una invitación **sin usar**: un estado transitorio, de una cuenta en la que por definición todavía no se puede entrar con contraseña. Preguntar eso no consume cuota y se puede repetir; **no se le pone un cupo a propósito**, porque un cupo que se agota volvería a ser un arma contra la persona invitada, que es la regla que gobierna todo el flujo de códigos. *Condición de revisión:* la misma que la de arriba — si el CRM deja de ser un sistema cerrado de pocas personas, hay que reevaluarlo.

*La contrapartida es deliberada:* la alternativa era obligar a quien entra por primera vez a pulsar «¿Olvidaste tu contraseña?» para poner la primera, lo cual es mentira y además entrena el reflejo que explota el phishing, en la única pantalla donde ese reflejo cuesta caro.

**Que el login no sea un oráculo depende de que Convex redacte los mensajes de error en producción.** `retrieveAccount` lanza `InvalidAccountId`, `InvalidSecret` o `TooManyFailedAttempts` —tres mensajes distinguibles— y el proxy de Convex Auth los reenvía al navegador tal cual. La suposición está documentada en `lib/errores.ts`, pero es una garantía de la plataforma, externa e invisible en el código, de la que depende una propiedad de seguridad. **Pendiente de comprobar contra producción**; si no se redactara, la pantalla de login tendría que dejar de depender de ello.

**No hay aviso por correo de los inicios de sesión.** Se implementó y se retiró por decisión de producto: los correos resultaban molestos. Consecuencia a tener presente: no queda ninguna señal que delate un acceso hecho con **credenciales válidas** —contraseña filtrada o buzón comprometido—. Lo que sí sigue avisando es el cambio de contraseña, así que un intruso que además cambie el secreto deja rastro; uno que solo entre y mire, no.

**Tres advisories altos de dependencias transitivas de Next 15.** No son explotables aquí: los de PostCSS son de compilación y todo el CSS es nuestro; los de sharp solo se alcanzan por `/_next/image`, que responde 400 a cualquier petición; y no usamos `next/image`, Server Actions ni rewrites. Cerrarlos exige subir a Next 16, un salto de versión mayor que merece su propia tarea.

### Break-glass: recuperar el acceso de una cuenta bloqueada

Para el caso extremo en que alguien deje una cuenta bloqueada a base de intentos fallidos y la recuperación por correo tampoco esté disponible:

```bash
# 1. Fijar la contraseña SIN escribirla en el comando. Al omitir el valor, el
#    CLI lo pide por stdin: no queda en el historial del shell ni en la lista
#    de procesos. NO uses `env set NOMBRE 'contraseña'`.
npx convex env set BREAK_GLASS_PASSWORD_MARTA --prod

# 2. Aplicar el cambio.
npx convex run provisionUsers:resetUserPassword --prod \
  '{"email":"karinnase@gmail.com","envSuffix":"MARTA"}'

# 3. Borrar la variable. NO SALTARSE ESTE PASO.
npx convex env remove BREAK_GLASS_PASSWORD_MARTA --prod
```

Cambia la contraseña, cierra las sesiones abiertas de esa persona y limpia su contador de intentos fallidos, y programa el aviso por correo a la titular.

La salida dice `avisoProgramado`, **no "enviado"**: el correo sale en otro trabajo, unos milisegundos después. Para confirmar que llegó de verdad hay que mirar los registros del deployment (`[passwordChangedEmail]`). Precisamente en este escenario el buzón puede ser lo que no funciona.

Dos cosas que hay que respetar:

- **La contraseña nunca va en la línea de comandos.** Ni como argumento de `env set` ni de `convex run`: acabaría en el historial del shell y sería visible en la lista de procesos mientras dura el comando. Por eso el paso 1 omite el valor. Si prefieres no usar la terminal, el panel de Convex (Settings → Environment Variables) también sirve y no toca el shell.
- **La variable es de un solo uso.** Si no se borra en el paso 3, queda una credencial válida guardada en la configuración del deployment. El sufijo va por cuenta (`_MARTA`, `_CARLOS`) precisamente para que sea evidente cuál hay que borrar.

Después de usarlo, pídele a la persona que cambie la contraseña desde la pantalla de recuperación.

## Subir a GitHub

```bash
git add -A
git commit -m "Estructura inicial del proyecto"
git remote add origin https://github.com/KarinnaSE/CRM-KSE.git
git push -u origin main
```

## Desplegar en Railway

1. En Railway, crea un proyecto **Deploy from GitHub repo** apuntando a este repositorio (Nixpacks detecta Next.js automáticamente).
2. En **Variables**, añade `CONVEX_DEPLOY_KEY` (Convex → Settings → Deploy Keys, de producción).
3. El build ya está configurado en `railway.json`: `npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build'` despliega las funciones de Convex e inyecta `NEXT_PUBLIC_CONVEX_URL` de producción antes de compilar Next.js.
4. Railway asigna el puerto con `PORT`; `npm run start` (`next start`) lo respeta.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Next.js en desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servir el build (usa `PORT`) |
| `npm run lint` | ESLint |
| `npm run convex:dev` | Convex en desarrollo (genera tipos, sincroniza) |
| `npm run convex:deploy` | Desplegar funciones de Convex |
