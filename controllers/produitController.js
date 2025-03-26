const Produit = require('../models/product');

// Add new produit
exports.addProduit = async (req, res) => {
  
  try {
    
    
    const produit = new Produit(req.body);
    await produit.save();
    res.status(201).json({ message: "Produit added successfully", produit });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all produits
exports.getAllProduits = async (req, res) => {
  try {
   
    const produits = await Produit.find();
    res.status(200).json(produits);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get produit by ID
exports.getProduitById = async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id).populate('department');
    if (!produit) {
      return res.status(404).json({ message: "Produit not found" });
    }
    res.status(200).json(produit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update produit
exports.updateProduit = async (req, res) => {
  console.log(req.params.id, req.body)
  try {
    const produit = await Produit.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!produit) {
      return res.status(404).json({ message: "Produit not found" });
    }
    res.status(200).json(produit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete produit
exports.deleteProduit = async (req, res) => {
  try {
    const produit = await Produit.findByIdAndDelete(req.params.id);
    if (!produit) {
      return res.status(404).json({ message: "Produit not found" });
    }
    res.status(200).json({ message: "Produit deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
