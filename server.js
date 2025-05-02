require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const clientesRoutes = require("./routes/clientes");
const trabajosRoutes = require("./routes/trabajos");
const pagosRoutes = require("./routes/pagos");
const materialesRoutes = require("./routes/materiales");
const evolucionRoutes = require("./routes/evolucion");

const app = express();
const PORT = 3001;

// Middlewares
app.use(
  cors({
    origin:
      "https://mi-app-finanzas-frontend-git-main-benjamins-projects-1d0caeba.vercel.app",
  })
);
app.use(bodyParser.json());

// Rutas
app.use("/api/clientes", clientesRoutes);
app.use("/api/trabajos", trabajosRoutes);
app.use("/api/pagos", pagosRoutes);
app.use("/api/materiales", materialesRoutes);
app.use("/api/evolucion", evolucionRoutes);

// Start
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
