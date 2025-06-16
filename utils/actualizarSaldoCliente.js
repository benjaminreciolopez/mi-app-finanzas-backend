const supabase = require("../supabaseClient");

async function actualizarSaldoCliente(clienteId) {
  // 1. Precio hora del cliente
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

  // 2. Trabajos y materiales saldados (cuadrados = 1)
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

  // 3. Total pagado (todos los pagos)
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

  // 4. Suma de lo que YA está saldado
  const totalCuadrado =
    (trabajosCuadrados?.reduce(
      (acc, t) => acc + (Number(t.horas) || 0) * precioHora,
      0
    ) || 0) +
    (materialesCuadrados?.reduce((acc, m) => acc + (Number(m.coste) || 0), 0) ||
      0);

  // 5. El saldo a cuenta es lo pagado MENOS lo que YA está cuadrado
  let saldoDisponible = +(totalPagado - totalCuadrado).toFixed(2);
  // Nunca puede ser negativo
  saldoDisponible = Math.max(0, saldoDisponible);

  // 6. Actualizar la tabla
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
