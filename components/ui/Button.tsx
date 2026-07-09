import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

/**
 * Botón base del design system. Variantes: primary, secondary, ghost, danger.
 * Tamaños: sm, md. Usa alias semánticos (se adapta a claro/oscuro).
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-interactive text-text-on-brand hover:bg-interactive-hover active:bg-interactive-active",
  secondary:
    "border border-border bg-surface text-text-primary hover:bg-surface-2",
  ghost: "text-text-secondary hover:bg-surface-2",
  danger: "text-error-600 hover:bg-error-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
