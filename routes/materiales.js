const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const { recalcularAsignaciones } = require("../utils/recalcularAsignaciones");
const {
  actualizarResumenMensualMaterial,
} = require("../utils/actualizarResumenMensual");

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

// Obtener todos los materiales
router.get("/", async (req, res) => {
  const { data, error } = await supabase.from("materiales").select("*");
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

// Añadir nuevo material (permite indicar cuadrado)
router.post("/", async (req, res) => {
  const {
    descripcion,
    coste,
    nombre,
    fecha,
    pagado = 0,
    cuadrado = 0,
    clienteId,
  } = req.body;

  const { data, error } = await supabase
    .from("materiales")
    .insert([
      { descripcion, coste, nombre, fecha, pagado, cuadrado, clienteId },
    ])
    .select();

  if (error) {
    console.error("❌ Error insertando material:", error.message);
    return res.status(400).json({ error: error.message });
  }

  if (clienteId) {
    await recalcularAsignaciones(clienteId);
    const resumen = await getResumenCliente(clienteId);
    return res.json({ message: "Material añadido", id: data[0]?.id, resumen });
  }

  res.json({ message: "Material añadido", id: data[0]?.id });
});

// Actualizar material (permite actualizar cuadrado)
// Actualizar material (permite actualizar cuadrado)
router.put("/:id", async (req, res) => {
  const { pagado, cuadrado, clienteId } = req.body;

  // Trae antes el estado previo
  const { data: materialAntes } = await supabase
    .from("materiales")
    .select("fecha, coste, pagado, cuadrado")
    .eq("id", req.params.id)
    .single();

  const updateFields = {};
  if (pagado !== undefined) updateFields.pagado = pagado;
  if (cuadrado !== undefined) updateFields.cuadrado = cuadrado;

  const { error } = await supabase
    .from("materiales")
    .update(updateFields)
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });

  // Trae el estado nuevo
  const pagadoAntes = materialAntes?.pagado;
  const cuadradoAntes = materialAntes?.cuadrado;
  const pagadoAhora = pagado !== undefined ? pagado : pagadoAntes;
  const cuadradoAhora = cuadrado !== undefined ? cuadrado : cuadradoAntes;

  // Si cambia el estado cuadrado/pagado, suma o resta del resumen mensual
  if (pagadoAntes !== pagadoAhora || cuadradoAntes !== cuadradoAhora) {
    if (
      (pagadoAhora === 1 || cuadradoAhora === 1) &&
      !(pagadoAntes === 1 || cuadradoAntes === 1)
    ) {
      await actualizarResumenMensualMaterial({
        fecha: materialAntes.fecha,
        coste: materialAntes.coste,
        operacion: "sumar",
      });
    } else if (
      !(pagadoAhora === 1 || cuadradoAhora === 1) &&
      (pagadoAntes === 1 || cuadradoAntes === 1)
    ) {
      await actualizarResumenMensualMaterial({
        fecha: materialAntes.fecha,
        coste: materialAntes.coste,
        operacion: "restar",
      });
    }
  }

  let realClienteId = clienteId;
  if (!realClienteId) {
    const { data: material } = await supabase
      .from("materiales")
      .select("clienteId")
      .eq("id", req.params.id)
      .single();
    realClienteId = material?.clienteId;
  }
  if (realClienteId) {
    const resumen = await getResumenCliente(realClienteId);
    return res.json({ message: "Material actualizado correctamente", resumen });
  }

  res.json({ message: "Material actualizado correctamente" });
});
// Eliminar material y ajustar resumen mensual si estaba cuadrado/pagado
router.delete("/:id", async (req, res) => {
  const id = req.params.id;

  // Traer material antes de borrarlo
  const { data: material, error: errorMaterial } = await supabase
    .from("materiales")
    .select("fecha, coste, pagado, cuadrado, clienteId")
    .eq("id", id)
    .single();

  if (errorMaterial || !material) {
    return res.status(404).json({ error: "Material no encontrado" });
  }

  // Eliminar el material
  const { error } = await supabase.from("materiales").delete().eq("id", id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // Si estaba pagado o cuadrado, restar del resumen mensual
  if (material.pagado === 1 || material.cuadrado === 1) {
    const {
      actualizarResumenMensualMaterial,
    } = require("../utils/actualizarResumenMensual");
    await actualizarResumenMensualMaterial({
      fecha: material.fecha,
      coste: material.coste,
      operacion: "restar",
    });
  }

  // Recalcular asignaciones del cliente
  if (material.clienteId) {
    const {
      recalcularAsignaciones,
    } = require("../utils/recalcularAsignaciones");
    await recalcularAsignaciones(material.clienteId);
  }

  res.json({ deleted: true });
});

module.exports = router;
