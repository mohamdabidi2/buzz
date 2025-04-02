const Stock = require('../models/stock');
const Produit = require('../models/product');
const mongoose = require('mongoose');
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
      produit_id: stock.produit?._id,       // For reference
      product_name: stock.produit?.product_name,  // For display
      barcode: stock.produit?.barcode,      // For scanning
      unit: stock.produit?.unit,            // For quantity display
      department_id: stock.department?._id, // For reference
      department_name: stock.department?.name, // For display
      quantity: stock.quantity,             // Current stock level
      last_updated: stock.updatedAt         // For sorting/filtering
    }));

    res.status(200).json(formattedStocks);
  } catch (error) {
    console.error('Stock fetch error:', error);
    res.status(500).json({ 
      message: "Error fetching stocks",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
// Transfer product to trash department
exports.transferToTrash = async (req, res) => {
  try {
    const { stock_id, quantity, notes } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!mongoose.Types.ObjectId.isValid(stock_id)) {
      return res.status(400).json({ message: "Invalid stock ID" });
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be a positive number" });
    }

    // Find or create trash department
    let trashDepartment = await Department.findOne({ name: /trash/i });
    if (!trashDepartment) {
      trashDepartment = new Department({
        name: "Trash",
        description: "Department for discarded items"
      });
      await trashDepartment.save();
    }

    // Find the source stock record
    const sourceStock = await Stock.findById(stock_id).populate('produit department');
    if (!sourceStock) {
      return res.status(404).json({ message: "Stock record not found" });
    }

    // Check available quantity
    if (sourceStock.quantity < quantity) {
      return res.status(400).json({ 
        message: "Not enough stock available",
        available: sourceStock.quantity,
        requested: quantity
      });
    }

    // Update source stock
    const oldSourceQuantity = sourceStock.quantity;
    sourceStock.quantity -= quantity;
    await sourceStock.save();

    // Find or create trash stock record
    let trashStock = await Stock.findOne({ 
      produit: sourceStock.produit._id,
      department: trashDepartment._id
    });

    if (trashStock) {
      trashStock.quantity += quantity;
      await trashStock.save();
    } else {
      trashStock = new Stock({
        produit: sourceStock.produit._id,
        department: trashDepartment._id,
        quantity: quantity
      });
      await trashStock.save();
    }

    // Log activities
    await logActivity(
      'transfer_out',
      'Stock',
      sourceStock._id,
      { 
        quantity: { from: oldSourceQuantity, to: sourceStock.quantity },
        transfer_to: trashDepartment._id,
        transfer_quantity: quantity
      },
      userId
    );

    await logActivity(
      'transfer_in',
      'Stock',
      trashStock._id,
      { 
        quantity: { from: (trashStock.quantity - quantity), to: trashStock.quantity },
        transfer_from: sourceStock.department._id,
        transfer_quantity: quantity
      },
      userId
    );

    // Log stock movements
    const reference = notes || `Transfer to trash department`;
    
    await logStockMovement({
      product: sourceStock.produit._id,
      department: sourceStock.department._id,
      quantity: quantity,
      movementType: 'transfer_out',
      reference: reference,
      relatedDocument: sourceStock._id,
      relatedDocumentType: 'Stock',
      user: userId
    });

    await logStockMovement({
      product: sourceStock.produit._id,
      department: trashDepartment._id,
      quantity: quantity,
      movementType: 'transfer_in',
      reference: reference,
      relatedDocument: trashStock._id,
      relatedDocumentType: 'Stock',
      user: userId
    });

    res.status(200).json({
      success: true,
      message: "Product successfully transferred to trash department",
      data: {
        product: {
          id: sourceStock.produit._id,
          name: sourceStock.produit.product_name
        },
        from_department: {
          id: sourceStock.department._id,
          name: sourceStock.department.name,
          remaining_quantity: sourceStock.quantity
        },
        trash_department: {
          id: trashDepartment._id,
          name: trashDepartment.name,
          new_quantity: trashStock.quantity
        },
        transferred_quantity: quantity
      }
    });

  } catch (error) {
    console.error("Error transferring to trash department:", error);
    res.status(500).json({ 
      success: false,
      message: "Error processing transfer to trash department",
      error: error.message 
    });
  }
};
// Transfer stock
exports.transferStock = async (req, res) => {
  console.log('=== STARTING STOCK TRANSFER ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('User ID:', req.user.id);

  try {
    const { from_department, to_department, product_name, quantity, notes } = req.body;
    const userId = req.user.id;

    // Validate quantity
    console.log('Validating quantity...');
    if (typeof quantity !== 'number' || quantity <= 0) {
      console.error('Invalid quantity:', quantity);
      return res.status(400).json({ message: "Quantity must be a positive number" });
    }

    // Fetch departments
    console.log(`Fetching from department: ${from_department}`);
    const fromDepartmentData = await Department.findOne({ name: from_department });
    console.log('From department data:', fromDepartmentData);

    console.log(`Fetching to department: ${to_department}`);
    const toDepartmentData = await Department.findOne({ name: to_department });
    console.log('To department data:', toDepartmentData);

    // Fetch product
    console.log(`Fetching product: ${product_name}`);
    const productData = await Produit.findOne({ product_name });
    console.log('Product data:', productData);

    // Validate existence
    if (!fromDepartmentData || !toDepartmentData || !productData) {
      console.error('Validation failed - missing data:', {
        fromExists: !!fromDepartmentData,
        toExists: !!toDepartmentData,
        productExists: !!productData
      });
      return res.status(400).json({ 
        message: "Invalid department or product name",
        details: {
          from_department_exists: !!fromDepartmentData,
          to_department_exists: !!toDepartmentData,
          product_exists: !!productData
        }
      });
    }

    // Check source stock
    console.log('Checking source stock...');
    const fromStock = await Stock.findOne({ 
      produit: productData._id, 
      department: fromDepartmentData._id 
    });
    console.log('Source stock:', fromStock);

    if (!fromStock || fromStock.quantity < quantity) {
      console.error('Insufficient stock:', {
        available: fromStock ? fromStock.quantity : 0,
        requested: quantity
      });
      return res.status(400).json({ 
        message: "Not enough stock in the source department",
        available_quantity: fromStock ? fromStock.quantity : 0,
        requested_quantity: quantity
      });
    }

    // Process transfer
    console.log('Processing transfer...');
    const oldFromQuantity = fromStock.quantity;
    fromStock.quantity -= quantity;
    await fromStock.save();
    console.log('Updated source stock:', fromStock);

    // Handle destination
    console.log('Handling destination...');
    const toStock = await Stock.findOne({ 
      produit: productData._id, 
      department: toDepartmentData._id 
    });
    console.log('Existing destination stock:', toStock);

    let oldToQuantity = 0;
    if (toStock) {
      oldToQuantity = toStock.quantity;
      toStock.quantity += quantity;
      await toStock.save();
      console.log('Updated destination stock:', toStock);
    } else {
      console.log('Creating new destination stock entry');
      const newStock = new Stock({ 
        produit: productData._id, 
        department: toDepartmentData._id, 
        quantity 
      });
      await newStock.save();
      console.log('Created new stock:', newStock);
    }

    // Log activities
    console.log('Logging activities...');
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

    // Log stock movements
    console.log('Logging stock movements...');
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

    console.log('=== TRANSFER COMPLETED SUCCESSFULLY ===');
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
    console.error('=== TRANSFER FAILED ===');
    console.error('Error:', error);
    console.error('Stack trace:', error.stack);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    res.status(500).json({ 
      message: "Error processing stock transfer",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
// Add this to your stockController.js
exports.getTotalStockValue = async (req, res) => {
  try {
    // Aggregate all stock values
    const stocks = await Stock.aggregate([
      {
        $lookup: {
          from: 'produits', // Collection name for products
          localField: 'produit',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          productId: '$produit',
          productName: '$product.product_name',
          department: '$department',
          quantity: '$quantity',
          unitPrice: '$product.price',
          totalValue: { $multiply: ['$quantity', '$product.price'] }
        }
      },
      {
        $group: {
          _id: null,
          totalValue: { $sum: '$totalValue' },
          items: { $sum: 1 }
        }
      }
    ]);

    // If no stocks found
    if (stocks.length === 0) {
      return res.status(200).json({
        success: true,
        totalValue: 0,
        itemCount: 0
      });
    }

    // Return the total value
    res.status(200).json({
      success: true,
      totalValue: stocks[0].totalValue,
      itemCount: stocks[0].items
    });

  } catch (error) {
    console.error('Error calculating total stock value:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate total stock value',
      details: error.message
    });
  }
};
// Add this to your stockController.js
exports.transferToUsedDepartment = async (req, res) => {
  try {
    const { product_id, from_department_id, quantity, notes } = req.body;
    const userId = req.user.id;

    console.log('Transfer request:', { userId, product_id, from_department_id, quantity, notes });

    // Validate input
    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.status(400).json({ message: "Invalid stock ID" });
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be a positive number" });
    }

    // Find the used department (assuming it's named "Used" or similar)
    const usedDepartment = await Department.findOne({ name: /used/i });
    if (!usedDepartment) {
      return res.status(404).json({ message: "Used department not found" });
    }

    // Find the source stock record (since product_id is actually stock_id)
    const fromStock = await Stock.findById(product_id).populate('produit department');
    if (!fromStock) {
      return res.status(404).json({ message: "Stock record not found" });
    }

    // Verify the department matches
    const fromDepartment = await Department.findOne({ name: from_department_id });
    if (!fromDepartment || !fromStock.department._id.equals(fromDepartment._id)) {
      return res.status(400).json({ 
        message: "Stock record does not belong to specified department" 
      });
    }

    // Check available quantity
    if (fromStock.quantity < quantity) {
      return res.status(400).json({ 
        message: "Not enough stock in the source department",
        available: fromStock.quantity,
        requested: quantity
      });
    }

    // Process the transfer
    const oldFromQuantity = fromStock.quantity;
    fromStock.quantity -= quantity;
    await fromStock.save();

    // Find or create stock in used department
    let usedStock = await Stock.findOne({ 
      produit: fromStock.produit._id, 
      department: usedDepartment._id 
    });

    let oldUsedQuantity = 0;
    if (usedStock) {
      oldUsedQuantity = usedStock.quantity;
      usedStock.quantity += quantity;
      await usedStock.save();
    } else {
      usedStock = new Stock({
        produit: fromStock.produit._id,
        department: usedDepartment._id,
        quantity: quantity
      });
      await usedStock.save();
    }

    // Log activities
    await logActivity(
      'transfer_out',
      'Stock',
      fromStock._id,
      { 
        quantity: { from: oldFromQuantity, to: fromStock.quantity },
        transfer_to: usedDepartment._id,
        transfer_quantity: quantity
      },
      userId
    );

    await logActivity(
      'transfer_in',
      'Stock',
      usedStock._id,
      { 
        quantity: { from: oldUsedQuantity, to: usedStock.quantity },
        transfer_from: fromDepartment._id,
        transfer_quantity: quantity
      },
      userId
    );

    // Log stock movements
    const reference = notes || `Transfer to used department`;
    
    await logStockMovement({
      product: fromStock.produit._id,
      department: fromDepartment._id,
      quantity: quantity,
      movementType: 'transfer_out',
      reference: reference,
      relatedDocument: fromStock._id,
      relatedDocumentType: 'Stock',
      user: userId
    });

    await logStockMovement({
      product: fromStock.produit._id,
      department: usedDepartment._id,
      quantity: quantity,
      movementType: 'transfer_in',
      reference: reference,
      relatedDocument: usedStock._id,
      relatedDocumentType: 'Stock',
      user: userId
    });

    res.status(200).json({
      message: "Product successfully transferred to used department",
      data: {
        product: {
          id: fromStock.produit._id,
          name: fromStock.produit.product_name
        },
        from_department: {
          id: fromDepartment._id,
          name: fromDepartment.name,
          remaining_quantity: fromStock.quantity
        },
        used_department: {
          id: usedDepartment._id,
          name: usedDepartment.name,
          new_quantity: usedStock.quantity
        },
        transferred_quantity: quantity,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error("Error transferring to used department:", error);
    res.status(500).json({ 
      message: "Error processing transfer to used department",
      error: error.message 
    });
  }
};