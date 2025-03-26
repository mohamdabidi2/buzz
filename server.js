const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();
connectDB();

const app = express();
app.use(express.json());

app.use("/api/auth", require("./routes/authRoutes"));
app.use('/api/produits', require("./routes/produitRoutes"));
app.use('/api/departments', require("./routes/departmentRoutes"));
app.use('/api/stocks', require("./routes/stockRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/recipes", require("./routes/recipeRoutes"));
app.use("/api/calcule", require("./routes/dailyCalculations"));


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
