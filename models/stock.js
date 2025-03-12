const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  produit: { type: mongoose.Schema.Types.ObjectId, ref: 'Produit', required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  quantity: { type: Number, required: true },
}, { timestamps: true });

const Stock = mongoose.model('Stock', stockSchema);

module.exports = Stock;
