# KSE CRM — Design System v1.0

> Sistema de diseño para un CRM de pequeño negocio. Dos usuarios principales: **Carlos** (dueño del negocio, usa el CRM desde celular) y **Marta** (asistente administrativa, usa desde PC). Mobile-first en todo momento.

---

## 01 · Tipografía

**Familia única:** `DM Sans` (Google Fonts) — geométrica, amigable, excelente legibilidad en pantalla.  
**Fallback:** `-apple-system, BlinkMacSystemFont, sans-serif`  
**Pesos disponibles:** 400 (regular) · 500 (medium) · 600 (semibold) · 700 (bold)

```css
font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
```

### Escala tipográfica

| Token        | Tamaño | Peso | Line-height | Uso                          |
|--------------|--------|------|-------------|------------------------------|
| `text-3xl`   | 30px   | 700  | 1.25        | H1 — Dashboard principal     |
| `text-2xl`   | 24px   | 600  | 1.30        | H2 — Título de página        |
| `text-xl`    | 20px   | 600  | 1.35        | H3 — Título de sección       |
| `text-lg`    | 18px   | 500  | 1.40        | H4 — Subtítulo               |
| `text-md`    | 16px   | 400  | 1.50        | Cuerpo — desktop             |
| `text-base`  | 14px   | 400  | 1.55        | Cuerpo — mobile (base)       |
| `text-sm`    | 13px   | 400  | 1.50        | Texto secundario / caption   |
| `text-xs`    | 11px   | 500  | 1.45        | Labels / badges / metadata   |

**Regla:** Base de texto es 14px en mobile (Carlos), 16px en desktop (Marta). Nunca menos de 11px.

---

## 02 · Paleta de color

El sistema usa **OKLCH** para todas las escalas — perceptualmente uniforme, accesible.

### Brand — Naranja Ámbar (hue 48°)

Color principal de KSE. Energía y calidez, contenida para look profesional.

| Token          | Valor OKLCH              | Uso típico                    |
|----------------|--------------------------|-------------------------------|
| `--brand-50`   | `oklch(0.97 0.018 48)`  | Fondos tintados muy sutiles   |
| `--brand-100`  | `oklch(0.93 0.045 48)`  | Badge "Interesado" bg         |
| `--brand-200`  | `oklch(0.87 0.090 48)`  | Badge "En conversación" bg    |
| `--brand-300`  | `oklch(0.78 0.140 48)`  | Barras de progreso, acentos   |
| `--brand-400`  | `oklch(0.70 0.175 48)`  | Badge "Propuesta enviada" bg  |
| `--brand-500`  | `oklch(0.63 0.195 48)`  | **Color principal KSE**       |
| `--brand-600`  | `oklch(0.55 0.185 48)`  | Hover de botón primario       |
| `--brand-700`  | `oklch(0.46 0.165 48)`  | Active / pressed              |
| `--brand-800`  | `oklch(0.37 0.130 48)`  | Texto sobre fondos claros     |
| `--brand-900`  | `oklch(0.28 0.090 48)`  | Texto de alto contraste       |
| `--brand-950`  | `oklch(0.20 0.060 48)`  | Máximo contraste              |

### Neutral — Warm Gray (hue 65°)

Grises cálidos que armonizan con el ámbar de la marca.

| Token            | Valor                    | Uso típico                |
|------------------|--------------------------|---------------------------|
| `--neutral-0`    | `#ffffff`               | Blanco puro               |
| `--neutral-50`   | `oklch(0.985 0.003 65)` | Fondo de página           |
| `--neutral-100`  | `oklch(0.965 0.006 65)` | Hover, inputs             |
| `--neutral-200`  | `oklch(0.920 0.010 65)` | Bordes estándar           |
| `--neutral-300`  | `oklch(0.860 0.013 65)` | Bordes enfatizados        |
| `--neutral-400`  | `oklch(0.730 0.014 65)` | Placeholder / metadata    |
| `--neutral-500`  | `oklch(0.600 0.014 65)` | Texto deshabilitado       |
| `--neutral-600`  | `oklch(0.480 0.013 65)` | Texto secundario          |
| `--neutral-700`  | `oklch(0.380 0.011 65)` | Iconos                    |
| `--neutral-800`  | `oklch(0.270 0.008 65)` | Texto primario suave      |
| `--neutral-900`  | `oklch(0.170 0.005 65)` | Texto primario            |
| `--neutral-950`  | `oklch(0.120 0.003 65)` | Fondos dark mode          |

