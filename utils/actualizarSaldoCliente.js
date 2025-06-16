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

  // Trabajos y materiales CUADRADOS (ya saldados)
  const { data: trabajosCuadrados, error: errorTrabajosC } = await supabase
    .from("trabajos")
    .select("horas")
    .eq("clienteId", clienteId)
    .eq("cuadrado", 1);

  const { data: materialesCuadrados, error: errorMaterialesC } = await supabase
    .from("materiales")
    .select("coste")
    .eq("clienteid", clienteId)
    .eq("cuadrado", 1);

  // Trabajos y materiales pendientes
  const { data: trabajosPendientes, error: errorTrabajosP } = await supabase
    .from("trabajos")
    .select("horas")
    .eq("clienteId", clienteId)
    .eq("cuadrado", 0);

  const { data: materialesPendientes, error: errorMaterialesP } = await supabase
    .from("materiales")
    .select("coste")
    .eq("clienteid", clienteId)
    .eq("cuadrado", 0);

  if (
    errorTrabajosC ||
    errorMaterialesC ||
    errorTrabajosP ||
    errorMaterialesP
  ) {
    console.error("❌ Error obteniendo trabajos o materiales");
    return;
  }

  // Suma de trabajos/materiales CUADRADOS (pagados)
  const totalCuadrado =
    (trabajosCuadrados?.reduce(
      (acc, t) => acc + (Number(t.horas) || 0) * precioHora,
      0
    ) || 0) +
    (materialesCuadrados?.reduce((acc, m) => acc + (Number(m.coste) || 0), 0) ||
      0);

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

  // Nuevo cálculo para saldoDisponible: pagado - cuadrado
  let saldoDisponible = +(totalPagado - totalCuadrado).toFixed(2);
  saldoDisponible = saldoDisponible > 0 ? saldoDisponible : 0;

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
