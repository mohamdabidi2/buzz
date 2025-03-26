const Recipe = require('../models/Recipe');
const Produit = require('../models/product');
const { logActivity } = require('../helpers/logging');
const DailyCalculation = require('../models/DailyCalculation');

// Enhanced validation helper
const validateRecipeData = (name, products, department_name) => {
  const errors = [];
  
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Recipe name is required and must be a non-empty string');
  }
  
  if (!Array.isArray(products) || products.length === 0) {
    errors.push('Products array is required and must contain at least one product');
  } else {
    products.forEach((product, index) => {
      if (!product.productId) {
        errors.push(`Product at position ${index} is missing productId`);
      }
      if (typeof product.quantity !== 'number' || product.quantity <= 0) {
        errors.push(`Product at position ${index} has invalid quantity (must be positive number)`);
      }
    });
  }

  if (!department_name || typeof department_name !== 'string' || department_name.trim().length === 0) {
    errors.push('Department name is required');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
};

// Create a new recipe with enhanced logging
exports.createRecipe = async (req, res) => {
  try {
    const { name, products, department_name } = req.body;
    const userId = req.user.id;

    // Validate input
    validateRecipeData(name, products, department_name);

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

    // Log activity
    await logActivity(
      'create',
      'Recipe',
      recipe._id,
      {
        name: recipe.name,
        department: recipe.department_name,
        product_count: recipe.products.length,
        total_cost: recipe.totalCost
      },
      userId
    );

    res.status(201).json({
      success: true,
      message: "Recipe created successfully",
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

// Get all recipes with advanced filtering
exports.getRecipes = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      department, 
      minCost, 
      maxCost,
      product,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = {};
    
    // Department filter
    if (department) {
      query.department_name = department;
    }
    
    // Cost range filter
    if (minCost || maxCost) {
      query.totalCost = {};
      if (minCost) query.totalCost.$gte = Number(minCost);
      if (maxCost) query.totalCost.$lte = Number(maxCost);
    }
    
    // Product filter
    if (product) {
      query['products.productId'] = product;
    }
    
    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const recipes = await Recipe.find(query)
      .populate({
        path: 'products.productId',
        select: 'product_name unit price'
      })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort(sortOptions);

    const count = await Recipe.countDocuments(query);

    res.status(200).json({
      success: true,
      data: recipes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Get recipe by ID with detailed information
exports.getRecipeById = async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id)
      .populate({
        path: 'products.productId',
        select: 'product_name barcode unit price min_stock'
      });
    
    if (!recipe) {
      return res.status(404).json({ 
        success: false,
        error: 'Recipe not found' 
      });
    }
    
    // Get usage in daily calculations
    const usage = await DailyCalculation.aggregate([
      { $unwind: '$calculations' },
      { $match: { 'calculations.recipe': recipe._id } },
      { 
        $group: {
          _id: null,
          total_usage: { $sum: '$calculations.quantity' },
          last_used: { $max: '$date' }
        } 
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...recipe.toObject(),
        usage: {
          total: usage.length > 0 ? usage[0].total_usage : 0,
          last_used: usage.length > 0 ? usage[0].last_used : null
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Update recipe with detailed change tracking
exports.updateRecipe = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, products, department_name } = req.body;
    const userId = req.user.id;

    // Get existing recipe
    const existingRecipe = await Recipe.findById(id);
    if (!existingRecipe) {
      return res.status(404).json({ 
        success: false,
        error: 'Recipe not found' 
      });
    }

    // Validate input
    validateRecipeData(name, products, department_name);

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

    // Prepare changes for logging
    const changes = {
      name: { from: existingRecipe.name, to: name.trim() },
      department_name: { from: existingRecipe.department_name, to: department_name },
      totalCost: { from: existingRecipe.totalCost, to: totalCost },
      products: {
        old_count: existingRecipe.products.length,
        new_count: enrichedProducts.length
      }
    };

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

    // Log activity
    await logActivity(
      'update',
      'Recipe',
      updatedRecipe._id,
      changes,
      userId
    );

    res.status(200).json({
      success: true,
      message: "Recipe updated successfully",
      data: updatedRecipe,
      changes
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Delete recipe with usage checks
exports.deleteRecipe = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if recipe exists
    const recipe = await Recipe.findById(id);
    if (!recipe) {
      return res.status(404).json({ 
        success: false,
        error: 'Recipe not found' 
      });
    }

    // Check if recipe is used in daily calculations
    const usage = await DailyCalculation.findOne({ 
      'calculations.recipe': id 
    });
    
    if (usage) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete recipe used in daily calculations',
        last_used: usage.date
      });
    }

    // Log activity before deletion
    await logActivity(
      'delete',
      'Recipe',
      recipe._id,
      {
        name: recipe.name,
        department: recipe.department_name,
        product_count: recipe.products.length
      },
      userId
    );

    await Recipe.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Recipe deleted successfully',
      deleted_recipe: {
        name: recipe.name,
        department: recipe.department_name
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
      select: 'product_name unit price min_stock'
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
    let totalCost = 0;
    
    calculations.forEach(calc => {
      const recipe = recipeMap.get(calc.recipeId);
      if (!recipe) return;

      recipe.products.forEach(product => {
        const productId = product.productId._id.toString();
        const quantity = product.quantity * calc.factor;
        const price = (product.price || 0) * calc.factor;
        totalCost += price;

        if (totals.has(productId)) {
          const existing = totals.get(productId);
          existing.requiredQuantity += quantity;
          existing.totalPrice += price;
        } else {
          totals.set(productId, {
            productId: product.productId._id,
            name: product.productName,
            unit: product.unit,
            min_stock: product.productId.min_stock,
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
        totalCost,
        recipes: calculations.map(calc => ({
          recipeId: calc.recipeId,
          recipeName: recipeMap.get(calc.recipeId)?.name,
          factor: calc.factor
        }))
      }
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Search recipes with advanced options
exports.searchRecipes = async (req, res) => {
  try {
    const { 
      query, 
      department, 
      minProducts, 
      maxProducts,
      minCost,
      maxCost,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;
    
    const searchQuery = {};
    
    if (query) {
      searchQuery.name = { $regex: query, $options: 'i' };
    }
    
    if (department) {
      searchQuery.department_name = department;
    }
    
    if (minProducts || maxProducts) {
      searchQuery['products.0'] = { $exists: true }; // Ensure at least one product
      if (minProducts) {
        searchQuery[`products.${minProducts - 1}`] = { $exists: true };
      }
      if (maxProducts) {
        searchQuery[`products.${maxProducts}`] = { $exists: false };
      }
    }
    
    if (minCost || maxCost) {
      searchQuery.totalCost = {};
      if (minCost) searchQuery.totalCost.$gte = Number(minCost);
      if (maxCost) searchQuery.totalCost.$lte = Number(maxCost);
    }
    
    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const recipes = await Recipe.find(searchQuery)
      .populate({
        path: 'products.productId',
        select: 'product_name unit'
      })
      .sort(sortOptions)
      .limit(50);

    res.status(200).json({
      success: true,
      count: recipes.length,
      data: recipes
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Get recipes by product ID
exports.getRecipesByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Verify product exists
    const product = await Produit.findById(productId);
    if (!product) {
      return res.status(404).json({ 
        success: false,
        error: 'Product not found' 
      });
    }
    
    const recipes = await Recipe.find({ 
      'products.productId': productId 
    })
    .select('name department_name totalCost')
    .sort({ department_name: 1, name: 1 });
    
    res.status(200).json({
      success: true,
      product: {
        id: product._id,
        name: product.product_name,
        unit: product.unit
      },
      used_in: {
        count: recipes.length,
        recipes: recipes.map(r => ({
          id: r._id,
          name: r.name,
          department: r.department_name,
          cost: r.totalCost
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Clone recipe
exports.cloneRecipe = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const originalRecipe = await Recipe.findById(id)
      .populate('products.productId');
    
    if (!originalRecipe) {
      return res.status(404).json({ 
        success: false,
        error: 'Recipe not found' 
      });
    }
    
    // Create new recipe with "(Copy)" suffix
    const newRecipe = new Recipe({
      name: `${originalRecipe.name} (Copy)`,
      products: originalRecipe.products.map(p => ({
        productId: p.productId._id,
        quantity: p.quantity,
        productName: p.productName,
        unit: p.unit,
        price: p.price
      })),
      totalCost: originalRecipe.totalCost,
      department_name: originalRecipe.department_name
    });
    
    await newRecipe.save();
    
    // Log activity
    await logActivity(
      'clone',
      'Recipe',
      newRecipe._id,
      {
        cloned_from: originalRecipe._id,
        name: newRecipe.name,
        product_count: newRecipe.products.length
      },
      userId
    );
    
    res.status(201).json({
      success: true,
      message: "Recipe cloned successfully",
      original_recipe: originalRecipe._id,
      new_recipe: await Recipe.populate(newRecipe, {
        path: 'products.productId',
        select: 'product_name unit price'
      })
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Get recipe cost breakdown
exports.getRecipeCostBreakdown = async (req, res) => {
  try {
    const { id } = req.params;
    
    const recipe = await Recipe.findById(id)
      .populate({
        path: 'products.productId',
        select: 'product_name unit price'
      });
    
    if (!recipe) {
      return res.status(404).json({ 
        success: false,
        error: 'Recipe not found' 
      });
    }
    
    const costBreakdown = recipe.products.map(p => ({
      product: {
        id: p.productId._id,
        name: p.productName,
        unit: p.unit
      },
      quantity: p.quantity,
      unit_price: p.price,
      total_cost: p.price * p.quantity,
      percentage: (p.price * p.quantity) / recipe.totalCost * 100
    }));
    
    res.status(200).json({
      success: true,
      recipe: {
        id: recipe._id,
        name: recipe.name,
        total_cost: recipe.totalCost
      },
      cost_breakdown: costBreakdown
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};