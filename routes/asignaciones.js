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

// Guardar nuevas asignaciones manuales y actualizar estado de tareas si están saldadas
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

  // Insertar las nuevas asignaciones
  const inserts = asignaciones.map((a) => ({
    clienteid: pago.clienteId,
    pagoid: pagoId,
    tipo: a.tipo,
    trabajoid: a.tipo === "trabajo" ? a.tareaId : null,
    materialid: a.tipo === "material" ? a.tareaId : null,
    usado: a.usado,
    fecha_pago: pago.fecha,
    fecha_tarea: a.fechaTarea || null,
    cuadrado: 0,
  }));

  const { error: errorInsert } = await supabase
    .from("asignaciones_pago")
    .insert(inserts);

  if (errorInsert) return res.status(400).json({ error: errorInsert.message });

  // Agrupar sumas por tarea
  const tareasPorTipo = { trabajo: new Map(), material: new Map() };
  for (const a of asignaciones) {
    const map = tareasPorTipo[a.tipo];
    const totalPrevio = map.get(a.tareaId) || 0;
    map.set(a.tareaId, totalPrevio + a.usado);
  }

  // Obtener precioHora del cliente
  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", pago.clienteId)
    .single();

  if (errorCliente || !cliente) {
    return res.status(400).json({ error: "No se pudo obtener el cliente" });
  }

  // Actualizar trabajos saldados
  for (const [trabajoId, totalUsado] of tareasPorTipo.trabajo) {
    const { data: trabajo } = await supabase
      .from("trabajos")
      .select("horas")
      .eq("id", trabajoId)
      .single();

    const coste = trabajo?.horas * cliente.precioHora;
    if (trabajo && totalUsado >= coste) {
      await supabase
        .from("trabajos")
        .update({ cuadrado: 1, pagado: 1 })
        .eq("id", trabajoId);
    }
  }

  // Actualizar materiales saldados
  for (const [materialId, totalUsado] of tareasPorTipo.material) {
    const { data: material } = await supabase
      .from("materiales")
      .select("coste")
      .eq("id", materialId)
      .single();

    if (material && totalUsado >= material.coste) {
      await supabase
        .from("materiales")
        .update({ cuadrado: 1 })
        .eq("id", materialId);
    }
  }

  res.json({ success: true });
});
// Elimina una asignación individual y actualiza el estado de la tarea si es necesario
router.delete("/:asignacionId", async (req, res) => {
  const asignacionId = parseInt(req.params.asignacionId);

  // 1. Obtener la asignación antes de eliminar
  const { data: asignacion, error: errorAsignacion } = await supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("id", asignacionId)
    .single();

  if (errorAsignacion || !asignacion) {
    return res.status(404).json({ error: "Asignación no encontrada" });
  }

  // 2. Eliminar la asignación
  const { error: errorDelete } = await supabase
    .from("asignaciones_pago")
    .delete()
    .eq("id", asignacionId);

  if (errorDelete) {
    return res.status(400).json({ error: "Error al eliminar la asignación" });
  }

  // 3. Verificar si la tarea sigue saldada (suma de asignaciones)
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

  // 4. Obtener el coste real de la tarea
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

    if (coste && totalAsignado < coste) {
      await supabase
        .from("trabajos")
        .update({ cuadrado: 0 })
        .eq("id", asignacion.trabajoid);
    }
  } else if (asignacion.tipo === "material") {
    const { data: material } = await supabase
      .from("materiales")
      .select("coste")
      .eq("id", asignacion.materialid)
      .single();

    if (material?.coste && totalAsignado < material.coste) {
      await supabase
        .from("materiales")
        .update({ cuadrado: 0 })
        .eq("id", asignacion.materialid);
    }
  }

  res.json({ success: true });
});

module.exports = router;
