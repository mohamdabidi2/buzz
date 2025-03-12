const User = require("../models/User");
const bcrypt = require("bcryptjs");

// 🔹 Récupérer tous les utilisateurs
exports.getAllUsers = async (req, res) => {
  try {
    console.log("hello")
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur", error });
  }
};

// 🔹 Ajouter un utilisateur
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;
    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Cet email est déjà utilisé" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({ name, email, password:hashedPassword, role, department });
    await newUser.save();
    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la création de l'utilisateur", error });
  }
};

// 🔹 Supprimer un utilisateur
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    res.status(200).json({ message: "Utilisateur supprimé avec succès" });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la suppression de l'utilisateur", error });
  }
};
