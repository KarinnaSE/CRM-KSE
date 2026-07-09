import { cn } from "@/lib/utils";

/**
 * Avatar con iniciales. Sin imágenes: el color de fondo se elige de una
 * paleta fija a partir del nombre (estable por usuario/cliente).
 * Tamaños: sm (28px), md (40px), xl (64px).
 */
const SIZES = {
  sm: "h-7 w-7 text-xs",
  md: "h-10 w-10 text-sm",
  xl: "h-16 w-16 text-xl",
} as const;

// 7 pares (fondo/texto) usando tokens del design system.
const PALETTE = [
  { bg: "var(--brand-100)", fg: "var(--brand-700)" },
  { bg: "var(--info-100)", fg: "var(--info-600)" },
  { bg: "var(--success-100)", fg: "var(--success-700)" },
  { bg: "var(--warning-100)", fg: "var(--warning-600)" },
  { bg: "var(--error-100)", fg: "var(--error-700)" },
  { bg: "var(--brand-200)", fg: "var(--brand-800)" },
  { bg: "var(--bg-surface-2)", fg: "var(--text-secondary)" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const color = colorFor(name);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: color.bg, color: color.fg }}
    >
      {initials(name)}
    </span>
  );
}
