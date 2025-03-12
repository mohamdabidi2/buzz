const Recipe = require('../models/Recipe');

// Create a new recipe
exports.createRecipe = async (req, res) => {
  try {
    const { name, products } = req.body;

    if (!name || !products || !Array.isArray(products)) {
      return res.status(400).json({ error: 'Invalid recipe data' });
    }

    const recipe = new Recipe({ name, products });
    await recipe.save();

    res.status(201).json(recipe);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Fetch all recipes
exports.getRecipes = async (req, res) => {
  try {
    const recipes = await Recipe.find().populate('products.productId', 'product_name');
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
      const recipe = await Recipe.findById(recipeId).populate('products.productId', 'product_name');

      if (!recipe) continue;

      for (let item of recipe.products) {
        const productId = item.productId._id.toString();
        const productName = item.productId.product_name;
        const totalQuantity = (item.quantity * factor);

        if (!totalQuantities[productId]) {
          totalQuantities[productId] = { name: productName, totalQuantity };
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
