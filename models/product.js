const mongoose = require('mongoose');

const produitSchema = new mongoose.Schema({
  product_name: { type: String, required: true },
  barcode: { type: String, unique: true, sparse: true },
  unit: { type: String, required: true },
  min_stock: { type: Number, default: 0 },
  price:{ type: Number, default: 0 }

}, { timestamps: true });

const Produit = mongoose.model('Produit', produitSchema);

module.exports = Produit;
