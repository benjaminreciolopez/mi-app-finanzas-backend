const express = require("express");
const router = express.Router();
const db = require("../db/database");

// Obtener materiales
router.get("/", (req, res) => {
  db.all("SELECT * FROM materiales", [], (err, rows) => {
    if (err) res.status(400).json({ error: err.message });
    else res.json({ data: rows });
  });
});

// Añadir material
router.post("/", (req, res) => {
  const { descripcion, coste, nombre, fecha, pagado = 0 } = req.body;

  const sql = `INSERT INTO materiales (descripcion, coste, nombre, fecha, pagado) VALUES (?, ?, ?, ?, ?)`;
  const params = [descripcion, coste, nombre, fecha, pagado];

  db.run(sql, params, function (err) {
    if (err) {
      console.error("❌ Error insertando material:", err.message);
      res.status(400).json({ error: err.message });
    } else {
      res.json({ message: "Material añadido", id: this.lastID });
    }
  });
});

// Marcar material como pagado
router.put("/:id", (req, res) => {
  const { pagado } = req.body;

  db.run(
    "UPDATE materiales SET pagado = ? WHERE id = ?",
    [pagado, req.params.id],
    function (err) {
      if (err) {
        res.status(400).json({ error: err.message });
      } else {
        res.json({ updated: this.changes });
      }
    }
  );
});

module.exports = router;
