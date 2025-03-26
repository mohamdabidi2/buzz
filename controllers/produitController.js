const Produit = require('../models/product');
const { logActivity } = require('../helpers/logging');
const Stock = require('../models/stock');

// Add new product
exports.addProduit = async (req, res) => {
  try {
    const { product_name, barcode, unit, min_stock, price } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!product_name || !unit) {
      return res.status(400).json({ 
        message: "Product name and unit are required" 
      });
    }

    // Check for duplicate barcode if provided
    if (barcode) {
      const existingBarcode = await Produit.findOne({ barcode });
      if (existingBarcode) {
        return res.status(400).json({ 
          message: "Barcode already exists",
          existing_product: existingBarcode.product_name
        });
      }
    }

    const produit = new Produit({
      product_name,
      barcode,
      unit,
      min_stock: min_stock || 0,
      price: price || 0
    });

    await produit.save();

    // Log activity
    await logActivity(
      'create',
      'Produit',
      produit._id,
      {
        product_name: produit.product_name,
        barcode: produit.barcode,
        unit: produit.unit,
        min_stock: produit.min_stock,
        price: produit.price
      },
      userId
    );

    res.status(201).json({ 
      message: "Product created successfully",
      product: produit
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ 
      message: "Error creating product",
      error: error.message 
    });
  }
};

// Get all products with optional filters
exports.getAllProduits = async (req, res) => {
  try {
    const { search, minStock, department } = req.query;
    const query = {};

    // Search filter
    if (search) {
      query.$or = [
        { product_name: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } }
      ];
    }

    // Min stock filter
    if (minStock) {
      query.min_stock = { $gte: Number(minStock) };
    }

    // Department stock availability filter
    if (department) {
      const dept = await Department.findOne({ name: department });
      if (!dept) {
        return res.status(404).json({ message: "Department not found" });
      }
      
      const stockedProducts = await Stock.find({ department: dept._id })
        .distinct('produit');
      
      query._id = { $in: stockedProducts };
    }

    const produits = await Produit.find(query)
      .sort({ product_name: 1 })
      .collation({ locale: 'en', strength: 2 }); // Case-insensitive sorting

    // Add stock information if requested
    if (req.query.includeStock === 'true') {
      const productsWithStock = await Promise.all(
        produits.map(async (product) => {
          const stocks = await Stock.find({ produit: product._id })
            .populate('department');
          
          return {
            ...product.toObject(),
            stock: stocks.map(s => ({
              department: s.department.name,
              quantity: s.quantity,
              last_updated: s.updatedAt
            }))
          };
        })
      );

      return res.status(200).json({
        count: productsWithStock.length,
        products: productsWithStock
      });
    }

    res.status(200).json({
      count: produits.length,
      products: produits
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ 
      message: "Error fetching products",
      error: error.message 
    });
  }
};

// Get product by ID with detailed information
exports.getProduitById = async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id);
    if (!produit) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Get stock information across all departments
    const stocks = await Stock.find({ produit: produit._id })
      .populate('department')
      .sort({ 'department.name': 1 });

    // Get movement history
    const StockMovement = require('../models/StockMovement');
    const movementHistory = await StockMovement.find({ product: produit._id })
      .populate('department user')
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      product: produit,
      stock_info: {
        total_quantity: stocks.reduce((sum, s) => sum + s.quantity, 0),
        by_department: stocks.map(s => ({
          department: s.department.name,
          quantity: s.quantity,
          last_updated: s.updatedAt
        }))
      },
      movement_history: movementHistory.map(m => ({
        type: m.movementType,
        quantity: m.quantity,
        department: m.department.name,
        date: m.createdAt,
        reference: m.reference,
        user: m.user ? m.user.name : 'System'
      }))
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ 
      message: "Error fetching product",
      error: error.message 
    });
  }
};

// Update product
exports.updateProduit = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    // Get current product data
    const existingProduit = await Produit.findById(id);
    if (!existingProduit) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check for duplicate barcode if being updated
    if (updates.barcode && updates.barcode !== existingProduit.barcode) {
      const existingBarcode = await Produit.findOne({ barcode: updates.barcode });
      if (existingBarcode) {
        return res.status(400).json({ 
          message: "Barcode already exists",
          existing_product: existingBarcode.product_name
        });
      }
    }

    // Prepare changes object for logging
    const changes = {};
    Object.keys(updates).forEach(key => {
      if (existingProduit[key] !== updates[key]) {
        changes[key] = {
          from: existingProduit[key],
          to: updates[key]
        };
      }
    });

    // Update product
    const updatedProduit = await Produit.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    // Log activity if changes were made
    if (Object.keys(changes).length > 0) {
      await logActivity(
        'update',
        'Produit',
        updatedProduit._id,
        changes,
        userId
      );
    }

    res.status(200).json({
      message: "Product updated successfully",
      product: updatedProduit,
      changes: Object.keys(changes).length > 0 ? changes : 'No changes detected'
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ 
      message: "Error updating product",
      error: error.message 
    });
  }
};

