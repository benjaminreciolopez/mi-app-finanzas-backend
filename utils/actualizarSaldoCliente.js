// utils/actualizarSaldoCliente.js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function actualizarSaldoCliente(clienteId) {
  if (!clienteId) return;

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (errorCliente || !cliente) return;

  const precioHora = Number(cliente.precioHora) || 0;

  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("id, horas, cuadrado")
    .eq("clienteId", clienteId);

  const { data: materiales } = await supabase
    .from("materiales")
    .select("id, coste, cuadrado")
    .eq("clienteid", clienteId);

  const { data: pagos } = await supabase
    .from("pagos")
    .select("cantidad")
    .eq("clienteId", clienteId);

  const totalPagado = (pagos || []).reduce(
    (acc, p) => acc + (Number(p.cantidad) || 0),
    0
  );

  const trabajosNoCuadrados = (trabajos || []).filter((t) => t.cuadrado !== 1);
  const materialesNoCuadrados = (materiales || []).filter(
    (m) => m.cuadrado !== 1
  );

  const deudaPendiente =
    trabajosNoCuadrados.reduce(
      (acc, t) => acc + (Number(t.horas) || 0) * precioHora,
      0
    ) +
    materialesNoCuadrados.reduce((acc, m) => acc + (Number(m.coste) || 0), 0);

  const nuevoSaldo = Math.max(0, +(totalPagado - deudaPendiente).toFixed(2));

  await supabase
    .from("clientes")
    .update({ saldoDisponible: nuevoSaldo })
    .eq("id", clienteId);
}

module.exports = { actualizarSaldoCliente };
