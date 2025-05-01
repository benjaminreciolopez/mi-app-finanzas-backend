const express = require("express");
const router = express.Router();
const db = require("../db/database");

// Obtener todos los pagos
router.get("/", (req, res) => {
  db.all("SELECT * FROM pagos", [], (err, rows) => {
    if (err) res.status(400).json({ error: err.message });
    else res.json({ data: rows });
  });
});

// Añadir nuevo pago
router.post("/", (req, res) => {
  const { clienteId, cantidad, fecha } = req.body;
  db.run(
    "INSERT INTO pagos (clienteId, cantidad, fecha) VALUES (?, ?, ?)",
    [clienteId, cantidad, fecha],
    function (err) {
      if (err) res.status(400).json({ error: err.message });
      else res.json({ id: this.lastID });
    }
  );
});

module.exports = router;
