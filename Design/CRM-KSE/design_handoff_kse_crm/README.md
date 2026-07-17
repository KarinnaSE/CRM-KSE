# Handoff: KSE CRM — Prototipo MVP

## Visión general

Este paquete contiene el prototipo de alta fidelidad del **KSE CRM**, un CRM ligero para pequeño negocio, diseñado mobile-first y responsive (funciona igual en móvil y escritorio). Cubre el 100% del MVP definido.

---

## Sobre los archivos de diseño

Los archivos `.dc.html` son **referencias de diseño creadas en HTML** — prototipos interactivos que muestran la apariencia y el comportamiento esperado, **no código de producción para copiar directamente**. El trabajo del desarrollador es **recrear estos diseños en el entorno del repositorio** (React, Vue, Swift, etc.) usando sus patrones y librerías existentes, respetando fielmente la UI y las interacciones documentadas aquí.

## Fidelidad

**Alta fidelidad (hifi).** Los prototipos tienen colores finales, tipografía, espaciado, estados de hover/error/carga e interacciones completas. El desarrollador debe replicar la UI píxel a píxel usando las librerías del codebase.

---

## Design System

El sistema de diseño usado es **KSE CRM Design System v1.0** (incluido en `_ds/`).

### Tokens principales

| Token | Valor |
|---|---|
| Familia tipográfica | DM Sans |
| Base tipográfica mobile | 14px |
| Base tipográfica desktop | 16px |
| Color interactivo (brand) | `oklch(0.63 0.195 48)` — ámbar |
| Color de fondo de página | `var(--bg-page)` = `--neutral-50` |
| Color de superficie | `var(--bg-surface)` = `--neutral-0` (blanco) |
| Borde estándar | `1px solid var(--border)` = `--neutral-200` |
| Radio base | `--radius-md` = 6px |
| Radio cards | `--radius-lg` = 8px |
| Radio modales | `--radius-xl` = 12px |
| Sombra cards | `--shadow-sm` |
| Sombra modales | `--shadow-lg` |
| Espaciado base | 4px (escala entera) |
| Error | `--error-500` / `--error-50` / `--error-200` |
| Éxito | `--success-500` / `--success-50` |
| Info | `--info-500` / `--info-50` |

### Etapas del pipeline (StageBadge)

| ID | Etiqueta | Color principal |
|---|---|---|
| 1 | Interesado | Azul info |
| 2 | En conversación | Ámbar claro |
| 3 | Propuesta enviada | Ámbar |
| 4 | Comprado | Verde success |
| 5 | Perdido | Gris neutral |

### Roles de usuario

| Rol | Badge | Acceso |
|---|---|---|
| `dueña` | Ámbar (`--brand-100` / `--brand-700`) | Todas las pantallas + Administración |
| `vendedor` | Azul info (`--info-50` / `--info-600`) | Pantallas MVP (sin Administración) |

---

## Usuarios del sistema

| Usuario | Email | Contraseña | Rol |
|---|---|---|---|
| Marta López | marta@ksecrm.mx | marta2026 | dueña |
| Carlos Rueda | carlos@ksecrm.mx | carlos2026 | vendedor |

---

## Pantallas / Vistas

### 1. Login (`Login.dc.html`)

**Propósito:** Puerta de entrada al CRM. Sin login no se accede a ninguna otra pantalla.

**Layout:**
- Mobile: columna única, fondo `--bg-page`, logo KSE en ámbar, formulario centrado (max-width 380px)
- Desktop: split 50/50 — panel izquierdo `--brand-950` con tagline decorativo; panel derecho blanco con formulario

**Componentes:**
- Campo email: `Input` del DS, tipo `email`
- Campo contraseña: campo custom con toggle mostrar/ocultar (ojo SVG, 40px tap target)
- Botón "Iniciar sesión": `Button` variante `primary`, tamaño `lg`, full-width

