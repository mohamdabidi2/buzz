const Recipe = require('../models/Recipe');
const Produit = require('../models/product');

// Helper function to validate recipe data
const validateRecipeData = (name, products) => {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Recipe name is required and must be a non-empty string');
  }
  
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Products array is required and must contain at least one product');
  }

  products.forEach(product => {
    if (!product.productId || !product.quantity) {
      throw new Error('Each product must have a productId and quantity');
    }
    if (typeof product.quantity !== 'number' || product.quantity <= 0) {
      throw new Error('Quantity must be a positive number');
    }
  });
};

// Create a new recipe
exports.createRecipe = async (req, res) => {
  try {
    const { name, products, department_name } = req.body;

    // Validate input
    validateRecipeData(name, products);

    // Fetch product details and calculate total cost
    let totalCost = 0;
    const enrichedProducts = await Promise.all(
      products.map(async (product) => {
        const productDetails = await Produit.findById(product.productId);
        if (!productDetails) {
          throw new Error(`Product not found: ${product.productId}`);
        }
        
        const productCost = (productDetails.price || 0) * product.quantity;
        totalCost += productCost;
        
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
      name: name.trim(),
      products: enrichedProducts,
      totalCost,
      department_name
    });
    
    await recipe.save();

    res.status(201).json({
      success: true,
      data: await Recipe.populate(recipe, {
        path: 'products.productId',
        select: 'product_name unit price'
      })
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Fetch all recipes with pagination and filtering
exports.getRecipes = async (req, res) => {
  try {
    const { page = 1, limit = 10, department } = req.query;
    const query = {};
    
    if (department) {
      query.department_name = department;
    }

    const recipes = await Recipe.find(query)
      .populate({
        path: 'products.productId',
        select: 'product_name unit price'
      })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    const count = await Recipe.countDocuments(query);

    res.status(200).json({
      success: true,
      data: recipes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        totalItems: count
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Calculate total quantities of products based on selected recipes
exports.calculateTotal = async (req, res) => {
  try {
    const { calculations } = req.body;

    if (!Array.isArray(calculations) || calculations.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Request body must contain a calculations array' 
      });
    }

    // Validate each calculation
    calculations.forEach(calc => {
      if (!calc.recipeId || !calc.factor || typeof calc.factor !== 'number' || calc.factor <= 0) {
        throw new Error('Each calculation must have a recipeId and positive factor');
      }
    });

    const ingredientRequirements = [];
    const recipeIds = calculations.map(c => c.recipeId);
    
    // Get all recipes in a single query
    const recipes = await Recipe.find({ 
      _id: { $in: recipeIds } 
    }).populate({
      path: 'products.productId',
      select: 'product_name unit price'
    });

    if (recipes.length !== calculations.length) {
      throw new Error('One or more recipes not found');
    }

    // Create a map for quick lookup
    const recipeMap = new Map();
    recipes.forEach(recipe => {
      recipeMap.set(recipe._id.toString(), recipe);
    });

    // Calculate totals
    const totals = new Map();
    
    calculations.forEach(calc => {
      const recipe = recipeMap.get(calc.recipeId);
      if (!recipe) return;

      recipe.products.forEach(product => {
        const productId = product.productId._id.toString();
        const quantity = product.quantity * calc.factor;
        const price = (product.price || 0) * calc.factor;

        if (totals.has(productId)) {
          const existing = totals.get(productId);
          existing.requiredQuantity += quantity;
          existing.totalPrice += price;
        } else {
          totals.set(productId, {
            productId: product.productId._id,
            name: product.productName,
            unit: product.unit,
            requiredQuantity: quantity,
            totalPrice: price
          });
        }
      });
    });

    res.status(200).json({
      success: true,
      data: {
        ingredientRequirements: Array.from(totals.values()),
        totalCost: Array.from(totals.values()).reduce((sum, item) => sum + item.totalPrice, 0)
      }
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Get a single recipe by ID
exports.getRecipeById = async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id).populate({
      path: 'products.productId',
      select: 'product_name unit price'
    });
    
    if (!recipe) {
      return res.status(404).json({ 
        success: false,
        error: 'Recipe not found' 
      });
    }
    
    res.status(200).json({
      success: true,
      data: recipe
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Update a recipe
exports.updateRecipe = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, products, department_name } = req.body;

    // Validate input
    validateRecipeData(name, products);

    // Calculate new total cost and enrich products
    let totalCost = 0;
    const enrichedProducts = await Promise.all(
      products.map(async (product) => {
        const productDetails = await Produit.findById(product.productId);
        if (!productDetails) {
          throw new Error(`Product not found: ${product.productId}`);
        }
        
        const productCost = (productDetails.price || 0) * product.quantity;
        totalCost += productCost;
        
        return {
          productId: product.productId,
          quantity: product.quantity,
          productName: productDetails.product_name,
          unit: productDetails.unit,
          price: productDetails.price
        };
      })
    );

    const updatedRecipe = await Recipe.findByIdAndUpdate(
      id,
      { 
        name: name.trim(),
        products: enrichedProducts,
        totalCost,
        department_name
      },
      { new: true, runValidators: true }
    ).populate({
      path: 'products.productId',
      select: 'product_name unit price'
    });

    if (!updatedRecipe) {
      return res.status(404).json({ 
        success: false,
        error: 'Recipe not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: updatedRecipe
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Delete a recipe
exports.deleteRecipe = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedRecipe = await Recipe.findByIdAndDelete(id);

    if (!deletedRecipe) {
      return res.status(404).json({ 
        success: false,
        error: 'Recipe not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Recipe deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Search recipes by name or department
exports.searchRecipes = async (req, res) => {
  try {
    const { query, department } = req.query;
    
    if (!query && !department) {
      return res.status(400).json({
        success: false,
        error: 'Search query or department is required'
      });
    }

    const searchQuery = {};
    
    if (query) {
      searchQuery.name = { $regex: query, $options: 'i' };
    }
    
    if (department) {
      searchQuery.department_name = department;
    }

    const recipes = await Recipe.find(searchQuery)
      .populate({
        path: 'products.productId',
        select: 'product_name unit price'
      })
      .limit(20);

    res.status(200).json({
      success: true,
      data: recipes
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};