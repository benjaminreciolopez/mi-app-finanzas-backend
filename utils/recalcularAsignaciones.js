// backend/utils/recalcularAsignaciones.js
const supabase = require("../supabaseClient");

async function recalcularAsignacionesCliente(clienteId) {
  console.log("\n---- INICIO RECÁLCULO ASIGNACIONES ----");
  console.log("ClienteId recibido:", clienteId);

  // 1. Borra todas las asignaciones de ese cliente
  await supabase.from("asignaciones_pago").delete().eq("clienteid", clienteId);

  // 2. Marca todos los trabajos y materiales como NO pagados
  await supabase
    .from("trabajos")
    .update({ pagado: false })
    .eq("clienteId", clienteId);

  await supabase
    .from("materiales")
    .update({ pagado: false })
    .eq("clienteid", clienteId);

  // 3. Trae datos cliente, trabajos, materiales y pagos
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, precioHora")
    .eq("id", clienteId)
    .single();

  if (!cliente) {
    console.error("No se encontró el cliente.");
    return;
  }

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

  // 4. Agrupa tareas pendientes (trabajos y materiales NO pagados)
  const tareasPendientes = [
    ...(trabajos || []).map((t) => ({
      id: t.id,
      tipo: "trabajo",
      fecha: t.fecha,
      coste: t.horas * cliente.precioHora,
    })),
    ...(materiales || []).map((m) => ({
      id: m.id,
      tipo: "material",
      fecha: m.fecha,
      coste: m.coste,
    })),
  ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  // 5. Ordena pagos (y filtra negativos si quieres)
  let pagosRestantes = (pagos || [])
    .filter((p) => p.cantidad > 0)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .map((p) => ({ ...p, restante: Number(p.cantidad) }));

  // 6. Asignar pagos a tareas y preparar inserts
  let inserts = [];
  for (const tarea of tareasPendientes) {
    let pendiente = tarea.coste;
    for (const pago of pagosRestantes) {
      if (pago.restante <= 0) continue;
      const aplicar = Math.min(pago.restante, pendiente);
      if (aplicar > 0) {
        inserts.push({
          clienteid: clienteId,
          pagoid: pago.id,
          tipo: tarea.tipo,
          trabajoid: tarea.tipo === "trabajo" ? tarea.id : null,
          materialid: tarea.tipo === "material" ? tarea.id : null,
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

  // 7. Inserta todas las asignaciones de golpe (solo si hay)
  if (inserts.length) {
    const result = await supabase.from("asignaciones_pago").insert(inserts);
    if (result.error) {
      console.error(
        "Error insertando en asignaciones_pago:",
        result.error.message,
        result.error.details
      );
    }
  }

  // 8. Marca como pagados los trabajos/materiales TOTALMENTE cubiertos
  // Trae asignaciones frescas tras el insert:
  const { data: nuevasAsignaciones } = await supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("clienteid", clienteId);

  // Trabajos
  for (const t of trabajos || []) {
    const asignado = (nuevasAsignaciones || [])
      .filter((a) => a.trabajoid === t.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    const coste = t.horas * cliente.precioHora;
    if (asignado >= coste - 0.01) {
      // margen de redondeo
      await supabase.from("trabajos").update({ pagado: true }).eq("id", t.id);
    }
  }
  // Materiales
  for (const m of materiales || []) {
    const asignado = (nuevasAsignaciones || [])
      .filter((a) => a.materialid === m.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    if (asignado >= m.coste - 0.01) {
      await supabase.from("materiales").update({ pagado: true }).eq("id", m.id);
    }
  }

  console.log("---- FIN RECÁLCULO ASIGNACIONES ----\n");
  return inserts.length;
}

module.exports = { recalcularAsignacionesCliente };
