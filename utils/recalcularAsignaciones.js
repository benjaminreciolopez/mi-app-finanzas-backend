const supabase = require("../supabaseClient");

async function recalcularAsignacionesCliente(clienteId) {
  console.log("\n---- INICIO RECÁLCULO ASIGNACIONES ----");
  console.log("ClienteId recibido:", clienteId);

  // 1. Borra todas las asignaciones de ese cliente
  const { error: errDel } = await supabase
    .from("asignaciones_pago")
    .delete()
    .eq("clienteid", clienteId);
  if (errDel) {
    console.error("Error al borrar asignaciones anteriores:", errDel.message);
    return;
  } else {
    console.log("Asignaciones anteriores borradas (si existían)");
  }

  // 2. Trae trabajos y materiales pendientes + pagos del cliente
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
    .select("id, clienteId, fecha, coste, pagado")
    .eq("clienteId", clienteId);

  const { data: pagos } = await supabase
    .from("pagos")
    .select("id, cantidad, fecha")
    .eq("clienteId", clienteId);

  // Agrupa tareas pendientes (trabajos y materiales NO pagados)
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

  // Ordena pagos y calcula el saldo total disponible
  let pagosRestantes = (pagos || [])
    .filter((p) => p.cantidad > 0)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .map((p) => ({ ...p, restante: Number(p.cantidad) }));

  // 3. Asignar pagos a tareas/mats de forma PARCIAL (se descuenta todo lo que haya)
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
    // Aquí, si pendiente > 0, quedará reflejado en el resumen como pendiente
  }

  // 4. Inserta todas las asignaciones de golpe (solo si hay)
  if (inserts.length) {
    const result = await supabase.from("asignaciones_pago").insert(inserts);
    if (result.error) {
      console.error(
        "Error insertando en asignaciones_pago:",
        result.error.message,
        result.error.details
      );
    } else {
      console.log(
        `Insertadas ${inserts.length} asignaciones en asignaciones_pago.`
      );
    }
  } else {
    console.log("No hay asignaciones para insertar");
  }

  // 5. Actualiza estado de trabajos/materiales pagados (completos=pagado=1, si no=0)
  await actualizarPagadosCliente(clienteId, supabase);

  console.log("---- FIN RECÁLCULO ASIGNACIONES ----\n");
  return {
    asignaciones: inserts.length,
  };
}

// ---- FUNCION AUXILIAR ----
async function actualizarPagadosCliente(clienteId, supabase) {
  // Trabajos: los que tienen asignaciones completas --> pagado=1, el resto pagado=0
  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("id, horas, pagado")
    .eq("clienteId", clienteId);

  const { data: cliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (!trabajos || !cliente) return;

  // Obtén todas las asignaciones de ese cliente
  const { data: asignaciones } = await supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("clienteid", clienteId);

  // Para cada trabajo: si la suma de asignaciones >= coste → pagado=1, si no → pagado=0
  for (const t of trabajos) {
    const asignado = (asignaciones || [])
      .filter((a) => a.trabajoid === t.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    const coste = t.horas * cliente.precioHora;
    const pagado = asignado >= coste ? 1 : 0;
    await supabase.from("trabajos").update({ pagado }).eq("id", t.id);
  }

  // Igual para materiales
  const { data: materiales } = await supabase
    .from("materiales")
    .select("id, coste, pagado")
    .eq("clienteid", clienteId);

  for (const m of materiales) {
    const asignado = (asignaciones || [])
      .filter((a) => a.materialid === m.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    const pagado = asignado >= m.coste ? 1 : 0;
    await supabase.from("materiales").update({ pagado }).eq("id", m.id);
  }
}

module.exports = { recalcularAsignacionesCliente };
