const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// Calcula resumen del cliente sin hacer asignaciones nuevas
// Calcula resumen del cliente sin hacer asignaciones nuevas
async function getResumenCliente(clienteId) {
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, precioHora")
    .eq("id", clienteId)
    .single();

  if (!cliente) return null;

  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("id, clienteId, fecha, horas, cuadrado")
    .eq("clienteId", clienteId);

  const { data: materiales } = await supabase
    .from("materiales")
    .select("id, clienteid, fecha, coste, cuadrado")
    .eq("clienteid", clienteId);

  const { data: asignaciones } = await supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("clienteid", clienteId);

  const { data: pagos } = await supabase
    .from("pagos")
    .select("id, clienteId, cantidad")
    .eq("clienteId", clienteId);

  const precioHora = Number(cliente.precioHora) || 0;

  const trabajosPendientes = (trabajos || [])
    .filter((t) => t.cuadrado !== 1)
    .map((t) => ({
      id: t.id,
      tipo: "trabajo",
      fecha: t.fecha,
      horas: Number(t.horas) || 0,
      coste: +((Number(t.horas) || 0) * precioHora).toFixed(2),
    }));

  const materialesPendientes = (materiales || [])
    .filter((m) => m.cuadrado !== 1)
    .map((m) => ({
      id: m.id,
      tipo: "material",
      fecha: m.fecha,
      coste: +(Number(m.coste) || 0).toFixed(2),
    }));

  const totalAsignado = (asignaciones || []).reduce(
    (acc, a) => acc + (Number(a.usado) || 0),
    0
  );

  const totalPagos = (pagos || []).reduce(
    (acc, p) => acc + (Number(p.cantidad) || 0),
    0
  );

  const saldoACuenta = +(totalPagos - totalAsignado).toFixed(2);

  let totalPendiente = 0;
  for (const t of trabajosPendientes) {
    const asignado = (asignaciones || [])
      .filter((a) => a.trabajoid === t.id)
      .reduce((acc, a) => acc + (Number(a.usado) || 0), 0);
    totalPendiente += Math.max(0, +(t.coste - asignado).toFixed(2));
  }
  for (const m of materialesPendientes) {
    const asignado = (asignaciones || [])
      .filter((a) => a.materialid === m.id)
      .reduce((acc, a) => acc + (Number(a.usado) || 0), 0);
    totalPendiente += Math.max(0, +(m.coste - asignado).toFixed(2));
  }

  const totalPendienteSafe = Number(totalPendiente) || 0;
  const saldoACuentaSafe = Number(saldoACuenta) || 0;

  const deudaReal = Math.max(
    0,
    +(totalPendienteSafe - saldoACuentaSafe).toFixed(2)
  );

  const totalHorasPendientes = trabajosPendientes.reduce((acc, t) => {
    const asignado = (asignaciones || [])
      .filter((a) => a.trabajoid === t.id)
      .reduce((acc, a) => acc + (Number(a.usado) || 0), 0);
    const pendienteDinero = Math.max(0, +(t.coste - asignado));
    return acc + +(pendienteDinero / (precioHora || 1)).toFixed(2);
  }, 0);

  const pagosUsados = (asignaciones || []).reduce((acc, a) => {
    const id = a.pagoid;
    const usado = Number(a.usado) || 0;
    acc[id] = (acc[id] || 0) + usado;
    return acc;
  }, {});

  return {
    clienteId: cliente.id,
    nombre: cliente.nombre,
    totalPagado: +totalAsignado.toFixed(2),
    totalHorasPendientes,
    totalMaterialesPendientes: materialesPendientes.reduce(
      (acc, m) => acc + m.coste,
      0
    ),
    totalDeuda: deudaReal,
    saldoACuenta: saldoACuentaSafe,
    pagosUsados: Object.entries(pagosUsados).map(([id, usado]) => ({
      id,
      usado: +usado.toFixed(2),
    })),
  };
}

// GET /api/pagos
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("pagos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

// POST /api/pagos
router.post("/", async (req, res) => {
  const { clienteId, cantidad, fecha, observaciones } = req.body;

  if (!clienteId || !cantidad || !fecha || isNaN(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: "Datos de pago no válidos" });
  }

  const { data: pagoExistente } = await supabase
    .from("pagos")
    .select("id")
    .eq("clienteId", clienteId)
    .eq("cantidad", cantidad)
    .eq("fecha", fecha);

  if (pagoExistente && pagoExistente.length > 0) {
    return res.status(400).json({ error: "Este pago ya existe" });
  }

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("nombre")
    .eq("id", clienteId)
    .single();

  if (errorCliente || !cliente) {
    return res.status(400).json({ error: "Cliente no encontrado" });
  }

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

  const resumen = await getResumenCliente(clienteId);
  res.json({ id: data?.id, message: "Pago añadido correctamente", resumen });
});
// DELETE /api/pagos/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  // Obtener primero el clienteId del pago
  const { data: pago, error: errorPago } = await supabase
    .from("pagos")
    .select("clienteId")
    .eq("id", id)
    .single();

  if (errorPago || !pago) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  // Eliminar el pago
  const { error: errorEliminacion } = await supabase
    .from("pagos")
    .delete()
    .eq("id", id);

  if (errorEliminacion) {
    return res.status(500).json({ error: "Error al eliminar el pago" });
  }

  // Recalcular el resumen del cliente tras eliminar el pago
  const resumen = await getResumenCliente(pago.clienteId);

  res.json({
    message: "Pago eliminado correctamente",
    resumen,
  });
});
// PUT /api/pagos/:id
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { cantidad, fecha, observaciones } = req.body;

  // Validaciones básicas
  if (!cantidad || !fecha || isNaN(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: "Datos de pago no válidos" });
  }

  // Obtener el clienteId del pago
  const { data: pagoOriginal, error: errorPago } = await supabase
    .from("pagos")
    .select("clienteId")
    .eq("id", id)
    .single();

  if (errorPago || !pagoOriginal) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  // Actualizar el pago
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

  // Obtener el resumen actualizado del cliente
  const resumen = await getResumenCliente(pagoOriginal.clienteId);

  res.json({
    message: "Pago actualizado correctamente",
    resumen,
  });
});

module.exports = router;
