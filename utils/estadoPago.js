// backend/utils/estadoPago.js
const supabase = require("../supabaseClient");

/**
 * Recalcula y actualiza el saldo a cuenta del cliente en función de sus pagos y tareas saldadas.
 */
async function actualizarSaldoCliente(clienteId) {
  if (!clienteId) return;

  // 1. Obtener pagos del cliente
  const { data: pagos } = await supabase
    .from("pagos")
    .select("cantidad")
    .eq("clienteId", clienteId);

  const totalPagado = (pagos || []).reduce(
    (acc, p) => acc + (Number(p.cantidad) || 0),
    0
  );

  // 2. Obtener trabajos saldados
  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("horas, precioHora, cuadrado")
    .eq("clienteId", clienteId);

  const totalTrabajosSaldados = (trabajos || [])
    .filter((t) => t.cuadrado === 1)
    .reduce(
      (acc, t) => acc + (Number(t.horas) || 0) * (Number(t.precioHora) || 0),
      0
    );

  // 3. Obtener materiales saldados
  const { data: materiales } = await supabase
    .from("materiales")
    .select("coste, cuadrado")
    .eq("clienteid", clienteId);

  const totalMaterialesSaldados = (materiales || [])
    .filter((m) => m.cuadrado === 1)
    .reduce((acc, m) => acc + (Number(m.coste) || 0), 0);

  // 4. Calcular nuevo saldo
  const saldoACuenta = +(
    totalPagado -
    totalTrabajosSaldados -
    totalMaterialesSaldados
  ).toFixed(2);

  // 5. Actualizar campo en clientes
  await supabase.from("clientes").update({ saldoACuenta }).eq("id", clienteId);
}

module.exports = {
  actualizarSaldoCliente,
};
