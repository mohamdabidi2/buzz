const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Produit',
    required: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  movementType: {
    type: String,
    enum: ['entry', 'exit', 'transfer_in', 'transfer_out', 'adjustment'],
    required: true
  },
  reference: {
    type: String,
    required: true
  },
  relatedDocument: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  relatedDocumentType: {
    type: String,
    enum: ['Stock', 'Recipe', 'DailyCalculation', 'Transfer', 'Adjustment'],
    required: false
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

module.exports = StockMovement;