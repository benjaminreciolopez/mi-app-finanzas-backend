const supabase = require("../supabaseClient");

/**
 * Actualiza el saldo disponible de un cliente.
 * El saldo es el sobrante de pagos realizados menos lo que ya está cuadrado (saldado), siguiendo asignación FIFO.
 * Nunca puede ser negativo.
 */
async function actualizarSaldoCliente(clienteId) {
  console.log("→ Llamando a actualizarSaldoCliente para cliente", clienteId);

  // Aseguramos que clienteId sea un número
  clienteId = Number(clienteId);

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (errorCliente || !cliente) {
    console.error("❌ Error obteniendo cliente:", errorCliente?.message);
    return;
  }
  const precioHora = Number(cliente.precioHora) || 0;

  // Corregimos para usar clienteId consistentemente (con mayúscula)
  const { data: trabajosCuadrados } = await supabase
    .from("trabajos")
    .select("horas, fecha")
    .eq("clienteId", clienteId)
    .eq("cuadrado", 1);

  // Corregimos para usar clienteId consistentemente (con mayúscula)
  const { data: materialesCuadrados } = await supabase
    .from("materiales")
    .select("coste, fecha")
    .eq("clienteId", clienteId) // Cambiado de clienteid a clienteId
    .eq("cuadrado", 1);

  const { data: pagos, error: errorPagos } = await supabase
    .from("pagos")
    .select("cantidad")
    .eq("clienteId", clienteId);

  if (errorPagos) {
    console.error("❌ Error obteniendo pagos:", errorPagos.message);
    return;
  }

  // Aseguramos que totalPagado sea un número preciso
  const totalPagado = pagos
    ? pagos.reduce((acc, p) => acc + (Number(p.cantidad) || 0), 0)
    : 0;

  // Junta todos los trabajos y materiales cuadrado=1, con fecha y cantidad
  let tareasCuadradas = [
    ...(trabajosCuadrados?.map((t) => ({
      tipo: "trabajo",
      fecha: t.fecha,
      cantidad: parseFloat((Number(t.horas) || 0) * precioHora).toFixed(2) * 1, // Aseguramos precisión decimal
    })) || []),
    ...(materialesCuadrados?.map((m) => ({
      tipo: "material",
      fecha: m.fecha,
      cantidad: parseFloat(Number(m.coste) || 0).toFixed(2) * 1, // Aseguramos precisión decimal
    })) || []),
  ];

  // Ordena por fecha ascendente (más antiguo primero)
  tareasCuadradas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  // Suma solo hasta agotar totalPagado (FIFO)
  let totalUsado = 0;
  let restante = totalPagado;

  console.log(`[DEBUG] Total pagado antes de asignar: ${totalPagado}€`);
  console.log(`[DEBUG] Tareas cuadradas: ${tareasCuadradas.length}`);

  for (let tarea of tareasCuadradas) {
    if (restante <= 0) break;

    const cantidadTarea = parseFloat(tarea.cantidad);
    console.log(
      `[DEBUG] Procesando tarea: ${tarea.tipo} - ${cantidadTarea}€ (Restante: ${restante}€)`
    );

    if (cantidadTarea <= restante) {
      totalUsado += cantidadTarea;
      restante -= cantidadTarea;
      console.log(
        `[DEBUG] Tarea cubierta completamente. Restante: ${restante}€`
      );
    } else {
      totalUsado += restante; // Parcial
      console.log(
        `[DEBUG] Tarea cubierta parcialmente: ${restante}€ de ${cantidadTarea}€`
      );
      restante = 0;
    }
  }

  // Aseguramos precisión decimal en el saldo final
  let saldoDisponible = parseFloat((totalPagado - totalUsado).toFixed(2));
  saldoDisponible = Math.max(0, saldoDisponible); // Nunca negativo

  // Log detallado
  console.log(
    `[actualizarSaldoCliente] totalPagado=${totalPagado.toFixed(
      2
    )}€, totalUsado=${totalUsado.toFixed(
      2
    )}€, saldoDisponible=${saldoDisponible.toFixed(
      2
    )}€ para cliente ${clienteId}`
  );

  const { error: errorUpdate } = await supabase
    .from("clientes")
    .update({ saldoDisponible })
    .eq("id", clienteId);

  if (errorUpdate) {
    console.error(
      "❌ Error actualizando saldoDisponible:",
      errorUpdate.message
    );
  } else {
    console.log(
      `✅ Saldo actualizado: ${saldoDisponible.toFixed(
        2
      )}€ para cliente ${clienteId}`
    );
  }
}

module.exports = { actualizarSaldoCliente };
