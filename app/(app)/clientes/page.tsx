"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, STAGES, type StageKey } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ClientListItem } from "@/components/clientes/ClientListItem";

/**
 * Pantalla: Lista de clientes con buscador (KAR-14) + Búsqueda (KAR-13).
 * Muestra todos los clientes con su etapa; filtra por texto (nombre/empresa/
 * teléfono/email, substring insensible a acentos) y por etapa. Tocar una fila
 * abre su Ficha. El chrome global (nav + FAB "Agregar cliente") lo da AppShell.
 *
 * DECISIÓN DE PRODUCTO (visibilidad): en este CRM de 2 personas (Marta/Carlos)
 * todos ven todos los clientes, igual que en Seguimientos. Por eso se consume
 * `clients.list` (que devuelve toda la tabla) sin filtrar por usuario.
 *
 * SUPUESTO MVP (volumen): `clients.list` hace `collect()` sin cota y el filtrado
 * es en cliente. Es adecuado para el volumen esperado del MVP. Si /clientes se
 * vuelve hot-path con miles de registros, migrar a paginación + búsqueda en
 * backend (searchIndex `search_name` ya existe en el esquema como punto de partida).
 */

/** Normaliza para búsqueda: minúsculas + sin acentos + trim (copia local; ver Seguimientos). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Etiquetas cortas de las píldoras de filtro (el nombre completo va en StageBadge). */
const SHORT_LABELS: Record<StageKey, string> = {
  interesado: "Interesado",
  en_conversacion: "En conv.",
  propuesta_enviada: "Propuesta",
  comprado: "Comprado",
  perdido: "Perdido",
};

type StageFilter = StageKey | "todos";

export default function ClientesPage() {
  const clients = useQuery(api.clients.list);

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("todos");

  const q = normalize(query);
  const filtersActive = q.length > 0 || stageFilter !== "todos";

  const filtered = useMemo(() => {
    if (!clients) return [];
    return clients.filter((c) => {
      const byStage = stageFilter === "todos" || c.stage === stageFilter;
      if (!byStage) return false;
      if (!q) return true;
      const haystack = normalize(
        [c.name, c.company ?? "", c.phone ?? "", c.email ?? ""].join(" "),
      );
      return haystack.includes(q);
    });
  }, [clients, q, stageFilter]);

  function clearFilters() {
    setQuery("");
    setStageFilter("todos");
  }

  const total = clients?.length ?? 0;
  const countLabel = filtersActive
    ? `${filtered.length} de ${total}`
    : `${total} ${total === 1 ? "cliente" : "clientes"}`;

  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
      {/* Cabecera */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-2xl font-bold text-text-primary">Clientes</h1>
        {clients !== undefined && (
          <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-text-secondary">
            {countLabel}
          </span>
        )}
      </header>

      {/* Buscador */}
      <div className="mt-4 flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, empresa, teléfono o email…"
          aria-label="Buscar clientes"
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

      {/* Píldoras de filtro por etapa */}
      <div className="mt-3 flex flex-wrap gap-2">
        <FilterPill
          active={stageFilter === "todos"}
          onClick={() => setStageFilter("todos")}
        >
          Todos
        </FilterPill>
        {STAGES.map((s) => (
          <FilterPill
            key={s.key}
            active={stageFilter === s.key}
            onClick={() => setStageFilter(s.key)}
          >
            {SHORT_LABELS[s.key]}
          </FilterPill>
        ))}
      </div>

      {/* Cuerpo */}
      <div className="mt-5">
        {clients === undefined ? (
          <Skeleton />
        ) : total === 0 ? (
          <EmptyState
            title="Aún no hay clientes"
            text="Agrega tu primer cliente para empezar a darle seguimiento."
            action={
              <Link
                href="/clientes/nuevo"
                className="inline-flex h-8 items-center justify-center gap-2 rounded-full bg-interactive px-3 text-sm font-semibold text-text-on-brand transition-colors hover:bg-interactive-hover active:bg-interactive-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Agregar cliente
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            text="No encontramos clientes que coincidan con tu búsqueda o filtro."
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <ClientListItem key={c._id} client={c} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 rounded-full border px-3 text-sm font-medium transition-colors",
        active
          ? "border-interactive bg-brand-50 font-semibold text-brand-700"
          : "border-border bg-surface text-text-secondary hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-text-tertiary">
        <UsersIcon />
      </span>
      <h2 className="text-md font-bold text-text-primary">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-text-secondary">{text}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-lg bg-surface-2" />
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

function UsersIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
