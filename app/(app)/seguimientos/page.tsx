"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import {
  SeguimientoItem,
  type Seguimiento,
} from "@/components/seguimientos/SeguimientoItem";
import { Button } from "@/components/ui/Button";

/**
 * Pantalla: Seguimientos — entrada tras el login (KAR-22).
 * Atrasados (resaltados) + Para hoy, con buscador y "marcar como hecho".
 * Datos: `seguimientos.pendientes` (KAR-20/21) · cierre: `completar` (KAR-19).
 * Diseño: Design/…/Seguimientos.dc.html.
 */
const MX_TZ = "America/Mexico_City";

/** Normaliza para búsqueda: minúsculas + sin acentos. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("es-MX", {
      timeZone: MX_TZ,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MX_TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

export default function SeguimientosPage() {
  const data = useQuery(api.seguimientos.pendientes);
  const completar = useMutation(api.seguimientos.completar);
  const { user } = useCurrentUser();

  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }

  async function onComplete(id: string) {
    if (!user) {
      showToast("Cargando usuario…");
      throw new Error("sin usuario actual");
    }
    try {
      await completar({
        id: id as Id<"followups">,
        actorId: user._id,
      });
    } catch (e) {
      showToast("No se pudo marcar como hecho. Inténtalo de nuevo.");
      throw e;
    }
  }

  const q = normalize(query);
  const { overdue, today } = useMemo(() => {
    if (!data) return { overdue: [] as Seguimiento[], today: [] as Seguimiento[] };
    const match = (i: Seguimiento) =>
      !q ||
      normalize(i.clientName).includes(q) ||
      normalize(i.company).includes(q);
    return {
      overdue: (data.overdue as Seguimiento[]).filter(match),
      today: (data.today as Seguimiento[]).filter(match),
    };
  }, [data, q]);

  const firstName = user?.name.split(/\s+/)[0] ?? "";

  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
      {/* Cabecera */}
      <header>
        <h1 className="text-xl font-bold text-text-primary">
          {greeting()}
          {firstName && `, ${firstName}`}
        </h1>
        <p className="mt-0.5 text-sm text-text-secondary first-letter:uppercase">
          {todayLabel()}
        </p>
      </header>

      {/* Buscador */}
      <div className="mt-4 flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente…"
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Limpiar búsqueda"
            className="text-text-tertiary hover:text-text-primary"
          >
            <XIcon />
          </button>
        )}
      </div>

      {/* Cuerpo */}
      <div className="mt-5">
        {data === undefined ? (
          <Skeleton />
        ) : (
          <Body
            overdue={overdue}
            today={today}
            hasMore={data.hasMore}
            hasQuery={query.trim().length > 0}
            rawEmpty={data.overdue.length === 0 && data.today.length === 0}
            query={query}
            onComplete={onComplete}
            onClearQuery={() => setQuery("")}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-text-primary px-4 py-2 text-sm text-surface shadow-lg"
        >
          {toast}
        </div>
      )}
    </section>
  );
}

function Body({
  overdue,
  today,
  hasMore,
  hasQuery,
  rawEmpty,
  query,
  onComplete,
  onClearQuery,
}: {
  overdue: Seguimiento[];
  today: Seguimiento[];
  hasMore: { overdue: boolean; today: boolean };
  hasQuery: boolean;
  rawEmpty: boolean;
  query: string;
  onComplete: (id: string) => Promise<void>;
  onClearQuery: () => void;
}) {
  // Vacío total (sin datos y sin búsqueda) → "Todo al día".
  if (rawEmpty && !hasQuery) {
    return (
      <EmptyState
        tone="success"
        title="Todo al día"
        text="No tienes seguimientos atrasados ni programados para hoy. Buen trabajo."
        action={
          <Link href="/clientes">
            <Button variant="secondary" size="sm">
              Ver lista de clientes
            </Button>
          </Link>
        }
      />
    );
  }

  // Búsqueda sin resultados.
  if (overdue.length === 0 && today.length === 0) {
    return (
      <EmptyState
        tone="neutral"
        title={`Sin seguimientos para «${query.trim()}»`}
        text="No hay seguimientos pendientes para ese cliente hoy."
        action={
          <Button variant="secondary" size="sm" onClick={onClearQuery}>
            Limpiar búsqueda
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <Section
          label="Atrasados"
          count={overdue.length}
          tone="late"
          hasMore={hasMore.overdue}
        >
          {overdue.map((item) => (
            <SeguimientoItem
              key={item.id}
              item={item}
              variant="late"
              onComplete={onComplete}
            />
          ))}
        </Section>
      )}

      {today.length > 0 && (
        <Section
          label="Para hoy"
          count={today.length}
          tone="today"
          hasMore={hasMore.today}
        >
          {today.map((item) => (
            <SeguimientoItem
              key={item.id}
              item={item}
              variant="today"
              onComplete={onComplete}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  label,
  count,
  tone,
  hasMore,
  children,
}: {
  label: string;
  count: number;
  tone: "late" | "today";
  hasMore: boolean;
  children: React.ReactNode;
}) {
  const late = tone === "late";
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span
          className="inline-block h-[7px] w-[7px] rounded-full"
          style={{ backgroundColor: late ? "var(--error-500)" : "var(--brand-500)" }}
        />
        <span
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color: late ? "var(--error-600)" : "var(--brand-700)" }}
        >
          {label}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold"
          style={
            late
              ? { backgroundColor: "var(--error-500)", color: "#fff" }
              : {
                  backgroundColor: "var(--brand-100)",
                  color: "var(--brand-700)",
                  border: "1px solid var(--brand-200)",
                }
          }
        >
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
      {hasMore && (
        <p className="mt-2 text-xs text-text-tertiary">
          Hay más pendientes de los mostrados.
        </p>
      )}
    </div>
  );
}

function EmptyState({
  tone,
  title,
  text,
  action,
}: {
  tone: "success" | "neutral";
  title: string;
  text: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <span
        className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          backgroundColor:
            tone === "success" ? "var(--success-100)" : "var(--bg-surface-2)",
          color:
            tone === "success" ? "var(--success-600)" : "var(--text-tertiary)",
        }}
      >
        {tone === "success" ? <CheckIcon /> : <SearchIcon />}
      </span>
      <h2 className="text-md font-bold text-text-primary">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-text-secondary">{text}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-24 rounded bg-surface-2" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-text-tertiary">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