### Semánticos

Todos comparten la misma chroma relativa para cohesión visual entre estados.

| Color    | Hue  | Tokens                                                                                      |
|----------|------|---------------------------------------------------------------------------------------------|
| Success  | 155° | `--success-50/100/200/500/600/700`                                                         |
| Error    | 25°  | `--error-50/100/200/500/600/700`                                                           |
| Warning  | 80°  | `--warning-50/100/500/600`                                                                 |
| Info     | 250° | `--info-50/100/500/600`                                                                    |

```
Success:  oklch(L C 155)  — verde
Error:    oklch(L C 25)   — rojo
Warning:  oklch(L C 80)   — ámbar (hue distinto al brand para distinguir)
Info:     oklch(L C 250)  — azul
```

---

## 03 · Alias Tokens (semánticos por modo)

Usar **siempre estos alias** en componentes, nunca los primitivos directamente. Se adaptan automáticamente a claro/oscuro.

| Token                  | Claro (ref)      | Oscuro (ref)      | Uso                              |
|------------------------|------------------|-------------------|----------------------------------|
| `--bg-page`            | neutral-50       | neutral-950       | Fondo de la página               |
| `--bg-surface`         | neutral-0        | neutral-900       | Cards, paneles, modales          |
| `--bg-surface-2`       | neutral-100      | neutral-800       | Hover, inputs, fondos anidados   |
| `--border`             | neutral-200      | neutral-700       | Borde estándar                   |
| `--border-subtle`      | neutral-100      | neutral-800       | Divisor sutil entre ítems        |
| `--text-primary`       | neutral-900      | neutral-50        | Texto principal                  |
| `--text-secondary`     | neutral-600      | neutral-400       | Texto secundario                 |
| `--text-tertiary`      | neutral-400      | neutral-600       | Placeholder, metadata            |
| `--text-on-brand`      | #ffffff          | #ffffff           | Texto sobre fondo brand          |
| `--interactive`        | brand-500        | brand-400         | Botón primario, link activo      |
| `--interactive-hover`  | brand-600        | brand-300         | Estado hover                     |
| `--interactive-active` | brand-700        | brand-200         | Estado pressed                   |
| `--focus-ring`         | brand-400        | brand-500         | Anillo de foco (accesibilidad)   |

---

## 04 · Etapas del cliente (pipeline CRM)

Escala progresiva usando la paleta Brand. "Comprado" usa verde (intuición universal de éxito). "Perdido" usa neutral gris (inactividad, sin alarma).

| N° | Nombre             | bg token          | text token         | border token        |
|----|--------------------|-------------------|--------------------|---------------------|
| 1  | Interesado         | `--stage-1-bg`   | `--stage-1-text`   | `--stage-1-border` |
| 2  | En conversación    | `--stage-2-bg`   | `--stage-2-text`   | `--stage-2-border` |
| 3  | Propuesta enviada  | `--stage-3-bg`   | `--stage-3-text`   | `--stage-3-border` |
| 4  | Comprado ✓         | `--stage-4-bg`   | `--stage-4-text`   | `--stage-4-border` |
| 5  | Perdido            | `--stage-5-bg`   | `--stage-5-text`   | `--stage-5-border` |

```css
/* Valores reales */
--stage-1-bg: var(--brand-100);    --stage-1-text: var(--brand-700);    --stage-1-border: var(--brand-200);
--stage-2-bg: var(--brand-200);    --stage-2-text: var(--brand-800);    --stage-2-border: var(--brand-300);
--stage-3-bg: var(--brand-400);    --stage-3-text: #ffffff;             --stage-3-border: var(--brand-400);
--stage-4-bg: var(--success-100);  --stage-4-text: var(--success-700);  --stage-4-border: var(--success-500);
--stage-5-bg: var(--neutral-100);  --stage-5-text: var(--neutral-500);  --stage-5-border: var(--neutral-300);
```

Renderizar como **pill/badge**: `border-radius: 9999px; padding: 5px 14px; font-size: 12px; font-weight: 600`.

---

## 05 · Estados de seguimiento

Tres estados con jerarquía visual clara. **"Atrasado"** en rojo — Carlos debe detectarlo de un vistazo desde el celular.

