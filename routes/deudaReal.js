const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

router.get("/", async (req, res) => {
  const [clientesRes, trabajosRes, materialesRes, pagosRes] = await Promise.all(
    [
      supabase.from("clientes").select("id, nombre, precioHora"),
      supabase.from("trabajos").select("clienteId, horas, pagado"),
      supabase.from("materiales").select("clienteid, coste, pagado"),
      supabase.from("pagos").select("clienteId, cantidad"),
    ]
  );

  if (
    clientesRes.error ||
    trabajosRes.error ||
    materialesRes.error ||
    pagosRes.error
  ) {
    console.error("Errores detectados:", {
      clientesRes: clientesRes.error,
      trabajosRes: trabajosRes.error,
      materialesRes: materialesRes.error,
      pagosRes: pagosRes.error,
    });
    return res
      .status(500)
      .json({ error: "Error al obtener datos de Supabase" });
  }

  const clientes = clientesRes.data;
  const trabajos = trabajosRes.data;
  const materiales = materialesRes.data;
  const pagos = pagosRes.data;

  const resumen = clientes.map((cliente) => {
    // Solo trabajos pendientes
    const trabajosPendientes = trabajos.filter(
      (t) => t.clienteId === cliente.id && t.pagado !== 1
    );
    const horasPendientes = trabajosPendientes.reduce(
      (acc, t) => acc + Number(t.horas || 0),
      0
    );
    const costeTrabajosPendientes = horasPendientes * cliente.precioHora;

    // Solo materiales pendientes
    const materialesPendientes = materiales.filter(
      (m) => m.clienteid === cliente.id && m.pagado !== 1
    );
    const costeMaterialesPendientes = materialesPendientes.reduce(
      (acc, m) => acc + Number(m.coste || 0),
      0
    );

    // Total pagado por el cliente
    const pagosCliente = pagos.filter((p) => p.clienteId === cliente.id);
    const totalPagado = pagosCliente.reduce(
      (acc, p) => acc + Number(p.cantidad || 0),
      0
    );

    const totalDeuda = Math.max(
      0,
      costeTrabajosPendientes + costeMaterialesPendientes - totalPagado
    );

    return {
      clienteId: cliente.id,
      nombre: cliente.nombre,
      totalHorasPendientes: horasPendientes,
      totalMaterialesPendientes: costeMaterialesPendientes,
      totalPagado,
      totalDeuda,
    };
  });

  res.json(resumen);
});

module.exports = router;
