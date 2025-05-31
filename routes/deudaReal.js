const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

router.get("/", async (req, res) => {
  // 1. Obtén clientes y precioHora
  const { data: clientes, error: clientesError } = await supabase
    .from("clientes")
    .select("id, nombre, precioHora");

  if (clientesError) {
    return res.status(500).json({ error: "Error al obtener clientes" });
  }

  // 2. Trabajos pendientes de cada cliente
  const { data: trabajos, error: trabajosError } = await supabase
    .from("trabajos")
    .select("id, clienteId, fecha, horas, pagado");

  // Materiales: **clienteid** (minúscula)
  const { data: materiales, error: materialesError } = await supabase
    .from("materiales")
    .select("id, clienteid, fecha, coste, pagado");

  if (trabajosError || materialesError) {
    return res
      .status(500)
      .json({ error: "Error al obtener trabajos o materiales" });
  }

  // 3. Asignaciones de pagos
  const { data: asignaciones, error: asignacionesError } = await supabase
    .from("asignaciones_pago")
    .select("*");

  if (asignacionesError) {
    return res.status(500).json({ error: "Error al obtener asignaciones" });
  }

  // 4. Todos los pagos
  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select("id, clienteId, cantidad");

  if (pagosError) {
    return res.status(500).json({ error: "Error al obtener pagos" });
  }

  // 5. Calcula resumen
  const resumen = clientes.map((cliente) => {
    const precioHora = cliente.precioHora ?? 0;

    // Trabajos pendientes
    const trabajosPendientes = (trabajos || [])
      .filter((t) => t.clienteId === cliente.id && !t.pagado)
      .map((t) => ({
        id: t.id,
        tipo: "trabajo",
        fecha: t.fecha,
        coste: +(t.horas * precioHora).toFixed(2),
        horas: t.horas,
      }));

    // Materiales pendientes (usa clienteid en minúscula)
    const materialesPendientes = (materiales || [])
      .filter((m) => m.clienteid === cliente.id && !m.pagado)
      .map((m) => ({
        id: m.id,
        tipo: "material",
        fecha: m.fecha,
        coste: +m.coste.toFixed(2),
      }));

    // Suma pendiente por pagar usando asignaciones
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

    // Total asignado a tareas completas
    const totalAsignado = (asignaciones || [])
      .filter((a) => a.clienteid === cliente.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);

    // Suma todos los pagos del cliente
    const totalPagos = (pagos || [])
      .filter((p) => p.clienteId === cliente.id)
      .reduce((acc, p) => acc + Number(p.cantidad), 0);

    // Saldo a cuenta (pagos no asignados)
    const saldoACuenta = totalPagos - totalAsignado;

    // Resumen pagos usados por cada pago (opcional para la tabla de pagos)
    const pagosUsados = (asignaciones || [])
      .filter((a) => a.clienteid === cliente.id)
      .reduce((acc, a) => {
        acc[a.pagoid] = (acc[a.pagoid] || 0) + Number(a.usado);
        return acc;
      }, {});

    // Deuda real: lo pendiente menos el saldo a cuenta, nunca negativa
    const deudaReal = Math.max(0, +(totalPendiente - saldoACuenta).toFixed(2));

    return {
      clienteId: cliente.id,
      nombre: cliente.nombre,
      totalPagado: +totalAsignado.toFixed(2),
      totalHorasPendientes: trabajosPendientes.reduce((acc, t) => {
        // Suma el dinero ya asignado a este trabajo
        const asignado = (asignaciones || [])
          .filter((a) => a.trabajoid === t.id && a.clienteid === cliente.id)
          .reduce((acc, a) => acc + Number(a.usado), 0);
        const pendienteDinero = Math.max(0, +(t.coste - asignado));
        const horasPendientes = +(
          pendienteDinero / (cliente.precioHora || 1)
        ).toFixed(2);
        return acc + horasPendientes;
      }, 0),
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

module.exports = router;
