# KSE CRM — Design System v1.0

> Sistema de diseño para un CRM de pequeño negocio, construido mobile-first.

## Company / Product

**KSE CRM** is a lightweight CRM built for small business owners who manage client relationships in the field and at the office. Two primary users define all design decisions:

- **Carlos** — business owner; uses the CRM from his phone while visiting clients. Every tap target, font size, and information hierarchy decision starts with his phone screen.
- **Marta** — administrative assistant; works from a PC at a desk, needs data density and keyboard efficiency.

The system is **mobile-first**: base styles target Carlos's screen; responsive overrides unlock Marta's desktop view.

### Sources

This design system was built from the **KSE CRM Design System v1.0 written specification** — a complete token and component spec provided directly. No Figma file or codebase was provided; all tokens, component code, and specimens were authored from scratch against that spec.

---

## Content Fundamentals

**Language:** Mexican Spanish throughout. All UI labels, error messages, and CTA copy are in Spanish.

**Tone:** Direct, warm, practical. No technical jargon. Carlos talks to clients while driving — the interface must speak his language, not an engineer's.

**Voice principles:**
- First person (yo/nosotros) is avoided; the interface is neutral and imperative.
- Friendly but professional — "Guardar" not "¡Listo!" or "OK".
- Action-oriented CTAs: verb first — "Agregar cliente", "Enviar propuesta", "Marcar como hecho".
- Error messages are empathetic: "No pudimos guardar. Intenta de nuevo." — never "Error 500".
- Confirmations are specific: "Cliente guardado" not just "Éxito".

**Capitalization:** Sentence case everywhere — only proper names and the brand name are capitalized. Write "Nuevo cliente", not "Nuevo Cliente".

**Numbers & Dates:** Mexican locale. Currency: `$1,250.00 MXN`. Dates: `25 jun 2026`, `hoy`, `ayer`, `hace 3 días`. Times: `3:00 pm` (lowercase).

**Emoji:** Not used in UI. The only allowed character symbol is the checkmark on the "Comprado ✓" pipeline stage — intentional and unique.

---

## Visual Foundations

**Color system:** OKLCH throughout — perceptually uniform, accessible, predictable. The brand hue is amber (48°), warm and energetic but contained for a professional feel. Neutrals lean warm (hue 65°) to harmonize with the amber. Semantic colors share the same relative chroma level across hues, so success/error/warning/info feel visually cohesive in the same UI.

**Backgrounds:** Airy and light. The default page is `--neutral-50` (barely off-white). Surfaces (cards, panels) are pure white `--neutral-0`. Contrast and hierarchy come from type weight and spacing — not background color blocks.

**Typography:** DM Sans exclusively. Geometric, humanist, excellent legibility at small sizes. 14px base on mobile (Carlos), 16px on desktop (Marta). Hard floor: 11px (labels, badges, metadata only). Never below.

**Spacing:** 4px base unit, integer multiples. All spacing tokens are multiples of 4 for pixel-perfect alignment.

**Corner radius:** Base is `--radius-md` (6px). Slightly rounded — professional, not bubbly. Cards use `--radius-lg` (8px). Modals and drawers `--radius-xl` (12px). Pills and avatars `--radius-full` (9999px).

**Shadows:** Intentionally flat. Most elements have no shadow. Cards get `--shadow-sm`. Floating menus/dropdowns get `--shadow-md`. Only modals/overlays get `--shadow-lg`. No aggressive Z-depth layers in everyday UI.

**Hover states:** Background shifts 1 step darker (e.g., `--bg-surface` → `--bg-surface-2`). Buttons darken to `--interactive-hover`. No opacity fade tricks.

**Press/active states:** One step darker than hover (`--interactive-active`). No shrink or spring animation — this is a business tool.

**Animations:** Fast and functional. Max `200ms ease`. No decorative animations. Buttons and inputs transition `background-color 120ms`. No bounce, no spring, no infinite loops.

**Borders:** Standard `1px solid var(--border)` (neutral-200 light mode). Inputs and cards share the same border. Focused inputs get a `3px` `--focus-ring` ring (amber) for accessibility.

**Imagery:** Not in v1.0. Avatars are initials circles with color derived from the contact's name — 7 hues cycling across the palette.

**Dark mode:** Supported via `[data-theme="dark"]` on the `<html>` or root element. All alias tokens auto-swap. Components built with alias tokens support dark mode for free with zero code changes.

---

## Iconography

**Library:** [Lucide Icons](https://lucide.dev) — MIT licensed, outline style.

**Style:** Outline / line icons only. No filled, duotone, or solid variants.

**Sizes:**
- 16px — inline with text, secondary UI elements, compact lists
- 20px — default, most contexts (nav items, buttons, form affixes)
- 24px — primary CTAs, main navigation, high-visibility actions

**Stroke:** 1.5px for icons ≤ 20px; 2px for 24px icons.

**Color:** Always `currentColor`. Never hardcode a color value on an icon — the parent's `color` property controls it. This means icons automatically adapt to dark mode, disabled states, and hover states.

**CDN (for prototypes):**
```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```
Or via lucide-react for React projects:
```html
<script src="https://unpkg.com/lucide-react@latest/dist/umd/lucide-react.js"></script>
```

---

## File Index

```
KSE CRM Design System
├── styles.css             — root stylesheet (link this in any project)
├── readme.md              — this file
├── SKILL.md               — agent skill instructions
│
├── tokens/
│   ├── colors.css         — brand, neutral, semantic, stage, follow-up
│   ├── typography.css     — DM Sans scale + weights + line heights
│   ├── spacing.css        — 4px-base spacing (space-1 → space-20)
│   ├── effects.css        — border radius + shadow elevation
│   └── aliases.css        — semantic light/dark alias map
│
├── components/
│   ├── actions/
│   │   └── Button         — primary/secondary/ghost/danger, 3 sizes
│   ├── feedback/
│   │   ├── Badge          — generic semantic pill
│   │   ├── StageBadge     — CRM pipeline stage pill (1–5)
│   │   └── FollowupBadge  — follow-up state pill (late/today/done)
│   ├── forms/
│   │   └── Input          — labeled input with error/helper/prefix/suffix
│   └── data/
│       ├── Avatar         — initials circle, optional photo, 5 sizes
│       └── ClientCard     — client summary (Avatar + StageBadge + FollowupBadge)
│
├── guidelines/            — foundation specimen cards (@dsCard)
│   ├── brand-colors.card.html
│   ├── neutral-colors.card.html
│   ├── semantic-colors.card.html
│   ├── stages.card.html
│   ├── followup.card.html
│   ├── type-scale.card.html
│   ├── spacing.card.html
│   ├── effects.card.html
│   └── aliases.card.html
│
└── ui_kits/
    └── crm/
        └── index.html     — mobile-first CRM dashboard (starting point)
```

### Components quick reference

| Component | Path | Description |
|-----------|------|-------------|
| Button | `components/actions/` | CTA button, 4 variants, 3 sizes |
| Badge | `components/feedback/` | Generic semantic pill |
| StageBadge | `components/feedback/` | CRM pipeline stage (1–5), auto-labeled |
| FollowupBadge | `components/feedback/` | Follow-up status (late/today/done) |
| Input | `components/forms/` | Text field with label, error, helper, prefix/suffix |
| Avatar | `components/data/` | Initials circle, 5 sizes, optional photo |
| ClientCard | `components/data/` | Client row — Avatar + StageBadge + FollowupBadge |
