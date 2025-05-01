const express = require("express");
const router = express.Router();
const db = require("../db/database");

// Obtener todos los clientes
router.get("/", (req, res) => {
  db.all("SELECT * FROM clientes", [], (err, rows) => {
    if (err) {
      res.status(400).json({ error: err.message });
    } else {
      res.json({ data: rows }); // 👈 ESTO ES LO IMPORTANTE
    }
  });
});

// Añadir nuevo cliente
router.post("/", (req, res) => {
  const { nombre, precioHora } = req.body;
  if (!nombre || !precioHora) {
    return res
      .status(400)
      .json({ error: "Nombre y precioHora son obligatorios" });
  }

  db.run(
    "INSERT INTO clientes (nombre, precioHora) VALUES (?, ?)",
    [nombre, precioHora],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: "Cliente añadido", id: this.lastID });
      }
    }
  );
});

// Actualizar cliente
router.put("/:id", (req, res) => {
  const { nombre, precioHora } = req.body;
  const { id } = req.params;

  db.run(
    "UPDATE clientes SET nombre = ?, precioHora = ? WHERE id = ?",
    [nombre, precioHora, id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (this.changes === 0) {
        res.status(404).json({ error: "Cliente no encontrado" });
      } else {
        res.json({ message: "Cliente actualizado", changes: this.changes });
      }
    }
  );
});

// Eliminar cliente
router.delete("/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM clientes WHERE id = ?", [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (this.changes === 0) {
      res.status(404).json({ error: "Cliente no encontrado" });
    } else {
      res.json({ message: "Cliente eliminado", changes: this.changes });
    }
  });
});

module.exports = router;
