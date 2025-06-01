const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient"); // ✅ sin llaves

// Obtener evolución de un año concreto
router.get("/", async (req, res) => {
  const año = parseInt(req.query.año) || new Date().getFullYear();

  const { data, error } = await supabase
    .from("resumen_mensual")
    .select("*")
    .eq("año", año)
    .order("mes", { ascending: true });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ data });
});

// Cerrar mes actual y guardar total
// Cerrar mes actual y guardar total (incluye trabajos y materiales saldados)
router.post("/cerrar-mes", async (req, res) => {
  const fecha = new Date();
  const año = fecha.getFullYear();
  const mes = fecha.getMonth() + 1;

  const mesInicio = `${año}-${mes.toString().padStart(2, "0")}-01`;
  const mesFin = `${año}-${(mes + 1).toString().padStart(2, "0")}-01`;

  // 1. ¿Ya existe este mes?
  const { data: yaCerrado } = await supabase
    .from("resumen_mensual")
    .select("id")
    .eq("año", año)
    .eq("mes", mes)
    .maybeSingle();

  if (yaCerrado) {
    return res.status(400).json({ error: "Este mes ya ha sido cerrado." });
  }

  // 2. Trabajos saldados (pagado=1 o cuadrado=1)
  const { data: trabajos, error: errorTrabajos } = await supabase
    .from("trabajos")
    .select("horas, nombre, pagado, cuadrado, fecha")
    .or("pagado.eq.1,cuadrado.eq.1")
    .gte("fecha", mesInicio)
    .lt("fecha", mesFin);

  // 3. Materiales saldados (pagado=1 o cuadrado=1)
  const { data: materiales, error: errorMateriales } = await supabase
    .from("materiales")
    .select("coste, pagado, cuadrado, fecha")
    .or("pagado.eq.1,cuadrado.eq.1")
    .gte("fecha", mesInicio)
    .lt("fecha", mesFin);

  if (errorTrabajos || errorMateriales) {
    return res
      .status(400)
      .json({ error: "Error al obtener trabajos o materiales" });
  }

  // 4. Prepara mapa de precios por cliente
  const clientesMap = {};
  const { data: clientes } = await supabase
    .from("clientes")
    .select("nombre, precioHora");

  if (!clientes) {
    return res
      .status(400)
      .json({ error: "No se pudo obtener la lista de clientes" });
  }

  clientes.forEach((c) => {
    clientesMap[c.nombre] = c.precioHora;
  });

  // 5. Calcula el total del mes (trabajos + materiales)
  const totalTrabajos = (trabajos || []).reduce((acc, t) => {
    const precio = clientesMap[t.nombre] || 0;
    return acc + t.horas * precio;
  }, 0);

  const totalMateriales = (materiales || []).reduce(
    (acc, m) => acc + (m.coste || 0),
    0
  );

  const total = totalTrabajos + totalMateriales;

  // 6. Inserta el resumen mensual
  const { error: insertError } = await supabase
    .from("resumen_mensual")
    .insert([{ año, mes, total }]);

  if (insertError) return res.status(400).json({ error: insertError.message });

  res.json({ message: "Mes cerrado exitosamente", totalCerrado: total });
});

module.exports = router;
