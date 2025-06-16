const supabase = require("../supabaseClient");

async function actualizarSaldoCliente(clienteId) {
  // Obtener cliente para conocer precioHora
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

  // Obtener trabajos no saldados
  const { data: trabajos, error: errorTrabajos } = await supabase
    .from("trabajos")
    .select("horas")
    .eq("clienteId", clienteId)
    .eq("cuadrado", 0);

  const { data: materiales, error: errorMateriales } = await supabase
    .from("materiales")
    .select("coste")
    .eq("clienteid", clienteId)
    .eq("cuadrado", 0);

  if (errorTrabajos || errorMateriales) {
    console.error("❌ Error obteniendo trabajos o materiales");
    return;
  }

  // Calcular deuda actual
  const deudaTrabajos =
    trabajos?.reduce(
      (acc, t) => acc + (Number(t.horas) || 0) * precioHora,
      0
    ) || 0;

  const deudaMateriales =
    materiales?.reduce((acc, m) => acc + (Number(m.coste) || 0), 0) || 0;

  const deudaTotal = +(deudaTrabajos + deudaMateriales).toFixed(2);

  // Obtener total de pagos realizados
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

  // Calcular saldo disponible
  let saldoDisponible = +(totalPagado - deudaTotal).toFixed(2);

  // Si no queda deuda (todo cuadrado), saldoDisponible puede ser positivo (sobrante), sino siempre 0
  if (deudaTotal <= 0.01) {
    saldoDisponible = saldoDisponible > 0 ? saldoDisponible : 0;
  } else {
    saldoDisponible = 0;
  }

  // Actualizar el saldo en la tabla clientes
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
