const supabase = require("../supabaseClient");

async function recalcularAsignacionesCliente(clienteId) {
  // 1. Borra todas las asignaciones de ese cliente
  await supabase.from("asignaciones_pago").delete().eq("clienteId", clienteId);

  // 2. Trae trabajos y materiales pendientes + pagos del cliente
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, precioHora")
    .eq("id", clienteId)
    .single();
  if (!cliente) return;

  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("id, clienteId, fecha, horas, pagado")
    .eq("clienteId", clienteId);

  const { data: materiales } = await supabase
    .from("materiales")
    .select("id, clienteid, fecha, coste, pagado")
    .eq("clienteid", clienteId);

  const { data: pagos } = await supabase
    .from("pagos")
    .select("id, cantidad, fecha")
    .eq("clienteId", clienteId);

  // Agrupa tareas pendientes
  const tareasPendientes = [
    ...(trabajos || [])
      .filter((t) => !t.pagado)
      .map((t) => ({
        id: t.id,
        tipo: "trabajo",
        fecha: t.fecha,
        coste: t.horas * cliente.precioHora,
      })),
    ...(materiales || [])
      .filter((m) => !m.pagado)
      .map((m) => ({
        id: m.id,
        tipo: "material",
        fecha: m.fecha,
        coste: m.coste,
      })),
  ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  // Ordena los pagos por fecha
  let pagosRestantes = (pagos || [])
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .map((p) => ({ ...p, restante: Number(p.cantidad) }));

  // 3. Asignar pagos a tareas y guardar en la tabla asignaciones_pago
  let inserts = [];
  for (const tarea of tareasPendientes) {
    let pendiente = tarea.coste;
    for (const pago of pagosRestantes) {
      if (pago.restante <= 0) continue;
      const aplicar = Math.min(pago.restante, pendiente);
      if (aplicar > 0) {
        inserts.push({
          clienteId,
          pagoId: pago.id,
          tipo: tarea.tipo, // "trabajo" o "material"
          trabajoId: tarea.tipo === "trabajo" ? tarea.id : null,
          materialId: tarea.tipo === "material" ? tarea.id : null,
          usado: aplicar,
          fecha_pago: pago.fecha,
          fecha_tarea: tarea.fecha,
        });
        pago.restante -= aplicar;
        pendiente -= aplicar;
      }
      if (pendiente <= 0) break;
    }
  }

  // 4. Inserta todas las asignaciones de golpe (solo si hay)
  if (inserts.length) {
    const { error } = await supabase.from("asignaciones_pago").insert(inserts);
    if (error) {
      console.error(
        "Error insertando en asignaciones_pago:",
        error.message,
        error.details
      );
    } else {
      console.log("Insertado correctamente en asignaciones_pago");
    }
  } else {
    console.log("No hay asignaciones para insertar");
  }
}
module.exports = { recalcularAsignacionesCliente };
