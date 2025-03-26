const Recipe = require('../models/Recipe');
const Produit = require('../models/Produit');

// Create a new recipe
exports.createRecipe = async (req, res) => {
  try {
    const { name, products } = req.body;

    if (!name || !products || !Array.isArray(products)) {
      return res.status(400).json({ error: 'Invalid recipe data' });
    }

    // Fetch product details for each product in the recipe
    const enrichedProducts = await Promise.all(
      products.map(async (product) => {
        const productDetails = await Produit.findById(product.productId);
        if (!productDetails) {
          throw new Error(`Product not found: ${product.productId}`);
        }
        
        return {
          productId: product.productId,
          quantity: product.quantity,
          productName: productDetails.product_name,
          unit: productDetails.unit,
          price: productDetails.price
        };
      })
    );

    const recipe = new Recipe({ 
      name, 
      products: enrichedProducts 
    });
    
    await recipe.save();

    res.status(201).json(recipe);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Fetch all recipes with populated product details
exports.getRecipes = async (req, res) => {
  try {
    const recipes = await Recipe.find().populate({
      path: 'products.productId',
      select: 'product_name unit price'
    });
    
    res.status(200).json(recipes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Calculate total quantities of products based on selected recipes
exports.calculateTotal = async (req, res) => {
  try {
    const calculations = req.body; // [{ recipeId, factor }]

    if (!Array.isArray(calculations) || calculations.length === 0) {
      return res.status(400).json({ error: 'Invalid request format' });
    }

    let totalQuantities = {};

    for (let calc of calculations) {
      const { recipeId, factor } = calc;
      const recipe = await Recipe.findById(recipeId).populate({
        path: 'products.productId',
        select: 'product_name unit price'
      });

      if (!recipe) continue;

      for (let item of recipe.products) {
        const productId = item.productId._id.toString();
        const productName = item.productId.product_name;
        const unit = item.productId.unit;
        const totalQuantity = (item.quantity * factor);

        if (!totalQuantities[productId]) {
          totalQuantities[productId] = { 
            name: productName, 
            unit: unit,
            totalQuantity 
          };
        } else {
          totalQuantities[productId].totalQuantity += totalQuantity;
        }
      }
    }

    res.status(200).json(Object.values(totalQuantities));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};