// Delete product with checks
exports.deleteProduit = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if product exists
    const produit = await Produit.findById(id);
    if (!produit) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if product has stock records
    const stockRecords = await Stock.find({ produit: id });
    if (stockRecords.length > 0) {
      const departments = stockRecords.map(s => s.department);
      const departmentNames = await Department.find({ _id: { $in: departments } })
        .select('name');
      
      return res.status(400).json({
        message: "Cannot delete product with existing stock",
        stock_exists_in: departmentNames.map(d => d.name),
        total_quantity: stockRecords.reduce((sum, s) => sum + s.quantity, 0)
      });
    }

    // Log activity before deletion
    await logActivity(
      'delete',
      'Produit',
      produit._id,
      {
        product_name: produit.product_name,
        barcode: produit.barcode,
        unit: produit.unit
      },
      userId
    );

    // Delete the product
    await Produit.findByIdAndDelete(id);

    res.status(200).json({ 
      message: "Product deleted successfully",
      deleted_product: {
        name: produit.product_name,
        barcode: produit.barcode
      }
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ 
      message: "Error deleting product",
      error: error.message 
    });
  }
};

// Search products with advanced options
exports.searchProduits = async (req, res) => {
  try {
    const { query, minPrice, maxPrice, hasBarcode, sortBy, sortOrder } = req.query;
    
    const searchQuery = {};
    
    // Text search
    if (query) {
      searchQuery.$or = [
        { product_name: { $regex: query, $options: 'i' } },
        { barcode: { $regex: query, $options: 'i' } }
      ];
    }
    
    // Price range
    if (minPrice || maxPrice) {
      searchQuery.price = {};
      if (minPrice) searchQuery.price.$gte = Number(minPrice);
      if (maxPrice) searchQuery.price.$lte = Number(maxPrice);
    }
    
    // Barcode filter
    if (hasBarcode === 'true') {
      searchQuery.barcode = { $exists: true, $ne: null };
    } else if (hasBarcode === 'false') {
      searchQuery.barcode = { $exists: false };
    }
    
    // Sorting
    const sortOptions = {};
    if (sortBy) {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions.product_name = 1;
    }
    
    const produits = await Produit.find(searchQuery)
      .sort(sortOptions)
      .limit(50);
    
    res.status(200).json({
      count: produits.length,
      products: produits
    });
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({ 
      message: "Error searching products",
      error: error.message 
    });
  }
};

// Get products below minimum stock threshold
exports.getProductsBelowMinStock = async (req, res) => {
  try {
    // Get all products with their current stock levels
    const products = await Produit.aggregate([
      {
        $lookup: {
          from: 'stocks',
          localField: '_id',
          foreignField: 'produit',
          as: 'stock'
        }
      },
      {
        $project: {
          product_name: 1,
          barcode: 1,
          unit: 1,
          min_stock: 1,
          price: 1,
          total_stock: { $sum: '$stock.quantity' }
        }
      },
      {
        $match: {
          $expr: {
            $lt: ['$total_stock', '$min_stock']
          }
        }
      },
      { $sort: { total_stock: 1 } }
    ]);

    res.status(200).json({
      count: products.length,
      products: products.map(p => ({
        ...p,
        deficit: p.min_stock - p.total_stock
      }))
    });
  } catch (error) {
    console.error("Error fetching products below min stock:", error);
    res.status(500).json({ 
      message: "Error fetching products below min stock",
      error: error.message 
    });
  }
};

// Get product usage in recipes
exports.getProductUsage = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify product exists
    const product = await Produit.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    // Find all recipes that use this product
    const Recipe = require('../models/Recipe');
    const recipes = await Recipe.find({
      'products.productId': id
    })
    .select('name department_name totalCost')
    .sort({ department_name: 1 });
    
    // Calculate total usage
    const totalUsage = recipes.reduce((sum, recipe) => {
      const productInRecipe = recipe.products.find(p => p.productId.equals(id));
      return sum + productInRecipe.quantity;
    }, 0);
    
    res.status(200).json({
      product: {
        id: product._id,
        name: product.product_name,
        unit: product.unit
      },
      used_in: {
        recipe_count: recipes.length,
        total_quantity: totalUsage,
        recipes: recipes.map(r => ({
          recipe_id: r._id,
          name: r.name,
          department: r.department_name
        }))
      }
    });
  } catch (error) {
    console.error("Error fetching product usage:", error);
    res.status(500).json({ 
      message: "Error fetching product usage",
      error: error.message 
    });
  }
};