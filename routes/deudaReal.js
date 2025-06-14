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

// ✅ DETALLE DE PENDIENTES DE UN CLIENTE
router.get("/:clienteId/pendientes", async (req, res) => {
  const clienteId = parseInt(req.params.clienteId);

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (errorCliente || !cliente) {
    return res.status(404).json({ error: "Cliente no encontrado" });
  }

  const { data: trabajos, error: errorTrabajos } = await supabase
    .from("trabajos")
    .select("id, fecha, horas, cuadrado")
    .eq("clienteId", clienteId)
    .neq("cuadrado", 1);

  const { data: materiales, error: errorMateriales } = await supabase
    .from("materiales")
    .select("id, fecha, coste, cuadrado")
    .eq("clienteId", clienteId)
    .neq("cuadrado", 1);

  if (errorTrabajos || errorMateriales) {
    return res
      .status(500)
      .json({ error: "Error al obtener tareas pendientes" });
  }

  const trabajosPendientes = (trabajos || []).map((t) => ({
    id: t.id,
    fecha: t.fecha,
    coste: t.horas * cliente.precioHora,
    tipo: "trabajo",
  }));

  const materialesPendientes = (materiales || []).map((m) => ({
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
