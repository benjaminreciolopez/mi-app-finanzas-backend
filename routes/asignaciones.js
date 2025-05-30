// backend/routes/asignaciones.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// SOLO ESTA RUTA BÁSICA (para que nada interfiera)
router.get("/:clienteId", async (req, res) => {
  res.json({ ok: true, clienteId: req.params.clienteId });
});

module.exports = router;
