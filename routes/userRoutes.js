const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

// 🔹 Récupérer tous les utilisateurs
router.get("/", userController.getAllUsers);

// 🔹 Ajouter un utilisateur
router.post("/", userController.createUser);

// 🔹 Supprimer un utilisateur
router.delete("/:id", userController.deleteUser);


module.exports = router;
