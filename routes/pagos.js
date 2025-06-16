const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const { actualizarSaldoCliente } = require("../utils/actualizarSaldoCliente");

// --- Utilidad para devolver resumen de cliente con saldoDisponible ---
async function getResumenCliente(clienteId) {
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, precioHora, saldoDisponible")
    .eq("id", clienteId)
    .single();

  if (!cliente) return null;

  const precioHora = Number(cliente.precioHora) || 0;
  const saldoDisponible = Number(cliente.saldoDisponible) || 0;

  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("id, fecha, horas, cuadrado")
    .eq("clienteId", clienteId);

  const { data: materiales } = await supabase
    .from("materiales")
    .select("id, fecha, coste, cuadrado")
    .eq("clienteid", clienteId);

  const trabajosPendientes = (trabajos || []).filter((t) => t.cuadrado !== 1);
  const materialesPendientes = (materiales || []).filter(
    (m) => m.cuadrado !== 1
  );

  const totalHorasPendientes = trabajosPendientes.reduce(
    (acc, t) => acc + Number(t.horas || 0),
    0
  );

  const totalTareasPendientes =
    trabajosPendientes.reduce(
      (acc, t) => acc + (Number(t.horas) || 0) * precioHora,
      0
    ) + materialesPendientes.reduce((acc, m) => acc + Number(m.coste || 0), 0);

  const totalDeuda = Math.max(
    +(totalTareasPendientes - saldoDisponible).toFixed(2),
    0
  );
  const totalMaterialesPendientes = materialesPendientes.reduce(
    (acc, m) => acc + Number(m.coste || 0),
    0
  );

  return {
    clienteId: cliente.id,
    nombre: cliente.nombre,
    totalHorasPendientes: +totalHorasPendientes.toFixed(2),
    totalMaterialesPendientes: +totalMaterialesPendientes.toFixed(2),
    totalPagado: +(Number(cliente.saldoDisponible) || 0),
    totalDeuda,
    totalTareasPendientes: +totalTareasPendientes.toFixed(2),
    saldoACuenta: +saldoDisponible.toFixed(2),
  };
}

// --- GET: todos los pagos ---
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("pagos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

// --- POST: nuevo pago ---
router.post("/", async (req, res) => {
  const { clienteId, cantidad, fecha, observaciones } = req.body;

  if (!clienteId || !cantidad || !fecha || isNaN(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: "Datos de pago no válidos" });
  }

  // Previene duplicados exactos
  const { data: pagoExistente } = await supabase
    .from("pagos")
    .select("id")
    .eq("clienteId", clienteId)
    .eq("cantidad", cantidad)
    .eq("fecha", fecha);

  if (pagoExistente && pagoExistente.length > 0) {
    return res.status(400).json({ error: "Este pago ya existe" });
  }

  // Busca nombre cliente (puede evitarse si no lo usas en la tabla pagos)
  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("nombre")
    .eq("id", clienteId)
    .single();

  if (errorCliente || !cliente) {
    return res.status(400).json({ error: "Cliente no encontrado" });
  }

  // Inserta pago
  const { data, error } = await supabase
    .from("pagos")
    .insert([
      {
        clienteId,
        nombre: cliente.nombre,
        cantidad,
        fecha,
        observaciones,
      },
    ])
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // 1) Recalcula saldo del cliente
  await actualizarSaldoCliente(clienteId);
  // 2) El resumen reflejará el saldo actualizado
  const resumen = await getResumenCliente(clienteId);

  res.json({ message: "Pago añadido correctamente", resumen, pago: data });
});

// --- DELETE: elimina un pago ---
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const { data: pago, error: errorPago } = await supabase
    .from("pagos")
    .select("clienteId")
    .eq("id", id)
    .single();

  if (errorPago || !pago) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  const { error: errorEliminacion } = await supabase
    .from("pagos")
    .delete()
    .eq("id", id);

  if (errorEliminacion) {
    return res.status(500).json({ error: "Error al eliminar el pago" });
  }

  // 1) Actualiza saldo
  await actualizarSaldoCliente(pago.clienteId);
  // 2) Devuelve resumen actualizado
  const resumen = await getResumenCliente(pago.clienteId);

  res.json({
    message: "Pago eliminado correctamente",
    resumen,
  });
});

// --- PUT: editar pago ---
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { cantidad, fecha, observaciones } = req.body;

  if (!cantidad || !fecha || isNaN(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: "Datos de pago no válidos" });
  }

  const { data: pagoOriginal, error: errorPago } = await supabase
    .from("pagos")
    .select("clienteId")
    .eq("id", id)
    .single();

  if (errorPago || !pagoOriginal) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  const { error: errorUpdate } = await supabase
    .from("pagos")
    .update({
      cantidad,
      fecha,
      observaciones,
    })
    .eq("id", id);

  if (errorUpdate) {
    return res.status(500).json({ error: "Error al actualizar el pago" });
  }

  // 1) Actualiza saldo
  await actualizarSaldoCliente(pagoOriginal.clienteId);
  // 2) Devuelve resumen actualizado
  const resumen = await getResumenCliente(pagoOriginal.clienteId);

  res.json({
    message: "Pago actualizado correctamente",
    resumen,
  });
});

module.exports = router;
