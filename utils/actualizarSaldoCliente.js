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

  // Obtener trabajos y materiales CUADRADOS (ya saldados)
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

  // Obtener trabajos y materiales PENDIENTES
  const { data: trabajosPendientes } = await supabase
    .from("trabajos")
    .select("horas")
    .eq("clienteId", clienteId)
    .eq("cuadrado", 0);

  const { data: materialesPendientes } = await supabase
    .from("materiales")
    .select("coste")
    .eq("clienteid", clienteId)
    .eq("cuadrado", 0);

  // Suma de trabajos/materiales CUADRADOS (ya pagados)
  const totalCuadrado =
    (trabajosCuadrados?.reduce(
      (acc, t) => acc + (Number(t.horas) || 0) * precioHora,
      0
    ) || 0) +
    (materialesCuadrados?.reduce((acc, m) => acc + (Number(m.coste) || 0), 0) ||
      0);

  // Suma de trabajos/materiales PENDIENTES (lo que queda por saldar)
  const totalPendiente =
    (trabajosPendientes?.reduce(
      (acc, t) => acc + (Number(t.horas) || 0) * precioHora,
      0
    ) || 0) +
    (materialesPendientes?.reduce(
      (acc, m) => acc + (Number(m.coste) || 0),
      0
    ) || 0);

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

  // Calcular el saldo disponible correctamente:
  // saldoDisponible = totalPagado - totalCuadrado - totalPendiente
  // PERO solo debe ser mayor que 0 si aún queda pendiente,
  // si todo está pagado, el saldo a cuenta se queda en 0 aunque haya más pagos.
  let saldoDisponible = +(totalPagado - totalCuadrado - totalPendiente).toFixed(
    2
  );

  // Si ya no hay tareas/materiales pendientes, saldoDisponible debe ser 0
  if (totalPendiente <= 0.01 || saldoDisponible < 0) {
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