**Estados:**
- **Idle**: formulario limpio
- **Loading**: botón deshabilitado, spinner blanco + "Verificando…", campos bloqueados (1.5s simulado)
- **Error**: banner rojo con ícono de alerta, mensaje empático: _"El correo o la contraseña no son correctos. Intenta de nuevo."_ Al escribir en cualquier campo, el error desaparece
- **Éxito**: checkmark verde, "¡Bienvenido, [Nombre]!", spinner de carga → navega a `Seguimientos` tras 1.2s

**Validación:**
- Campos vacíos: _"Ingresa tu correo y contraseña para continuar."_
- Credenciales incorrectas: mensaje empático (no técnico)

**Navegación post-login:** → Seguimientos

---

### 2. Seguimientos (`Seguimientos.dc.html`)

**Propósito:** Pantalla de entrada de la app. Lo primero que ve el usuario al loguearse.

**Layout:**
- Mobile: columna única, bottom nav fijo (64px), contenido con padding inferior 96px; FAB ámbar fijo bottom-right (56px, encima del nav)
- Desktop: header con nav links, sin bottom nav; FAB oculto, botón en header

**Header:**
- Logo "KSE CRM" en ámbar
- Nav desktop: Seguimientos (activo, ámbar) · Clientes · Reportes · Administración (solo Marta, con ícono candado)
- Botón "+ Agregar cliente" desktop
- Icono de notificaciones
- Avatar del usuario (abre panel de perfil)

**Contenido:**
- Saludo dinámico: "Buenos días/tardes/noches, [Nombre]"
- Fecha actual
- Buscador: filtra en tiempo real por nombre de cliente o empresa. Botón ✕ para limpiar. Si no hay resultados con búsqueda activa: _"Sin seguimientos para '[término]'"_ + botón "Limpiar búsqueda"
- Sección **Atrasados**: cards con `background: --error-50`, borde izquierdo `--error-500` 3px, badge rojo con contador
- Sección **Para hoy**: cards blancas, borde izquierdo `--brand-400` 3px, badge ámbar con contador
- **Estado vacío** (sin búsqueda): checkmark verde, "Todo al día", botón "Ver lista de clientes"

**Cada ítem de seguimiento muestra:**
- Avatar del cliente (DS `Avatar` tamaño `md`)
- Nombre del cliente + `StageBadge` del DS (etapa actual)
- Empresa del cliente
- Motivo del seguimiento (máx. 2 líneas, `line-clamp`)
- Responsable del seguimiento (ícono persona + nombre)
- Botón "✓ Hecho" (verde, `border-radius: full`, 28px alto) — al tocar: ítem se desliza a la derecha y desaparece (300ms ease)

**Al tocar un ítem:** navega a `Ficha.dc.html?id={clientId}`

**Bottom nav mobile (5 tabs):**
Inicio (activo) · Clientes · FAB+ central · Reportes · Perfil
Para Marta: aparece tab adicional "Admin" con ícono candado

**Panel de perfil:** bottom sheet mobile / dropdown desktop con: Avatar XL, nombre, email, badge de rol, botón "Cerrar sesión" (rojo)

---

### 3. Lista de clientes (`Clientes.dc.html`)

**Propósito:** Directorio completo de clientes con búsqueda y filtros.

**Layout:** igual que Seguimientos (mismo header, bottom nav, FAB)

**Contenido:**
- Título "Clientes" + contador dinámico ("7" sin filtro, "3 de 7" con filtro)
- Buscador: filtra por nombre, teléfono o email
- Pills de etapa (scroll horizontal): Todos · Interesado · En conv. · Propuesta · Comprado · Perdido. Activo: background `--interactive`, texto blanco
- Lista de clientes

**Cada fila de cliente:**
- `Avatar` MD del DS
- Nombre (peso 600)
- Empresa (peso 500, color secundario)
- Teléfono (xs, color terciario)
- `StageBadge` del DS

