const Stock = require('../models/stock');
const Produit = require('../models/product');
const Department = require('../models/Department');
const { logActivity, logStockMovement } = require('../helpers/logging');

// Add stock
exports.addStock = async (req, res) => {
  try {
    const { product_name, quantity, department } = req.body;
    const userId = req.user.id;

    // Validate quantity
    if (typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be a positive number" });
    }

    // 1. Find product by name
    const produit = await Produit.findOne({ product_name });
    if (!produit) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 2. Find department by name
    const departmentDoc = await Department.findOne({ name: department });
    if (!departmentDoc) {
      return res.status(404).json({ message: "Department not found" });
    }

    // 3. Check if stock exists
    const existingStock = await Stock.findOne({
      produit: produit._id,
      department: departmentDoc._id,
    });

    if (existingStock) {
      // 4. Update existing stock quantity
      const oldQuantity = existingStock.quantity;
      existingStock.quantity += quantity;
      await existingStock.save();
      
      // Log activity
      await logActivity(
        'update',
        'Stock',
        existingStock._id,
        { 
          quantity: { from: oldQuantity, to: existingStock.quantity },
          product: produit._id,
          department: departmentDoc._id
        },
        userId
      );
      
      // Log stock movement (entry)
      await logStockMovement({
        product: produit._id,
        department: departmentDoc._id,
        quantity: quantity,
        movementType: 'entry',
        reference: 'Manual stock addition',
        relatedDocument: existingStock._id,
        relatedDocumentType: 'Stock',
        user: userId
      });

      return res.status(200).json({ 
        message: "Stock updated successfully", 
        stock: existingStock 
      });
    } else {
      // 5. Create new stock entry
      const newStock = new Stock({
        produit: produit._id,
        department: departmentDoc._id,
        quantity,
      });
      await newStock.save();
      
      // Log activity
      await logActivity(
        'create', 
        'Stock', 
        newStock._id, 
        {
          product: produit._id,
          department: departmentDoc._id,
          initialQuantity: quantity
        },
        userId
      );
      
      // Log stock movement (entry)
      await logStockMovement({
        product: produit._id,
        department: departmentDoc._id,
        quantity: quantity,
        movementType: 'entry',
        reference: 'Initial stock creation',
        relatedDocument: newStock._id,
        relatedDocumentType: 'Stock',
        user: userId
      });

      return res.status(201).json({ 
        message: "Stock created successfully", 
        stock: newStock 
      });
    }
  } catch (error) {
    console.error("Add stock error:", error);
    res.status(500).json({ 
      message: "Error processing stock addition",
      error: error.message 
    });
  }
};

// Get all stocks
exports.getAllStocks = async (req, res) => {
  try {
    const stocks = await Stock.find()
      .populate('produit department')
      .sort({ updatedAt: -1 });

    const formattedStocks = stocks.map(stock => ({
      stock_id: stock._id,
      produit_id: stock.produit._id,
      product_name: stock.produit.product_name,
      barcode: stock.produit.barcode,
      unit: stock.produit.unit,
      department_id: stock.department._id,
      department_name: stock.department.name,
      quantity: stock.quantity,
      last_updated: stock.updatedAt
    }));

    res.status(200).json(formattedStocks);
  } catch (error) {
    res.status(500).json({ 
      message: "Error fetching stocks",
      error: error.message 
    });
  }
};

