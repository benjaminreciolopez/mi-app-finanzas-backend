const supabase = require("../supabaseClient");

async function actualizarSaldoCliente(clienteId) {
  // 1. Obtener cliente para conocer precioHora
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

  // 2. Obtener trabajos/materiales NO cuadrado (pendientes)
  const { data: trabajos, error: errorTrabajos } = await supabase
    .from("trabajos")
    .select("horas, cuadrado")
    .eq("clienteId", clienteId);

  const { data: materiales, error: errorMateriales } = await supabase
    .from("materiales")
    .select("coste, cuadrado")
    .eq("clienteid", clienteId);

  if (errorTrabajos || errorMateriales) {
    console.error("❌ Error obteniendo trabajos o materiales");
    return;
  }

  // 3. Calcular deuda pendiente (solo los NO cuadrado)
  const deudaTrabajos = (trabajos || [])
    .filter((t) => !t.cuadrado)
    .reduce((acc, t) => acc + (Number(t.horas) || 0) * precioHora, 0);

  const deudaMateriales = (materiales || [])
    .filter((m) => !m.cuadrado)
    .reduce((acc, m) => acc + (Number(m.coste) || 0), 0);

  const deudaTotal = +(deudaTrabajos + deudaMateriales).toFixed(2);

  // 4. Obtener total de pagos realizados
  const { data: pagos, error: errorPagos } = await supabase
    .from("pagos")
    .select("cantidad")
    .eq("clienteId", clienteId);

  if (errorPagos) {
    console.error("❌ Error obteniendo pagos:", errorPagos.message);
    return;
  }

  const totalPagado = (pagos || []).reduce(
    (acc, p) => acc + (Number(p.cantidad) || 0),
    0
  );

  // 5. Calcular saldo disponible (el sobrante si hay)
  let saldoDisponible = +(totalPagado - deudaTotal).toFixed(2);
  saldoDisponible = Math.max(0, saldoDisponible);

  // 6. Guardar en la base de datos SIEMPRE
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
