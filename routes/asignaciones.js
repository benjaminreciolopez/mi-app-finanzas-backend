// backend/routes/asignaciones.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// Obtener asignaciones de un cliente (opcionalmente filtradas por cuadrado)
router.get("/:clienteId", async (req, res) => {
  const clienteId = req.params.clienteId;
  const { cuadrado } = req.query;

  let query = supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("clienteid", clienteId)
    .order("fecha_pago", { ascending: true });

  if (cuadrado === "0" || cuadrado === "1") {
    query = query.eq("cuadrado", Number(cuadrado));
  }

  const { data, error } = await query;

  if (error) return res.status(400).json({ error: error.message });
  res.json(Array.isArray(data) ? data : []);
});

// Guarda nuevas asignaciones manuales y actualiza estado de tareas si están saldadas
router.post("/", async (req, res) => {
  const { pagoId, asignaciones } = req.body;

  if (!pagoId || !Array.isArray(asignaciones)) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  // Obtener cliente y fecha del pago
  const { data: pago, error: errorPago } = await supabase
    .from("pagos")
    .select("clienteId, fecha")
    .eq("id", pagoId)
    .single();

  if (errorPago || !pago) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  const inserts = [];

  for (const a of asignaciones) {
    const tareaId = a.tareaId ?? a.id;
    let fechaTarea = null;

    // Obtener fecha de la tarea
    if (a.tipo === "trabajo") {
      const { data: trabajo, error: errTrabajo } = await supabase
        .from("trabajos")
        .select("fecha")
        .eq("id", tareaId)
        .single();
      if (errTrabajo || !trabajo) {
        return res.status(400).json({ error: "Error al obtener trabajo" });
      }
      fechaTarea = trabajo.fecha;
    } else if (a.tipo === "material") {
      const { data: material, error: errMaterial } = await supabase
        .from("materiales")
        .select("fecha")
        .eq("id", tareaId)
        .single();
      if (errMaterial || !material) {
        return res.status(400).json({ error: "Error al obtener material" });
      }
      fechaTarea = material.fecha;
    }

    // Calcular coste total y total asignado hasta ahora
    let costeTotal = 0;
    let totalAsignado = 0;

    if (a.tipo === "trabajo") {
      const { data: trabajo } = await supabase
        .from("trabajos")
        .select("horas, clienteId")
        .eq("id", tareaId)
        .single();

      const { data: cliente } = await supabase
        .from("clientes")
        .select("precioHora")
        .eq("id", trabajo.clienteId)
        .single();

      costeTotal = trabajo.horas * cliente.precioHora;

      const { data: asigns } = await supabase
        .from("asignaciones_pago")
        .select("usado")
        .eq("trabajoid", tareaId);

      totalAsignado = asigns.reduce((sum, a) => sum + a.usado, 0);
    }

    if (a.tipo === "material") {
      const { data: material } = await supabase
        .from("materiales")
        .select("coste")
        .eq("id", tareaId)
        .single();

      costeTotal = material.coste;

      const { data: asigns } = await supabase
        .from("asignaciones_pago")
        .select("usado")
        .eq("materialid", tareaId);

      totalAsignado = asigns.reduce((sum, a) => sum + a.usado, 0);
    }

    const pendiente = +(costeTotal - totalAsignado).toFixed(2);

    if (a.usado > pendiente + 0.01) {
      return res.status(400).json({
        error: `Intentas asignar ${a.usado}€, pero solo quedan ${pendiente}€ pendientes.`,
      });
    }

    inserts.push({
      clienteid: pago.clienteId,
      pagoid: pagoId,
      tipo: a.tipo,
      trabajoid: a.tipo === "trabajo" ? tareaId : null,
      materialid: a.tipo === "material" ? tareaId : null,
      usado: a.usado,
      fecha_pago: pago.fecha,
      fecha_tarea: fechaTarea,
      cuadrado: 0,
    });
  }

  // Insertar todas las asignaciones válidas
  const { error: errorInsert } = await supabase
    .from("asignaciones_pago")
    .insert(inserts);

  if (errorInsert) return res.status(400).json({ error: errorInsert.message });

  // Recalcular estado cuadrado/pagado por tarea
  for (const a of asignaciones) {
    const tareaId = a.tareaId ?? a.id;

    if (a.tipo === "trabajo") {
      const { data: trabajo } = await supabase
        .from("trabajos")
        .select("horas, clienteId")
        .eq("id", tareaId)
        .single();

      const { data: cliente } = await supabase
        .from("clientes")
        .select("precioHora")
        .eq("id", trabajo.clienteId)
        .single();

      const coste = trabajo.horas * cliente.precioHora;

      const { data: asigns } = await supabase
        .from("asignaciones_pago")
        .select("usado")
        .eq("trabajoid", tareaId);

      const total = asigns.reduce((sum, item) => sum + item.usado, 0);

      await supabase
        .from("trabajos")
        .update({
          cuadrado: total >= coste - 0.01 ? 1 : 0,
          pagado: total >= coste - 0.01,
        })
        .eq("id", tareaId);
    }

    if (a.tipo === "material") {
      const { data: material } = await supabase
        .from("materiales")
        .select("coste")
        .eq("id", tareaId)
        .single();

      const { data: asigns } = await supabase
        .from("asignaciones_pago")
        .select("usado")
        .eq("materialid", tareaId);

      const total = asigns.reduce((sum, item) => sum + item.usado, 0);

      await supabase
        .from("materiales")
        .update({
          cuadrado: total >= material.coste - 0.01 ? 1 : 0,
          pagado: total >= material.coste - 0.01,
        })
        .eq("id", tareaId);
    }
  }

  res.json({ success: true });
});

