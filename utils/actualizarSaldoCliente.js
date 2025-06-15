const supabase = require("../supabaseClient");

async function actualizarSaldoCliente(clienteId) {
  // Obtener cliente (para precioHora)
  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (errorCliente || !cliente) {
    console.error("❌ Error obteniendo cliente:", errorCliente?.message);
    return;
  }

  const precioHora = cliente.precioHora;

  // Obtener trabajos no cuadrado
  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("horas")
    .eq("clienteId", clienteId)
    .eq("cuadrado", 0);

  const { data: materiales } = await supabase
    .from("materiales")
    .select("coste")
    .eq("clienteid", clienteId)
    .eq("cuadrado", 0);

  // Calcular deuda
  const deudaTrabajos =
    trabajos?.reduce((acc, t) => acc + t.horas * precioHora, 0) || 0;

  const deudaMateriales = materiales?.reduce((acc, m) => acc + m.coste, 0) || 0;

  const deudaTotal = +(deudaTrabajos + deudaMateriales).toFixed(2);

  // Obtener total de pagos
  const { data: pagos } = await supabase
    .from("pagos")
    .select("cantidad")
    .eq("clienteId", clienteId);

  const totalPagado = pagos?.reduce((acc, p) => acc + p.cantidad, 0) || 0;

  const saldoACuenta = +(totalPagado - deudaTotal).toFixed(2);

  // Actualizar campo solo si hay saldo a favor
  const nuevoValor = saldoACuenta > 0 ? saldoACuenta : 0;

  const { error: errorUpdate } = await supabase
    .from("clientes")
    .update({ saldoACuenta: nuevoValor })
    .eq("id", clienteId);

  if (errorUpdate) {
    console.error("❌ Error actualizando saldoACuenta:", errorUpdate.message);
  }
}

module.exports = { actualizarSaldoCliente };