**Estado sin resultados:** lupa gris + "Sin resultados" + _"No encontramos clientes que coincidan con tu búsqueda."_ + botón "Limpiar filtros"

**Al tocar una fila:** navega a `Ficha.dc.html?id={clientId}` (guarda `kse_all_clients` en localStorage antes)

**Botón agregar:** → `NuevoCliente.dc.html`

**Persistencia:** Lee `kse_extra_clients` de localStorage en `componentDidMount` y fusiona con lista base. Escribe `kse_all_clients` (store compartido con Ficha).

---

### 4. Nuevo cliente (`NuevoCliente.dc.html`)

**Propósito:** Formulario rápido para dar de alta un cliente, optimizado para uso en campo.

**Layout:** pantalla completa, max-width 560px centrado, fondo `--bg-page`

**Header sticky:**
- "← Cancelar" (izquierda, navega atrás)
- "Nuevo cliente" (centro, peso 600)
- Botón "Guardar" primary sm (derecha, accesible desde el header)

**Campos:**
- Sección "Datos de contacto"
  - Nombre completo (`Input` DS, obligatorio)
  - Teléfono (`Input` DS, tipo `tel`)
  - Correo (`Input` DS, tipo `email`, helper: _"Necesitamos al menos el teléfono o el correo."_)
- Sección "Etapa inicial"
  - 5 cards apiladas mobile / grid 2 col desktop
  - Cada card: dot de color + label + descripción corta + checkmark si activa
  - "Interesado" preseleccionado por defecto

**Validación (al intentar guardar):**
- Nombre vacío: error inline en el campo
- Sin teléfono ni email: banner rojo + error en campo teléfono
- Banner de error: fondo `--error-50`, borde `--error-200`, ícono alerta, texto en `--error-700`

**Estado guardando:** spinner en ambos botones Guardar + campos deshabilitados

**Al guardar exitosamente:**
1. Guarda en `kse_extra_clients` (localStorage)
2. Actualiza `kse_all_clients`
3. Guarda `registeredBy` (nombre del usuario activo) y `registeredAt` (fecha formateada)
4. Navega a `Ficha.dc.html?id={nuevoId}`

---

### 5. Ficha del cliente (`Ficha.dc.html`)

**Propósito:** Pantalla central del CRM. Vista detallada de un cliente con historial e interacciones.

**Layout:**
- Mobile: columna única — sidebar arriba, historial abajo
- Desktop: sidebar fijo 280px izquierda (sticky top 72px) + área principal derecha (flex row, gap 28px)

**Header sticky:**
- "← Clientes" (botón back)
- Nav desktop: Seguimientos · Clientes (activo)
- "Ficha del cliente" (centro)
- Botón "+ Agregar cliente" (desktop)
- Notificaciones + Avatar

**Sidebar (card con `border-radius: --radius-xl`):**

*Bloque hero (border-bottom):*
- Avatar XL centrado
- Nombre (text-xl, peso 700)
- Empresa (text-sm, secundario)
- `StageBadge` clickable con chevron → abre modal "Cambiar etapa"

*Bloque contacto (border-bottom):*
- Teléfono (ícono teléfono 32px bg-surface-2 + label + valor)
- Email (ícono email 32px bg-surface-2 + label + valor)

*Bloque registro (border-bottom, solo si tiene datos):*
- "Registrado por **Carlos** · 30 jun 2026"

*3 botones de acción (columna, gap 8px):*
- "✏ Agregar nota" → modal
- "📅 Programar seguimiento" → modal
- "+ Registrar venta" → modal

**Área principal — Historial de interacciones:**
- Label "Historial de interacciones" + contador badge
- Estado vacío (sin historial): ícono reloj, _"Aún no hay interacciones registradas…"_
- Lista de ítems, más reciente primero

**Cada ítem del historial:**
- Círculo de canal (38px): WhatsApp=verde, Email=azul, Llamada=violeta, Seguimiento=ámbar, Venta=verde success
- Texto de la interacción
- Metadato: `Canal · Registrado: [fecha] · [Autor]` (xs, color terciario; autor en peso 600)

