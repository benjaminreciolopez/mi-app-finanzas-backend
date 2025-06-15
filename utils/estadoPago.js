const supabase = require("../supabaseClient");

async function actualizarSaldoCliente(clienteId) {
  try {
    // 1. Obtener todos los pagos del cliente
    const { data: pagos, error: errorPagos } = await supabase
      .from("pagos")
      .select("cantidad")
      .eq("clienteId", clienteId);

    if (errorPagos) {
      console.error("Error al obtener pagos:", errorPagos.message);
      return;
    }

    // 2. Sumar total pagado
    const totalPagado = (pagos || []).reduce(
      (acc, p) => acc + Number(p.cantidad || 0),
      0
    );

    // 3. Actualizar saldoACuenta del cliente
    const { error: errorCliente } = await supabase
      .from("clientes")
      .update({ saldoACuenta: +totalPagado.toFixed(2) })
      .eq("id", clienteId);

    if (errorCliente) {
      console.error(
        "Error al actualizar saldo del cliente:",
        errorCliente.message
      );
    }
  } catch (error) {
    console.error("Error inesperado en actualizarSaldoCliente:", error.message);
  }
}

module.exports = {
  actualizarSaldoCliente,
};
