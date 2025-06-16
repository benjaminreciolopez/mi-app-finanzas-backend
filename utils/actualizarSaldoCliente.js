const supabase = require("../supabaseClient");

/**
 * Actualiza el saldo disponible de un cliente.
 * El saldo es el sobrante de pagos realizados menos lo que ya está cuadrado (saldado), siguiendo asignación FIFO.
 * Nunca puede ser negativo.
 */
async function actualizarSaldoCliente(clienteId) {
  console.log("→ Llamando a actualizarSaldoCliente para cliente", clienteId);

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

  const { data: trabajosCuadrados } = await supabase
    .from("trabajos")
    .select("horas, fecha")
    .eq("clienteId", clienteId)
    .eq("cuadrado", 1);

  const { data: materialesCuadrados } = await supabase
    .from("materiales")
    .select("coste, fecha")
    .eq("clienteid", clienteId)
    .eq("cuadrado", 1);

  const { data: pagos, error: errorPagos } = await supabase
    .from("pagos")
    .select("cantidad")
    .eq("clienteId", clienteId);

  if (errorPagos) {
    console.error("❌ Error obteniendo pagos:", errorPagos.message);
    return;
  }

  const totalPagado =
    pagos?.reduce((acc, p) => acc + (Number(p.cantidad) || 0), 0) || 0;

  // Junta todos los trabajos y materiales cuadrado=1, con fecha y cantidad
  let tareasCuadradas = [
    ...(trabajosCuadrados?.map((t) => ({
      tipo: "trabajo",
      fecha: t.fecha,
      cantidad: (Number(t.horas) || 0) * precioHora,
    })) || []),
    ...(materialesCuadrados?.map((m) => ({
      tipo: "material",
      fecha: m.fecha,
      cantidad: Number(m.coste) || 0,
    })) || []),
  ];

  // Ordena por fecha ascendente (más antiguo primero)
  tareasCuadradas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  // Suma solo hasta agotar totalPagado (FIFO)
  let totalUsado = 0;
  let restante = totalPagado;
  for (let tarea of tareasCuadradas) {
    if (restante <= 0) break;
    if (tarea.cantidad <= restante) {
      totalUsado += tarea.cantidad;
      restante -= tarea.cantidad;
    } else {
      totalUsado += restante; // Parcial
      restante = 0;
    }
  }

  let saldoDisponible = +(totalPagado - totalUsado).toFixed(2);
  saldoDisponible = Math.max(0, saldoDisponible); // Nunca negativo

  // ← LOG
  console.log(
    `[actualizarSaldoCliente] totalPagado=${totalPagado}, totalUsado=${totalUsado}, saldoDisponible=${saldoDisponible} para cliente ${clienteId}`
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
      `✅ Saldo actualizado: ${saldoDisponible}€ para cliente ${clienteId}`
    );
  }
}

module.exports = { actualizarSaldoCliente };