**Modal "Cambiar etapa":**
- 5 opciones en columna, cada una: dot de color + label
- Activa: `border-color: --interactive`, `background: --brand-50`
- Al seleccionar: actualiza etapa en sidebar inmediatamente, cierra modal

**Modal "Agregar nota":**
- Selector de canal: 3 botones (WhatsApp / Email / Llamada), activo con color propio
- Textarea para el texto (obligatorio)
- Campo fecha (default: hoy)
- Al guardar: ítem aparece al tope del historial con canal, fecha de registro y autor

**Modal "Programar seguimiento":**
- Campo fecha (obligatorio)
- Campo motivo texto libre (obligatorio)
- Al guardar: ítem aparece en historial como "Seguimiento programado para el [fecha] — [motivo]" con ícono calendario ámbar

**Modal "Registrar venta":**
- Selector tipo: Formación / Consultoría / Plantilla / Otro (pills)
- Campo monto (`$` prefix, `MXN` suffix)
- Campo fecha (default: hoy)
- Al guardar: ítem aparece en historial como "Venta registrada — [Tipo] · $[monto] MXN" con ícono peso verde

**Persistencia de datos del cliente:**
- Lee `?id` de la URL
- Busca en `kse_all_clients` (localStorage)
- Si no lo encuentra, muestra cliente de ejemplo (María García) como fallback

---

### 6. Usuarios y roles (`Usuarios.dc.html`)

**Propósito:** Gestión de cuentas del sistema. **Solo accesible para Marta (dueña).**

**Layout:** columna centrada, max-width 640px

**Header:**
- Breadcrumb: "← Configuración > Usuarios y roles"
- Badge "🔒 Solo dueña" en ámbar (derecha)

**Lista de usuarios:**
Cada fila (`border-radius: --radius-lg`, shadow-sm):
- `Avatar` MD del DS
- Nombre + badge de rol + "(tú)" si es la dueña
- Email
- Badge "Inactivo" si está desactivado (fila con opacity 55%)
- Botón "Editar"
- Botón "Desactivar" / "Reactivar" (solo vendedores)
- Botón papelera → confirmación inline "¿Eliminar? Sí / No" (solo vendedores)

**Modal Agregar/Editar usuario:**
- Nombre (`Input` DS)
- Email (`Input` DS)
- Contraseña (`Input` DS) — requerida al agregar, opcional al editar
- Selector de rol: solo "Vendedor" disponible (una dueña máximo). Si se edita a la dueña: su rol está bloqueado con nota explicativa
- Botones Cancelar + Guardar (con spinner)
- Toast de confirmación 3s

**Reglas de negocio:**
- La cuenta dueña (marta@ksecrm.mx) no puede ser editada en su rol, desactivada ni eliminada
- Solo puede haber una cuenta con rol "dueña"

---

### 7. Perfil (`Perfil.dc.html`)

**Propósito:** Panel de perfil del usuario activo. Accesible desde cualquier pantalla.

**Comportamiento:**
- Mobile: bottom sheet que sube desde abajo (animation: slideup 240ms cubic-bezier(0.32,0.72,0,1))
- Desktop: dropdown anclado al avatar en el header (top: 64px, right: 20px, width: 296px, animation: fadeup 160ms)
- Backdrop: oscuro en mobile, transparente en desktop

**Contenido:**
- `Avatar` XL centrado
- Nombre (text-lg, peso 700)
- Email (text-sm, secundario)
- Badge de rol (Dueña ámbar / Vendedor azul info)
- Divider
- Botón "Cerrar sesión" (rojo, full-width) → spinner + "Cerrando sesión…" → navega a Login tras 1s

---

## Interacciones y comportamiento