| Estado   | Token base              | Descripción                                              |
|----------|-------------------------|----------------------------------------------------------|
| Atrasado | `--followup-late-*`    | Seguimiento vencido. Visibilidad máxima, acción urgente. |
| Hoy      | `--followup-today-*`   | Seguimiento programado para hoy. Acción pendiente.       |
| Hecho    | `--followup-done-*`    | Completado. Registro informativo, sin acción.            |

```css
--followup-late-bg:   var(--error-50);    --followup-late-text:   var(--error-600);    --followup-late-border:   var(--error-200);
--followup-today-bg:  var(--brand-50);    --followup-today-text:  var(--brand-700);    --followup-today-border:  var(--brand-200);
--followup-done-bg:   var(--success-50);  --followup-done-text:   var(--success-600);  --followup-done-border:   var(--success-200);
```

---

## 06 · Espaciado

Base de **4px**. Multiplicadores enteros para alineación pixel-perfect.

| Token        | Valor | Uso principal                     |
|--------------|-------|-----------------------------------|
| `--space-1`  | 4px   | Gap mínimo, padding de ícono      |
| `--space-2`  | 8px   | Padding small, gap de badge       |
| `--space-3`  | 12px  | Gap entre ítems de lista          |
| `--space-4`  | 16px  | Padding de componente (base)      |
| `--space-5`  | 20px  | Gap entre grupos                  |
| `--space-6`  | 24px  | Padding de card                   |
| `--space-8`  | 32px  | Separación entre secciones        |
| `--space-10` | 40px  | Padding de página (mobile)        |
| `--space-12` | 48px  | Padding de página (desktop)       |
| `--space-16` | 64px  | Separación de bloques grandes     |
| `--space-20` | 80px  | Separación máxima                 |

---

## 07 · Border Radius y Sombras

### Border Radius

Esquinas levemente redondeadas — profesional sin ser frío. **Base es `--radius-md` (6px).**

| Token           | Valor   | Uso                              |
|-----------------|---------|----------------------------------|
| `--radius-none` | 0       | Tablas, filas de lista           |
| `--radius-sm`   | 4px     | Badges pequeños, chips           |
| `--radius-md`   | 6px     | **Base** — botones, inputs, cards|
| `--radius-lg`   | 8px     | Cards destacadas, panels         |
| `--radius-xl`   | 12px    | Modales, drawers                 |
| `--radius-full` | 9999px  | Pills, avatares circulares       |

### Sombras — Elevation

| Token          | Valor CSS                                                              | Uso         |
|----------------|------------------------------------------------------------------------|-------------|
| `--shadow-none`| `none`                                                                | Flat / base |
| `--shadow-sm`  | `0 1px 2px oklch(0 0 0/0.06), 0 1px 3px oklch(0 0 0/0.10)`          | Cards       |
| `--shadow-md`  | `0 2px 4px oklch(0 0 0/0.06), 0 4px 6px oklch(0 0 0/0.08)`          | Dropdowns   |
| `--shadow-lg`  | `0 4px 6px oklch(0 0 0/0.05), 0 10px 15px oklch(0 0 0/0.10)`        | Modales     |

---

## 08 · Breakpoints

**Mobile-first.** El diseño base siempre es para Carlos en celular.

| Nombre | min-width | Uso                                       | Usuario principal       |
|--------|-----------|-------------------------------------------|-------------------------|
| `xs`   | 0px       | Base — diseño mobile-first                | **Carlos (celular) ★**  |
| `sm`   | 480px     | Móvil grande, más contenido por fila      | —                       |
| `md`   | 768px     | Tablet — sidebar colapsado, 2 columnas    | —                       |
| `lg`   | 1024px    | Desktop — sidebar visible, layout completo| —                       |
| `xl`   | 1280px    | Desktop ancho — más datos visibles        | **Marta (PC) ★**        |
| `2xl`  | 1440px    | Pantallas grandes — máximo contenido      | Marta (PC)              |

---

## 09 · Sistema de ícones

| Propiedad  | Valor                                       |
|------------|---------------------------------------------|
| Librería   | **Lucide Icons** — lucide.dev (MIT)         |
| Estilo     | Outline / line                              |
| Stroke     | 1.5px para ≤20px · 2px para 24px           |
| Tamaños    | 16px (inline) · 20px (default) · 24px (CTA)|
| Color      | Hereda `currentColor` — nunca hardcodear   |

