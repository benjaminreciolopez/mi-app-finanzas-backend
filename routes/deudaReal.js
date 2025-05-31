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

  // 3. Asignaciones de pagos: revisa nombres en la tabla
  const { data: asignaciones, error: asignacionesError } = await supabase
    .from("asignaciones_pago")
    .select("*");

  if (asignacionesError) {
    return res.status(500).json({ error: "Error al obtener asignaciones" });
  }

  // 4. Calcula resumen
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

    // Resumen pagos usados
    const pagosUsados = (asignaciones || [])
      .filter((a) => a.clienteid === cliente.id)
      .reduce((acc, a) => {
        acc[a.pagoid] = (acc[a.pagoid] || 0) + Number(a.usado);
        return acc;
      }, {});
    const totalPagado = Object.values(pagosUsados).reduce((a, b) => a + b, 0);

    return {
      clienteId: cliente.id,
      nombre: cliente.nombre,
      totalPagado: +totalPagado.toFixed(2),
      totalHorasPendientes: trabajosPendientes.reduce(
        (acc, t) => acc + t.horas,
        0
      ),
      totalMaterialesPendientes: materialesPendientes.reduce(
        (acc, m) => acc + m.coste,
        0
      ),
      totalDeuda: +totalPendiente.toFixed(2),
      pagosUsados: Object.entries(pagosUsados).map(([id, usado]) => ({
        id,
        usado: +usado.toFixed(2),
      })),
    };
  });

  res.json(resumen);
});

module.exports = router;
