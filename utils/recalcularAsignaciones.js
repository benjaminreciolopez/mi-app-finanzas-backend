const supabase = require("../supabaseClient");

/**
 * Recalcula las asignaciones de pagos para un cliente:
 * - Borra todas las asignaciones antiguas del cliente.
 * - Reparte el saldo (pagos) entre trabajos/materiales pendientes, de forma FIFO y parcial.
 * - Marca como pagado solo los trabajos/materiales que queden cubiertos.
 * - No cambia trabajos pagados a pendientes, salvo si ya no tienen suficiente asignado.
 */
async function recalcularAsignaciones(clienteId) {
  // 1. Borra todas las asignaciones de ese cliente
  const { error: errDel } = await supabase
    .from("asignaciones_pago")
    .delete()
    .eq("clienteid", clienteId);
  if (errDel) {
    console.error("Error al borrar asignaciones anteriores:", errDel.message);
    return;
  }

  // 2. Trae datos necesarios
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
    .select("id, clienteId, fecha, horas, pagado, cuadrado")
    .eq("clienteId", clienteId);

  const { data: materiales } = await supabase
    .from("materiales")
    .select("id, clienteId, fecha, coste, pagado, cuadrado")
    .eq("clienteId", clienteId);

  const { data: pagos } = await supabase
    .from("pagos")
    .select("id, cantidad, fecha")
    .eq("clienteId", clienteId);

  // 3. Agrupa tareas pendientes (solo NO pagados/cuadrados)
  const tareasPendientes = [
    ...(trabajos || [])
      .filter((t) => t.cuadrado !== 1)
      .map((t) => ({
        id: t.id,
        tipo: "trabajo",
        fecha: t.fecha,
        coste: t.horas * cliente.precioHora,
      })),
    ...(materiales || [])
      .filter((m) => m.cuadrado !== 1)
      .map((m) => ({
        id: m.id,
        tipo: "material",
        fecha: m.fecha,
        coste: m.coste,
      })),
  ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)); // FIFO

  // 4. Reparte el saldo de los pagos (también FIFO)
  let pagosRestantes = (pagos || [])
    .filter((p) => p.cantidad > 0)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .map((p) => ({ ...p, restante: Number(p.cantidad) }));

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

  // 5. Inserta asignaciones de golpe
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

  // 6. Marca pagados/cuadrados solo los cubiertos realmente
  await actualizarPagadosCliente(clienteId, supabase);

  return { asignaciones: inserts.length };
}

// ---- AUX: Marca como pagado/cuadrado solo si tiene todo cubierto, si no lo deja pendiente
async function actualizarPagadosCliente(clienteId, supabase) {
  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("id, horas, pagado, cuadrado")
    .eq("clienteId", clienteId);

  const { data: cliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (!trabajos || !cliente) return;

  const { data: asignaciones } = await supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("clienteid", clienteId);

  const { data: materiales } = await supabase
    .from("materiales")
    .select("id, coste, pagado, cuadrado")
    .eq("clienteId", clienteId);

  // Trabajos
  for (const t of trabajos) {
    const asignado = (asignaciones || [])
      .filter((a) => a.trabajoid === t.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    const coste = t.horas * cliente.precioHora;
    const pagado = asignado >= coste ? 1 : 0;
    const cuadrado = pagado;
    if (t.pagado !== pagado || t.cuadrado !== cuadrado) {
      const { error } = await supabase
        .from("trabajos")
        .update({ pagado, cuadrado })
        .eq("id", t.id);
      if (error)
        console.error("Error actualizando trabajo:", t.id, error.message);
    }
  }

  // Materiales
  for (const m of materiales || []) {
    const asignado = (asignaciones || [])
      .filter((a) => a.materialid === m.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    const pagado = asignado >= m.coste ? 1 : 0;
    const cuadrado = pagado;
    if (m.pagado !== pagado || m.cuadrado !== cuadrado) {
      const { error } = await supabase
        .from("materiales")
        .update({ pagado, cuadrado })
        .eq("id", m.id);
      if (error)
        console.error("Error actualizando material:", m.id, error.message);
    }
  }

  // Asignaciones
  for (const a of asignaciones || []) {
    if (a.trabajoid) {
      const trabajo = trabajos.find((t) => t.id === a.trabajoid);
      if (!trabajo) continue;
      const coste = trabajo.horas * cliente.precioHora;
      const totalAsignado = (asignaciones || [])
        .filter((aa) => aa.trabajoid === a.trabajoid)
        .reduce((acc, aa) => acc + Number(aa.usado), 0);
      const cuadrado = totalAsignado >= coste ? 1 : 0;
      if (a.cuadrado !== cuadrado) {
        const { error } = await supabase
          .from("asignaciones_pago")
          .update({ cuadrado })
          .eq("id", a.id);
        if (error)
          console.error("Error actualizando asignacion:", a.id, error.message);
      }
    }
    if (a.materialid) {
      const material = (materiales || []).find((m) => m.id === a.materialid);
      if (!material) continue;
      const coste = material.coste;
      const totalAsignado = (asignaciones || [])
        .filter((aa) => aa.materialid === a.materialid)
        .reduce((acc, aa) => acc + Number(aa.usado), 0);
      const cuadrado = totalAsignado >= coste ? 1 : 0;
      if (a.cuadrado !== cuadrado) {
        const { error } = await supabase
          .from("asignaciones_pago")
          .update({ cuadrado })
          .eq("id", a.id);
        if (error)
          console.error("Error actualizando asignacion:", a.id, error.message);
      }
    }
  }
}

module.exports = { recalcularAsignaciones };