---

## 10 · CSS Tokens completos

Copiar en `:root` de cualquier proyecto. Compatible con Tailwind (como CSS vars), Figma Tokens Plugin y cualquier framework moderno.

```css
/* ════════════════════════════════════════════════
   KSE CRM — Design System v1.0
   Copiar en :root de tu proyecto
════════════════════════════════════════════════ */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');

:root {

/* ── Brand: Naranja Ámbar ── */
--brand-50:  oklch(0.97 0.018 48);
--brand-100: oklch(0.93 0.045 48);
--brand-200: oklch(0.87 0.090 48);
--brand-300: oklch(0.78 0.140 48);
--brand-400: oklch(0.70 0.175 48);
--brand-500: oklch(0.63 0.195 48);  /* Color principal KSE */
--brand-600: oklch(0.55 0.185 48);
--brand-700: oklch(0.46 0.165 48);
--brand-800: oklch(0.37 0.130 48);
--brand-900: oklch(0.28 0.090 48);
--brand-950: oklch(0.20 0.060 48);

/* ── Neutral: Warm Gray ── */
--neutral-0:   #ffffff;
--neutral-50:  oklch(0.985 0.003 65);
--neutral-100: oklch(0.965 0.006 65);
--neutral-200: oklch(0.920 0.010 65);
--neutral-300: oklch(0.860 0.013 65);
--neutral-400: oklch(0.730 0.014 65);
--neutral-500: oklch(0.600 0.014 65);
--neutral-600: oklch(0.480 0.013 65);
--neutral-700: oklch(0.380 0.011 65);
--neutral-800: oklch(0.270 0.008 65);
--neutral-900: oklch(0.170 0.005 65);
--neutral-950: oklch(0.120 0.003 65);

/* ── Semántico: Success ── */
--success-50:  oklch(0.97 0.030 155);
--success-100: oklch(0.92 0.065 155);
--success-200: oklch(0.87 0.080 155);
--success-500: oklch(0.58 0.155 155);
--success-600: oklch(0.50 0.145 155);
--success-700: oklch(0.42 0.130 155);

/* ── Semántico: Error ── */
--error-50:  oklch(0.97 0.025 25);
--error-100: oklch(0.92 0.055 25);
--error-200: oklch(0.87 0.080 25);
--error-500: oklch(0.56 0.215 25);
--error-600: oklch(0.47 0.200 25);
--error-700: oklch(0.39 0.175 25);

/* ── Semántico: Warning ── */
--warning-50:  oklch(0.98 0.020 80);
--warning-100: oklch(0.95 0.055 80);
--warning-500: oklch(0.76 0.160 80);
--warning-600: oklch(0.66 0.155 80);

/* ── Semántico: Info ── */
--info-50:  oklch(0.97 0.020 250);
--info-100: oklch(0.93 0.045 250);
--info-500: oklch(0.58 0.155 250);
--info-600: oklch(0.50 0.145 250);

/* ── Alias — Modo Claro (default) ── */
--bg-page:            var(--neutral-50);
--bg-surface:         var(--neutral-0);
--bg-surface-2:       var(--neutral-100);
--border:             var(--neutral-200);
--border-subtle:      var(--neutral-100);
--text-primary:       var(--neutral-900);
--text-secondary:     var(--neutral-600);
--text-tertiary:      var(--neutral-400);
--text-on-brand:      #ffffff;
--interactive:        var(--brand-500);
--interactive-hover:  var(--brand-600);
--interactive-active: var(--brand-700);
--focus-ring:         var(--brand-400);

/* ── Etapas del cliente ── */
--stage-1-bg: var(--brand-100);    --stage-1-text: var(--brand-700);    --stage-1-border: var(--brand-200);
--stage-2-bg: var(--brand-200);    --stage-2-text: var(--brand-800);    --stage-2-border: var(--brand-300);
--stage-3-bg: var(--brand-400);    --stage-3-text: #ffffff;             --stage-3-border: var(--brand-400);
--stage-4-bg: var(--success-100);  --stage-4-text: var(--success-700);  --stage-4-border: var(--success-500);
--stage-5-bg: var(--neutral-100);  --stage-5-text: var(--neutral-500);  --stage-5-border: var(--neutral-300);

/* ── Seguimientos ── */
--followup-late-bg:  var(--error-50);    --followup-late-text:  var(--error-600);    --followup-late-border:  var(--error-200);
--followup-today-bg: var(--brand-50);    --followup-today-text: var(--brand-700);    --followup-today-border: var(--brand-200);
--followup-done-bg:  var(--success-50);  --followup-done-text:  var(--success-600);  --followup-done-border:  var(--success-200);

/* ── Tipografía ── */
--font-family:     'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
--text-xs:   11px;  --text-sm:   13px;  --text-base: 14px;
--text-md:   16px;  --text-lg:   18px;  --text-xl:   20px;
--text-2xl:  24px;  --text-3xl:  30px;
--leading-tight:   1.25;  --leading-snug:    1.35;
--leading-normal:  1.50;  --leading-relaxed: 1.55;
--font-regular:  400;  --font-medium:   500;
--font-semibold: 600;  --font-bold:     700;

/* ── Espaciado ── */
--space-1:  4px;  --space-2:  8px;   --space-3:  12px;
--space-4: 16px;  --space-5: 20px;   --space-6:  24px;
--space-8: 32px;  --space-10: 40px;  --space-12: 48px;
--space-16: 64px; --space-20: 80px;

/* ── Border Radius ── */
--radius-none: 0;      --radius-sm:   4px;
--radius-md:   6px;    --radius-lg:   8px;
--radius-xl:   12px;   --radius-full: 9999px;

/* ── Sombras ── */
--shadow-none: none;
--shadow-sm:   0 1px 2px oklch(0 0 0/0.06), 0 1px 3px oklch(0 0 0/0.10);
--shadow-md:   0 2px 4px oklch(0 0 0/0.06), 0 4px 6px oklch(0 0 0/0.08);
--shadow-lg:   0 4px 6px oklch(0 0 0/0.05), 0 10px 15px oklch(0 0 0/0.10);

/* ── Breakpoints (referencia — usar como min-width en media queries) ── */
/* xs:  0px    — mobile base (Carlos en celular)   */
/* sm:  480px  — móvil grande                      */
/* md:  768px  — tablet                            */
/* lg:  1024px — desktop                           */
/* xl:  1280px — desktop ancho (Marta en PC)       */
/* 2xl: 1440px — pantallas grandes                 */

/* ── Iconografía ── */
/* Librería: Lucide Icons (lucide.dev, MIT)         */
/* Estilo:   Outline · stroke 1.5px (≤20px) · 2px  */
/* Tamaños:  16px (inline) · 20px (default) · 24px */
/* Color:    currentColor — nunca hardcodear        */

}

/* ── Alias — Modo Oscuro ── */
[data-theme="dark"] {
  --bg-page:            var(--neutral-950);
  --bg-surface:         var(--neutral-900);
  --bg-surface-2:       var(--neutral-800);
  --border:             var(--neutral-700);
  --border-subtle:      var(--neutral-800);
  --text-primary:       var(--neutral-50);
  --text-secondary:     var(--neutral-400);
  --text-tertiary:      var(--neutral-600);
  --interactive:        var(--brand-400);
  --interactive-hover:  var(--brand-300);
  --interactive-active: var(--brand-200);
  --focus-ring:         var(--brand-500);
}
```

---

## 11 · Principios de diseño

1. **Mobile-first siempre.** Carlos usa el CRM desde el celular mientras visita clientes. Cada decisión de diseño empieza por el contexto de pantalla pequeña y gestos táctiles.
2. **Claridad sobre densidad.** Un CRM de pequeño negocio no es un Bloomberg terminal. Preferir espacio en blanco, tipografía legible y jerarquía clara sobre empaquetar más datos.
3. **Estados semánticos inconfundibles.** "Atrasado" en rojo, "Comprado" en verde — el usuario no debe pensar, debe actuar.
4. **Tokens, nunca valores hardcodeados.** Siempre usar `var(--alias-token)` en componentes. Nunca escribir `oklch(0.63 0.195 48)` directamente en un componente.
5. **Hit targets mínimos de 44px** en mobile para todos los elementos interactivos.
6. **Sombras planas.** Máximo `--shadow-md` en elementos flotantes del día a día. `--shadow-lg` solo para modales.

---

*KSE CRM Design System v1.0 — generado desde `KSE CRM Design System.dc.html`*