### Navegación general
```
Login exitoso → Seguimientos
Seguimientos → tocar ítem → Ficha (con ?id=)
Seguimientos → Clientes (nav) → Ficha (con ?id=) / NuevoCliente
NuevoCliente → guardar → Ficha (con ?id= del nuevo cliente)
Ficha → ← Clientes / Seguimientos (nav)
Cualquier pantalla → Avatar → Panel de perfil → Cerrar sesión → Login
Marta → Administración (nav) → Usuarios
```

### Animaciones
- Transiciones de background: 120ms ease
- Modales: fadeup 180ms ease (translateY 8px → 0, opacity 0 → 1)
- Bottom sheet: slideup 240ms cubic-bezier(0.32,0.72,0,1)
- Ítem "Hecho" en Seguimientos: opacity 0 + translateX(22px) en 300ms ease, luego se elimina del DOM
- Toast: toastin 200ms ease (translateY 10px → 0)
- Spinner: spin 0.7–0.8s linear infinite

### Estados de formularios
- Errores: aparecen al intentar enviar, desaparecen al editar el campo correspondiente
- Loading: campos `disabled`, botón con spinner + texto "Guardando…" / "Verificando…"

### Persistencia (localStorage)
| Clave | Contenido |
|---|---|
| `kse_extra_clients` | Array de clientes creados vía NuevoCliente |
| `kse_all_clients` | Array completo (base + extras), usado por Ficha para lookup por id |

---

## Gestión de estado

Cada pantalla es independiente. El único estado compartido entre pantallas es vía localStorage. Estado local por pantalla:

| Pantalla | Estado principal |
|---|---|
| Login | email, password, showPassword, loading, error, success |
| Seguimientos | items[], query, completing (Set), profileOpen, loggingOut |
| Clientes | clients[], query, stageFilter, modal, addForm, profileOpen |
| NuevoCliente | name, phone, email, stageIdx, errors, saving |
| Ficha | client{}, history[], activeModal, notaText/Ch/Date, segDate/Motivo, ventaTipo/Monto/Date, errors, saving, profileOpen |
| Usuarios | users[], modal, editingUser, form{}, errors, saving, confirmingDelete, toast |

---

## Iconografía

Librería: **Lucide Icons** (outline, MIT). Stroke 1.5px para ≤20px, 2px para 24px. Color siempre `currentColor`.

---

## Assets y fuentes

- **DM Sans**: Google Fonts — `https://fonts.google.com/specimen/DM-Sans`
- Avatares: círculos de iniciales generados por el componente `Avatar` del DS (7 colores ciclando por nombre)
- No hay imágenes ni assets externos adicionales

---

## Archivos incluidos

| Archivo | Descripción |
|---|---|
| `Login.dc.html` | Pantalla de inicio de sesión |
| `Seguimientos.dc.html` | Pantalla principal — pendientes del día |
| `Clientes.dc.html` | Lista de clientes con búsqueda y filtros |
| `NuevoCliente.dc.html` | Formulario de alta de cliente |
| `Ficha.dc.html` | Ficha completa del cliente |
| `Usuarios.dc.html` | Gestión de usuarios y roles (solo dueña) |
| `Perfil.dc.html` | Panel de perfil (referencia de componente) |

---

## Cobertura del MVP

| Función | Pantalla | ✓ |
|---|---|---|
| Alta de cliente | NuevoCliente | ✅ |
| Búsqueda de clientes | Clientes | ✅ |
| Registro de interacciones | Ficha → Agregar nota | ✅ |
| Recordatorio de seguimiento | Ficha → Programar seguimiento | ✅ |
| Lista de pendientes del día | Seguimientos | ✅ |
| Marcar seguimiento como hecho | Seguimientos → "Hecho" | ✅ |
| Registro de venta | Ficha → Registrar venta | ✅ |
| Alertas de seguimientos atrasados | Seguimientos (sección roja) | ✅ |
| Etapa del pipeline | Ficha + Clientes (StageBadge) | ✅ |
