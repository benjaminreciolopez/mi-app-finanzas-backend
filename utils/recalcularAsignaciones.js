// utils/recalcularAsignaciones.js

async function recalcularAsignacionesCliente(supabase, clienteId) {
  // Elimina asignaciones previas de este cliente
  await supabase
    .from("asignaciones_pago")
    .delete()
    .match({ cliente_id: clienteId }); // necesitas añadir cliente_id en la tabla, si no: filtra por trabajos/materiales del cliente

  // 1. Carga trabajos y materiales pendientes
  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("id, clienteId, horas, pagado, fecha")
    .eq("clienteId", clienteId);

  const { data: materiales } = await supabase
    .from("materiales")
    .select("id, clienteid, coste, pagado, fecha")
    .eq("clienteid", clienteId);

  const { data: clienteData } = await supabase
    .from("clientes")
    .select("id, precioHora")
    .eq("id", clienteId)
    .single();

  const precioHora = clienteData.precioHora;

  const items = [
    ...trabajos
      .filter((t) => !t.pagado)
      .map((t) => ({
        tipo: "trabajo",
        id: t.id,
        fecha: t.fecha,
        coste: Number(t.horas) * Number(precioHora),
      })),
    ...materiales
      .filter((m) => !m.pagado)
      .map((m) => ({
        tipo: "material",
        id: m.id,
        fecha: m.fecha,
        coste: Number(m.coste),
      })),
  ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  // 2. Carga pagos (FIFO)
  const { data: pagos } = await supabase
    .from("pagos")
    .select("id, cantidad, fecha")
    .eq("clienteId", clienteId)
    .order("fecha", { ascending: true });

  let saldoPagos = pagos.map((p) => ({
    id: p.id,
    cantidad: Number(p.cantidad),
    restante: Number(p.cantidad),
  }));

  // 3. Recorre tareas pendientes y va asignando pagos
  for (const item of items) {
    let pendiente = item.coste;
    for (const pago of saldoPagos) {
      if (pago.restante <= 0 || pendiente <= 0) continue;
      const uso = Math.min(pago.restante, pendiente);
      // Inserta asignación
      await supabase.from("asignaciones_pago").insert([
        {
          pago_id: pago.id,
          tipo: item.tipo,
          item_id: item.id,
          cantidad: uso,
          // Puedes añadir cliente_id aquí si la tabla lo tiene
        },
      ]);
      pago.restante -= uso;
      pendiente -= uso;
    }
  }
}

module.exports = { recalcularAsignacionesCliente };
