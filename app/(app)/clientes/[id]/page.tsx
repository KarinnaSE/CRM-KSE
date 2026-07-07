/**
 * Pantalla: Ficha del cliente — pantalla central del CRM.
 * Datos de contacto, etapa (cambiable), historial unificado (notas +
 * seguimientos + ventas), y acciones: agregar nota, programar seguimiento,
 * registrar venta.
 * Diseño: Design/…/Ficha.dc.html · Linear: KAR-17, KAR-15, KAR-16.
 */
export default async function FichaClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <section className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold text-text-primary">Ficha del cliente</h1>
      <p className="mt-2 text-base text-text-secondary">
        Cliente <code>{id}</code> — pendiente de construir.
      </p>
    </section>
  );
}
