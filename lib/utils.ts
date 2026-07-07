/** Une clases condicionalmente (ignora valores falsy). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Etiquetas y orden de las 5 etapas del pipeline (coinciden con el diseño). */
export const STAGES = [
  { key: "interesado", label: "Interesado" },
  { key: "en_conversacion", label: "En conversación" },
  { key: "propuesta_enviada", label: "Propuesta enviada" },
  { key: "comprado", label: "Comprado" },
  { key: "perdido", label: "Perdido" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
