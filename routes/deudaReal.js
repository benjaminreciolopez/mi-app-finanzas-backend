const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// ✅ RESUMEN DE TODOS LOS CLIENTES
router.get("/", async (req, res) => {
  const { data: clientes, error: clientesError } = await supabase
    .from("clientes")
    .select("id, nombre, precioHora");

  if (clientesError) {
    return res.status(500).json({ error: "Error al obtener clientes" });
  }

  const { data: trabajos, error: trabajosError } = await supabase
    .from("trabajos")
    .select("id, clienteId, fecha, horas, cuadrado");

  const { data: materiales, error: materialesError } = await supabase
    .from("materiales")
    .select("id, clienteid, fecha, coste, cuadrado");

  const { data: asignaciones, error: asignacionesError } = await supabase
    .from("asignaciones_pago")
    .select("*");

  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select("id, clienteId, cantidad");

  if (trabajosError || materialesError || asignacionesError || pagosError) {
    return res.status(500).json({ error: "Error al obtener datos" });
  }

  const resumen = clientes.map((cliente) => {
    const precioHora = cliente.precioHora ?? 0;

    const trabajosPendientes = (trabajos || [])
      .filter((t) => t.clienteId === cliente.id && t.cuadrado !== 1)
      .map((t) => ({
        id: t.id,
        tipo: "trabajo",
        fecha: t.fecha,
        coste: +(t.horas * precioHora).toFixed(2),
        horas: t.horas,
      }));

    const materialesPendientes = (materiales || [])
      .filter((m) => m.clienteid === cliente.id && m.cuadrado !== 1)
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
  });

  res.json(resumen);
});

// GET /api/deuda/:clienteId/pendientes
router.get("/:clienteId/pendientes", async (req, res) => {
  const clienteId = parseInt(req.params.clienteId);
  if (isNaN(clienteId)) {
    return res.status(400).json({ error: "ID de cliente no válido" });
  }

  const [trabajos, materiales] = await Promise.all([
    supabase
      .from("trabajos")
      .select("id, fecha, horas, cuadrado")
      .eq("clienteId", clienteId)
      .eq("cuadrado", false),
    supabase
      .from("materiales")
      .select("id, fecha, coste, cuadrado")
      .eq("clienteid", clienteId)
      .eq("cuadrado", false),
  ]);

  if (trabajos.error || materiales.error) {
    return res.status(500).json({
      error: trabajos.error?.message || materiales.error?.message,
    });
  }

  const clienteRes = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (clienteRes.error) {
    return res
      .status(500)
      .json({ error: "Error obteniendo precio del cliente" });
  }

  const precioHora = clienteRes.data.precioHora;

  const trabajosPendientes = trabajos.data.map((t) => ({
    id: t.id,
    fecha: t.fecha,
    coste: t.horas * precioHora,
    tipo: "trabajo",
  }));

  const materialesPendientes = materiales.data.map((m) => ({
    id: m.id,
    fecha: m.fecha,
    coste: m.coste,
    tipo: "material",
  }));

  res.json({
    trabajos: trabajosPendientes,
    materiales: materialesPendientes,
  });
});

module.exports = router;
