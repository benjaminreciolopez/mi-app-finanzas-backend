const express = require("express");
const router = express.Router();
const db = require("../db/database");

// Obtener datos de evolución (todos los registros)
router.get("/", (req, res) => {
  const año = parseInt(req.query.año) || new Date().getFullYear();

  db.all(
    "SELECT * FROM resumen_mensual WHERE año = ? ORDER BY mes",
    [año],
    (err, rows) => {
      if (err) {
        res.status(400).json({ error: err.message });
      } else {
        res.json({ data: rows });
      }
    }
  );
});

// Cerrar mes actual (calcular total de trabajos pagados y guardar)
router.post("/cerrar-mes", (req, res) => {
  const fecha = new Date();
  const año = fecha.getFullYear();
  const mes = fecha.getMonth() + 1; // (enero = 0 en JS)

  // Primero, calcular el total de trabajos pagados del mes actual
  const mesInicio = `${año}-${mes.toString().padStart(2, "0")}-01`;
  const mesFin = `${año}-${(mes + 1).toString().padStart(2, "0")}-01`;

  const sql = `
    SELECT trabajos.horas, clientes.precioHora
    FROM trabajos
    INNER JOIN clientes ON trabajos.nombre = clientes.nombre
    WHERE trabajos.pagado = 1
      AND fecha >= ? AND fecha < ?
  `;

  db.all(sql, [mesInicio, mesFin], (err, rows) => {
    if (err) {
      res.status(400).json({ error: err.message });
    } else {
      const total = rows.reduce(
        (acc, row) => acc + row.horas * row.precioHora,
        0
      );

      // Insertar el total en la tabla resumen_mensual
      db.run(
        `INSERT INTO resumen_mensual (año, mes, total) VALUES (?, ?, ?)`,
        [año, mes, total],
        function (err2) {
          if (err2) {
            res.status(400).json({ error: err2.message });
          } else {
            res.json({
              message: "Mes cerrado exitosamente",
              totalCerrado: total,
            });
          }
        }
      );
    }
  });
});

module.exports = router;
