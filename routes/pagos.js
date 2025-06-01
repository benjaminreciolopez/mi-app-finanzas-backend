const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const { recalcularAsignaciones } = require("../utils/recalcularAsignaciones");
// Devuelve el resumen actualizado de un cliente (igual que el map pero solo uno)
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

  const precioHora = cliente.precioHora ?? 0;

  const trabajosPendientes = (trabajos || [])
    .filter((t) => t.cuadrado !== 1)
    .map((t) => ({
      id: t.id,
      tipo: "trabajo",
      fecha: t.fecha,
      coste: +(t.horas * precioHora).toFixed(2),
      horas: t.horas,
    }));

  const materialesPendientes = (materiales || [])
    .filter((m) => m.cuadrado !== 1)
    .map((m) => ({
      id: m.id,
      tipo: "material",
      fecha: m.fecha,
      coste: +m.coste.toFixed(2),
    }));

  let totalPendiente = 0;
  for (const t of trabajosPendientes) {
    const asignado = (asignaciones || [])
      .filter((a) => a.trabajoid === t.id && a.clienteid === cliente.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    totalPendiente += Math.max(0, +(t.coste - asignado).toFixed(2));
  }
  for (const m of materialesPendientes) {
    const asignado = (asignaciones || [])
      .filter((a) => a.materialid === m.id && a.clienteid === cliente.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    totalPendiente += Math.max(0, +(m.coste - asignado).toFixed(2));
  }

  const totalAsignado = (asignaciones || [])
    .filter((a) => a.clienteid === cliente.id)
    .reduce((acc, a) => acc + Number(a.usado), 0);

  const totalPagos = (pagos || [])
    .filter((p) => p.clienteId === cliente.id)
    .reduce((acc, p) => acc + Number(p.cantidad), 0);

  const saldoACuenta = totalPagos - totalAsignado;

  const deudaReal = Math.max(0, +(totalPendiente - saldoACuenta).toFixed(2));

  const totalHorasPendientes = trabajosPendientes.reduce((acc, t) => {
    const asignado = (asignaciones || [])
      .filter((a) => a.trabajoid === t.id && a.clienteid === cliente.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    const pendienteDinero = Math.max(0, +(t.coste - asignado));
    const horasPendientes = +(pendienteDinero / (precioHora || 1)).toFixed(2);
    return acc + horasPendientes;
  }, 0);

  const pagosUsados = (asignaciones || [])
    .filter((a) => a.clienteid === cliente.id)
    .reduce((acc, a) => {
      acc[a.pagoid] = (acc[a.pagoid] || 0) + Number(a.usado);
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
    saldoACuenta: +saldoACuenta.toFixed(2),
    pagosUsados: Object.entries(pagosUsados).map(([id, usado]) => ({
      id,
      usado: +usado.toFixed(2),
    })),
  };
}

// Obtener todos los pagos
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("pagos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  res.json({ data });
});

// Añadir nuevo pago
router.post("/", async (req, res) => {
  const { clienteId, cantidad, fecha, observaciones } = req.body;

  if (!clienteId || !cantidad || !fecha || isNaN(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: "Datos de pago no válidos" });
  }

  // --- COMPROBAR SI YA EXISTE PAGO IGUAL ---
  const { data: pagoExistente, error: errorPagoExistente } = await supabase
    .from("pagos")
    .select("id")
    .eq("clienteId", clienteId)
    .eq("cantidad", cantidad)
    .eq("fecha", fecha);

  if (errorPagoExistente) {
    return res.status(500).json({ error: "Error comprobando duplicados" });
  }
  if (pagoExistente && pagoExistente.length > 0) {
    return res.status(400).json({ error: "Este pago ya existe" });
  }

  // ---- Aquí sigue tu lógica normal ----
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

  // ⬇️ Recalcular tras insertar
  await recalcularAsignaciones(clienteId);

  const resumen = await getResumenCliente(clienteId);

  res.json({ id: data?.id, message: "Pago añadido correctamente", resumen });
});

// Actualizar un pago
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { cantidad, fecha, observaciones } = req.body;

  // Buscar clienteId antes de actualizar
  const { data: pagoExistente, error: errPago } = await supabase
    .from("pagos")
    .select("clienteId")
    .eq("id", id)
    .single();

  if (errPago || !pagoExistente) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  const { error, data } = await supabase
    .from("pagos")
    .update({ cantidad, fecha, observaciones })
    .eq("id", id)
    .select();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // ⬇️ Recalcular tras actualizar
  await recalcularAsignaciones(pagoExistente.clienteId);
  const resumen = await getResumenCliente(pagoExistente.clienteId);
  res.json({ message: "Pago actualizado correctamente", resumen });
});
// Eliminar un pago
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  // Buscar clienteId antes de eliminar
  const { data: pago, error: errPago } = await supabase
    .from("pagos")
    .select("clienteId")
    .eq("id", id)
    .single();

  if (errPago || !pago) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  const { error } = await supabase.from("pagos").delete().eq("id", id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // ⬇️ Recalcular tras eliminar
  await recalcularAsignaciones(pago.clienteId);
  const resumen = await getResumenCliente(pago.clienteId);
  res.json({ message: "Pago eliminado correctamente", resumen });
});

module.exports = router;
