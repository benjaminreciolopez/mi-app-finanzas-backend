// backend/utils/recalcularAsignacionesCliente.js
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

  let saldoDisponible = pagosRestantes.reduce((acc, p) => acc + p.restante, 0);

  // 3. Asignar pagos SOLO a tareas/mats que se puedan pagar completas
  let inserts = [];
  for (const tarea of tareasPendientes) {
    if (saldoDisponible >= tarea.coste) {
      // Asigna solo si hay saldo suficiente para la tarea entera
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
          saldoDisponible -= aplicar;
        }
        if (pendiente <= 0) break;
      }
    } else {
      // No hay saldo para pagar esta tarea por completo, se queda pendiente
      continue;
    }
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

  // 5. Opcional: Devuelve saldo a cuenta (no asignado)
  const saldoACuenta = saldoDisponible;

  console.log("---- FIN RECÁLCULO ASIGNACIONES ----\n");
  return {
    asignaciones: inserts.length,
    saldoACuenta, // <- para descontar en la deuda real si lo necesitas
  };
}

module.exports = { recalcularAsignacionesCliente };
