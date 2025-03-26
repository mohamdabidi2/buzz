const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  products: [
    {
      productId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Produit', 
        required: true 
      },
      quantity: { 
        type: Number, 
        required: true,
        min: 0
      },
      productName: { 
        type: String,
        required: true
      },
      unit: {
        type: String,
        required: true
      },
      price: { 
        type: Number,
        min: 0
      }
    }
  ],
  totalCost: { 
    type: Number,
    default: 0,
    min: 0
  },
  department_name: { 
    type: String,
    required: true
  },
}, { 
  timestamps: true 
});

// Calculate total cost before saving
recipeSchema.pre('save', function(next) {
  if (this.products && this.products.length > 0) {
    this.totalCost = this.products.reduce((total, product) => {
      return total + (product.price || 0) * product.quantity;
    }, 0);
  }
  next();
});

const Recipe = mongoose.model('Recipe', recipeSchema);

module.exports = Recipe;