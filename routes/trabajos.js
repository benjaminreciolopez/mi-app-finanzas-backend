const express = require("express");
const router = express.Router();
const db = require("../db/database");

// Obtener todos los trabajos
router.get("/", (req, res) => {
  db.all("SELECT * FROM trabajos", [], (err, rows) => {
    if (err) res.status(400).json({ error: err.message });
    else res.json({ data: rows });
  });
});

// Añadir nuevo trabajo
router.post("/", (req, res) => {
  const { nombre, fecha, horas, pagado } = req.body;

  const sql = `INSERT INTO trabajos (nombre, fecha, horas, pagado) VALUES (?, ?, ?, ?)`;
  const params = [nombre, fecha, horas, pagado];

  db.run(sql, params, function (err) {
    if (err) {
      res.status(400).json({ error: err.message });
    } else {
      res.json({ message: "Trabajo añadido", id: this.lastID });
    }
  });
});

// Actualizar estado de pago de un trabajo
router.put("/:id", (req, res) => {
  const { pagado } = req.body;

  db.run(
    "UPDATE trabajos SET pagado = ? WHERE id = ?",
    [pagado, req.params.id],
    function (err) {
      if (err) {
        res.status(400).json({ error: err.message });
      } else {
        // Si se marca como pagado, actualizar resumen_mensual
        if (pagado === 1) {
          actualizarResumenMensual(req.params.id);
        }
        res.json({ updated: this.changes });
      }
    }
  );
});

// Función para actualizar resumen mensual
function actualizarResumenMensual(trabajoId) {
  const sqlTrabajo = `
    SELECT trabajos.fecha, trabajos.horas, clientes.precioHora
    FROM trabajos
    INNER JOIN clientes ON trabajos.nombre = clientes.nombre
    WHERE trabajos.id = ?
  `;

  db.get(sqlTrabajo, [trabajoId], (err, trabajo) => {
    if (err || !trabajo)
      return console.error("❌ Error obteniendo trabajo:", err?.message);

    const fecha = new Date(trabajo.fecha);
    const año = fecha.getFullYear();
    const mes = fecha.getMonth() + 1;
    const total = trabajo.horas * trabajo.precioHora;

    // Comprobar si ya existe registro para ese mes
    const sqlCheck = `SELECT id, total FROM resumen_mensual WHERE año = ? AND mes = ?`;

    db.get(sqlCheck, [año, mes], (err2, row) => {
      if (err2)
        return console.error(
          "❌ Error comprobando resumen mensual:",
          err2.message
        );

      if (row) {
        // Ya existe, actualizamos sumando
        db.run(
          `UPDATE resumen_mensual SET total = total + ? WHERE id = ?`,
          [total, row.id],
          (err3) => {
            if (err3)
              console.error("❌ Error actualizando resumen:", err3.message);
          }
        );
      } else {
        // No existe, insertamos nuevo
        db.run(
          `INSERT INTO resumen_mensual (año, mes, total) VALUES (?, ?, ?)`,
          [año, mes, total],
          (err4) => {
            if (err4)
              console.error("❌ Error insertando resumen:", err4.message);
          }
        );
      }
    });
  });
}

module.exports = router;
