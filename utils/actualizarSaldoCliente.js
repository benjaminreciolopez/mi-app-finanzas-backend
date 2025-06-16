const supabase = require("../supabaseClient");

/**
 * Actualiza el saldo disponible de un cliente.
 * El saldo es el sobrante de pagos realizados menos lo que ya está cuadrado (saldado).
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
    .select("horas")
    .eq("clienteId", clienteId)
    .eq("cuadrado", 1);

  const { data: materialesCuadrados } = await supabase
    .from("materiales")
    .select("coste")
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

  const totalCuadrado =
    (trabajosCuadrados?.reduce(
      (acc, t) => acc + (Number(t.horas) || 0) * precioHora,
      0
    ) || 0) +
    (materialesCuadrados?.reduce((acc, m) => acc + (Number(m.coste) || 0), 0) ||
      0);

  let saldoDisponible = +(totalPagado - totalCuadrado).toFixed(2);
  saldoDisponible = Math.max(0, saldoDisponible); // Nunca negativo

  // ← AQUÍ LOG IMPORTANTE
  console.log(
    `[actualizarSaldoCliente] totalPagado=${totalPagado}, totalCuadrado=${totalCuadrado}, saldoDisponible=${saldoDisponible} para cliente ${clienteId}`
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
