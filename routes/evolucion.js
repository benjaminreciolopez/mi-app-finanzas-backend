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

  // 2. Obtén trabajos pagados del mes
  const { data: trabajos, error } = await supabase
    .from("trabajos")
    .select("horas, nombre")
    .eq("pagado", 1)
    .gte("fecha", mesInicio)
    .lt("fecha", mesFin);

  if (error) return res.status(400).json({ error: error.message });

  if (!trabajos || trabajos.length === 0) {
    return res.json({
      message: "No hay trabajos pagados este mes.",
      totalCerrado: 0,
    });
  }

  // 3. Prepara mapa de precios por cliente
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

  // 4. Calcula el total del mes
  const total = trabajos.reduce((acc, t) => {
    const precio = clientesMap[t.nombre] || 0;
    return acc + t.horas * precio;
  }, 0);

  // 5. Inserta el resumen mensual
  const { error: insertError } = await supabase
    .from("resumen_mensual")
    .insert([{ año, mes, total }]);

  if (insertError) return res.status(400).json({ error: insertError.message });

  res.json({ message: "Mes cerrado exitosamente", totalCerrado: total });
});

module.exports = router;
