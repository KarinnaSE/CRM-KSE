/**
 * Pantalla: Nuevo cliente.
 * Campos: nombre (obligatorio), empresa/negocio (opcional), teléfono, email,
 * etapa inicial ("Interesado" por defecto). Regla: nombre + al menos teléfono
 * o email. Al guardar, navega a la Ficha del cliente creado.
 * Diseño: Design/…/NuevoCliente.dc.html · Linear: KAR-12, KAR-11.
 */
export default function NuevoClientePage() {
  return (
    <section className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold text-text-primary">Nuevo cliente</h1>
      <p className="mt-2 text-base text-text-secondary">Pendiente de construir.</p>
    </section>
  );
}