// Transfer stock
exports.transferStock = async (req, res) => {
  try {
    const { from_department, to_department, product_name, quantity, notes } = req.body;
    const userId = req.user.id;

    // Validate quantity
    if (typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be a positive number" });
    }

    // Fetch the department IDs from the database
    const fromDepartmentData = await Department.findOne({ name: from_department });
    const toDepartmentData = await Department.findOne({ name: to_department });

    // Fetch the product ID from the database
    const productData = await Produit.findOne({ product_name });

    // Check if the departments and product exist
    if (!fromDepartmentData || !toDepartmentData || !productData) {
      return res.status(400).json({ 
        message: "Invalid department or product name",
        details: {
          from_department_exists: !!fromDepartmentData,
          to_department_exists: !!toDepartmentData,
          product_exists: !!productData
        }
      });
    }

    // Decrease quantity from the source department
    const fromStock = await Stock.findOne({ 
      produit: productData._id, 
      department: fromDepartmentData._id 
    });
    
    if (!fromStock || fromStock.quantity < quantity) {
      return res.status(400).json({ 
        message: "Not enough stock in the source department",
        available_quantity: fromStock ? fromStock.quantity : 0,
        requested_quantity: quantity
      });
    }

    const oldFromQuantity = fromStock.quantity;
    fromStock.quantity -= quantity;
    await fromStock.save();

    // Increase quantity in the destination department
    const toStock = await Stock.findOne({ 
      produit: productData._id, 
      department: toDepartmentData._id 
    });
    
    let oldToQuantity = 0;
    if (toStock) {
      oldToQuantity = toStock.quantity;
      toStock.quantity += quantity;
      await toStock.save();
    } else {
      const newStock = new Stock({ 
        produit: productData._id, 
        department: toDepartmentData._id, 
        quantity 
      });
      await newStock.save();
    }

    // Log activities for both departments
    await logActivity(
      'update',
      'Stock',
      fromStock._id,
      { 
        quantity: { from: oldFromQuantity, to: fromStock.quantity },
        transfer: {
          to_department: toDepartmentData._id,
          quantity: quantity
        }
      },
      userId
    );
    
    if (toStock) {
      await logActivity(
        'update',
        'Stock',
        toStock._id,
        { 
          quantity: { from: oldToQuantity, to: toStock.quantity },
          transfer: {
            from_department: fromDepartmentData._id,
            quantity: quantity
          }
        },
        userId
      );
    }

    // Log stock movements (out from source, in to destination)
    const reference = notes || `Transfer between departments`;
    
    await logStockMovement({
      product: productData._id,
      department: fromDepartmentData._id,
      quantity: quantity,
      movementType: 'transfer_out',
      reference: reference,
      relatedDocument: fromStock._id,
      relatedDocumentType: 'Stock',
      user: userId
    });

    await logStockMovement({
      product: productData._id,
      department: toDepartmentData._id,
      quantity: quantity,
      movementType: 'transfer_in',
      reference: reference,
      relatedDocument: toStock ? toStock._id : null,
      relatedDocumentType: 'Stock',
      user: userId
    });

    res.status(200).json({ 
      message: "Stock transferred successfully",
      details: {
        product: productData.product_name,
        quantity: quantity,
        from_department: fromDepartmentData.name,
        to_department: toDepartmentData.name,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error("Transfer error:", error);
    res.status(500).json({ 
      message: "Error processing stock transfer",
      error: error.message 
    });
  }
};

// Get stocks by department
exports.getStocksByDepartment = async (req, res) => {
  try {
    const { department } = req.params;

    // 1. Find department by name
    const departmentDoc = await Department.findOne({ name: department });
    if (!departmentDoc) {
      return res.status(404).json({ message: "Department not found" });
    }

    // 2. Fetch stocks for this department with product details
    const stocks = await Stock.find({ department: departmentDoc._id })
      .populate({
        path: 'produit',
        select: 'product_name barcode unit price min_stock'
      })
      .sort({ 'produit.product_name': 1 });

    // 3. Format response
    const formattedStocks = stocks.map(stock => ({
      stock_id: stock._id,
      product_id: stock.produit._id,
      product_name: stock.produit.product_name,
      barcode: stock.produit.barcode,
      unit: stock.produit.unit,
      current_quantity: stock.quantity,
      min_stock: stock.produit.min_stock,
      price: stock.produit.price,
      last_updated: stock.updatedAt
    }));

    res.status(200).json({
      department: departmentDoc.name,
      stock_count: formattedStocks.length,
      stocks: formattedStocks
    });
  } catch (error) {
    console.error("Error fetching department stocks:", error);
    res.status(500).json({ 
      message: "Error fetching department stocks",
      error: error.message 
    });
  }
};

// Update stock quantity (direct adjustment)
exports.updateStockQuantity = async (req, res) => {
  try {
    const { stock_id } = req.params;
    const { new_quantity, adjustment_reason } = req.body;
    const userId = req.user.id;

    // Validate new quantity
    if (typeof new_quantity !== 'number' || new_quantity < 0) {
      return res.status(400).json({ message: "Quantity must be a positive number" });
    }

    const stock = await Stock.findById(stock_id)
      .populate('produit department');
    
    if (!stock) {
      return res.status(404).json({ message: "Stock record not found" });
    }

    const oldQuantity = stock.quantity;
    const quantityDifference = new_quantity - oldQuantity;
    stock.quantity = new_quantity;
    await stock.save();

    // Log activity
    await logActivity(
      'adjust',
      'Stock',
      stock._id,
      {
        quantity: { from: oldQuantity, to: new_quantity },
        difference: quantityDifference,
        reason: adjustment_reason || 'Manual adjustment',
        product: stock.produit._id,
        department: stock.department._id
      },
      userId
    );

    // Log stock movement
    const movementType = quantityDifference > 0 ? 'adjustment_in' : 'adjustment_out';
    
    await logStockMovement({
      product: stock.produit._id,
      department: stock.department._id,
      quantity: Math.abs(quantityDifference),
      movementType: movementType,
      reference: adjustment_reason || 'Stock quantity adjustment',
      relatedDocument: stock._id,
      relatedDocumentType: 'Stock',
      user: userId
    });

    res.status(200).json({
      message: "Stock quantity updated successfully",
      stock: {
        stock_id: stock._id,
        product_name: stock.produit.product_name,
        department_name: stock.department.name,
        old_quantity: oldQuantity,
        new_quantity: new_quantity,
        adjustment: quantityDifference,
        adjustment_type: movementType,
        updated_at: stock.updatedAt
      }
    });
  } catch (error) {
    console.error("Error updating stock quantity:", error);
    res.status(500).json({ 
      message: "Error updating stock quantity",
      error: error.message 
    });
  }
};

// Get low stock items across all departments
exports.getLowStockItems = async (req, res) => {
  try {
    // Get all stocks with product details where quantity is below min_stock
    const lowStocks = await Stock.aggregate([
      {
        $lookup: {
          from: 'produits',
          localField: 'produit',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'departments',
          localField: 'department',
          foreignField: '_id',
          as: 'department'
        }
      },
      { $unwind: '$department' },
      {
        $match: {
          $expr: {
            $lt: ['$quantity', '$product.min_stock']
          }
        }
      },
      {
        $project: {
          _id: 1,
          quantity: 1,
          product_id: '$product._id',
          product_name: '$product.product_name',
          unit: '$product.unit',
          min_stock: '$product.min_stock',
          department_id: '$department._id',
          department_name: '$department.name',
          deficit: { $subtract: ['$product.min_stock', '$quantity'] }
        }
      },
      { $sort: { deficit: -1 } }
    ]);

    res.status(200).json({
      count: lowStocks.length,
      items: lowStocks
    });
  } catch (error) {
    console.error("Error fetching low stock items:", error);
    res.status(500).json({ 
      message: "Error fetching low stock items",
      error: error.message 
    });
  }
};

// Get stock history for a specific product
exports.getProductStockHistory = async (req, res) => {
  try {
    const { product_id } = req.params;
    
    // Verify product exists
    const product = await Produit.findById(product_id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Get current stock levels across all departments
    const currentStocks = await Stock.find({ produit: product_id })
      .populate('department')
      .sort({ quantity: -1 });

    // Get stock movement history
    const StockMovement = require('../models/StockMovement');
    const movementHistory = await StockMovement.find({ product: product_id })
      .populate('department user')
      .sort({ createdAt: -1 })
      .limit(100); // Limit to 100 most recent movements

    res.status(200).json({
      product: {
        id: product._id,
        name: product.product_name,
        unit: product.unit,
        barcode: product.barcode
      },
      current_stock: currentStocks.map(s => ({
        department: s.department.name,
        quantity: s.quantity,
        last_updated: s.updatedAt
      })),
      movement_history: movementHistory.map(m => ({
        id: m._id,
        date: m.createdAt,
        movement_type: m.movementType,
        quantity: m.quantity,
        department: m.department.name,
        reference: m.reference,
        user: m.user ? m.user.name : 'System'
      }))
    });
  } catch (error) {
    console.error("Error fetching product stock history:", error);
    res.status(500).json({ 
      message: "Error fetching product stock history",
      error: error.message 
    });
  }
};