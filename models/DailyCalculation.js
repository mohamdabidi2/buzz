const mongoose = require('mongoose');

const dailyCalculationSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
    index: true
  },
  calculations: [{
    recipe: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recipe',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    }
  }],
  ingredientRequirements: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Produit',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    unit: {
      type: String,
      required: true
    },
    requiredQuantity: {
      type: Number,
      required: true
    },
    totalPrice: {
      type: Number,
      required: true
    }
  }],
  totalCost: {
    type: Number,
    required: true
  }
}, { timestamps: true });

// Pre-save hook to ensure date is at start of day
dailyCalculationSchema.pre('save', function(next) {
  this.date = new Date(this.date.setHours(0, 0, 0, 0));
  next();
});

const DailyCalculation = mongoose.model('DailyCalculation', dailyCalculationSchema);

module.exports = DailyCalculation;