// Elimina una asignación individual y actualiza el estado de la tarea si es necesario
router.delete("/:asignacionId", async (req, res) => {
  const asignacionId = parseInt(req.params.asignacionId);

  const { data: asignacion, error: errorAsignacion } = await supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("id", asignacionId)
    .single();

  if (errorAsignacion || !asignacion) {
    return res.status(404).json({ error: "Asignación no encontrada" });
  }

  const { error: errorDelete } = await supabase
    .from("asignaciones_pago")
    .delete()
    .eq("id", asignacionId);

  if (errorDelete) {
    return res.status(400).json({ error: "Error al eliminar la asignación" });
  }

  const campoId = asignacion.tipo === "trabajo" ? "trabajoid" : "materialid";
  const idTarea = asignacion.trabajoid || asignacion.materialid;

  const { data: otrasAsignaciones, error: errorOtras } = await supabase
    .from("asignaciones_pago")
    .select("usado")
    .eq(campoId, idTarea);

  if (errorOtras) {
    return res
      .status(500)
      .json({ error: "Error al comprobar asignaciones restantes" });
  }

  const totalAsignado = otrasAsignaciones.reduce((acc, a) => acc + a.usado, 0);

  if (asignacion.tipo === "trabajo") {
    const { data: trabajo } = await supabase
      .from("trabajos")
      .select("horas")
      .eq("id", asignacion.trabajoid)
      .single();

    const { data: cliente } = await supabase
      .from("clientes")
      .select("precioHora")
      .eq("id", asignacion.clienteid)
      .single();

    const coste = trabajo?.horas * cliente?.precioHora;

    await supabase
      .from("trabajos")
      .update({
        cuadrado: totalAsignado >= coste - 0.01 ? 1 : 0,
        pagado: totalAsignado >= coste - 0.01,
      })
      .eq("id", asignacion.trabajoid);
  } else if (asignacion.tipo === "material") {
    const { data: material } = await supabase
      .from("materiales")
      .select("coste")
      .eq("id", asignacion.materialid)
      .single();

    await supabase
      .from("materiales")
      .update({
        cuadrado: totalAsignado >= material.coste - 0.01 ? 1 : 0,
        pagado: totalAsignado >= material.coste - 0.01,
      })
      .eq("id", asignacion.materialid);
  }

  res.json({ success: true });
});

module.exports = router;
