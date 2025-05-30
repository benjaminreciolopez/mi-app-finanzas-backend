const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

router.get("/", async (req, res) => {
  const [clientesRes, trabajosRes, materialesRes, pagosRes] = await Promise.all(
    [
      supabase.from("clientes").select("id, nombre, precioHora"),
      supabase.from("trabajos").select("id, clienteId, fecha, horas, pagado"),
      supabase.from("materiales").select("id, clienteid, fecha, coste, pagado"),
      supabase.from("pagos").select("id, clienteId, fecha, cantidad"),
    ]
  );

  if (
    clientesRes.error ||
    trabajosRes.error ||
    materialesRes.error ||
    pagosRes.error
  ) {
    return res
      .status(500)
      .json({ error: "Error al obtener datos de Supabase" });
  }

  const clientes = clientesRes.data;
  const trabajos = trabajosRes.data;
  const materiales = materialesRes.data;
  const pagos = pagosRes.data;

  const resumen = clientes.map((cliente) => {
    const precioHora = cliente.precioHora ?? 0;

    const trabajosPendientes = trabajos
      .filter((t) => t.clienteId === cliente.id && !t.pagado)
      .map((t) => ({
        id: t.id,
        tipo: "trabajo",
        fecha: t.fecha,
        coste: t.horas * precioHora,
        horas: t.horas,
      }));

    const materialesPendientes = materiales
      .filter((m) => m.clienteid === cliente.id && !m.pagado)
      .map((m) => ({
        id: m.id,
        tipo: "material",
        fecha: m.fecha,
        coste: m.coste,
      }));

    const tareasPendientes = [
      ...trabajosPendientes,
      ...materialesPendientes,
    ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const pagosCliente = pagos
      .filter((p) => p.clienteId === cliente.id)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    let pagosRestantes = pagosCliente.map((p) => ({
      ...p,
      restante: Number(p.cantidad),
    }));

    let totalAsignado = 0;

    for (const tarea of tareasPendientes) {
      let restante = tarea.coste;

      for (const pago of pagosRestantes) {
        if (pago.restante <= 0) continue;

        const aplicar = Math.min(pago.restante, restante);

        if (aplicar > 0) {
          pago.restante = +(pago.restante - aplicar).toFixed(2); // evita decimales locos
          restante = +(restante - aplicar).toFixed(2);
          totalAsignado += aplicar;
        }

        if (restante <= 0) break;
      }

      // Aquí la tarea ya ha sido cubierta hasta donde se pudo
    }

    const totalHorasPendientes = trabajosPendientes.reduce(
      (acc, t) => acc + t.horas,
      0
    );
    const totalMaterialesPendientes = materialesPendientes.reduce(
      (acc, m) => acc + m.coste,
      0
    );
    const totalPendiente =
      totalHorasPendientes * precioHora + totalMaterialesPendientes;
    const deudaReal = Math.max(0, totalPendiente - totalAsignado);

    const pagosUsados = pagosCliente.map((p) => {
      const original = Number(p.cantidad);
      const restante =
        pagosRestantes.find((r) => r.id === p.id)?.restante ?? original;
      return {
        id: p.id,
        fecha: p.fecha,
        cantidad: original,
        usado: original - restante,
      };
    });

    return {
      clienteId: cliente.id,
      nombre: cliente.nombre,
      totalPagado: totalAsignado,
      totalHorasPendientes,
      totalMaterialesPendientes,
      totalDeuda: deudaReal,
      pagosUsados,
    };
  });

  res.json(resumen);
});

module.exports = router;
