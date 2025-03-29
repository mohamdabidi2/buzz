const StockMovement = require('../models/StockMovement');

exports.getStockMovements = async (req, res) => {
  try {
    const { product, department, movementType, startDate, endDate } = req.query;
    
    const query = {};
    
    if (product) query.product = product;
    if (department) query.department = department;
    if (movementType) query.movementType = movementType;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const movements = await StockMovement.find(query)
      .populate('product department user')
      .sort({ createdAt: -1 });
      
    res.status(200).json(movements);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProductMovementHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const movements = await StockMovement.find({ product: id })
      .populate('department user')
      .sort({ createdAt: -1 });
      
    res.status(200).json(movements);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Add this to stockMovementController.js
exports.getDepartmentTransfers = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Validate date inputs
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        message: "Both startDate and endDate are required" 
      });
    }

    // Query for transfer movements within date range
    const query = {
      movementType: { $in: ['transfer_in', 'transfer_out'] },
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    const movements = await StockMovement.find(query)
      .populate('product department user')
      .sort({ createdAt: -1 });

    // Group by department and movement type
    const departmentTransfers = {};
    const productTransfers = {};

    movements.forEach(movement => {
      const deptName = movement.department?.name || 'Unknown';
      const productId = movement.product?._id.toString();
      const productName = movement.product?.product_name || 'Unknown';

      // Initialize department if not exists
      if (!departmentTransfers[deptName]) {
        departmentTransfers[deptName] = {
          name: deptName,
          transfersToUsed: 0,
          transfersToTrash: 0,
          products: {}
        };
      }

      // Initialize product if not exists
      if (productId && !departmentTransfers[deptName].products[productId]) {
        departmentTransfers[deptName].products[productId] = {
          name: productName,
          unit: movement.product?.unit || '',
          transfersToUsed: 0,
          transfersToTrash: 0
        };
      }

      // Check if transfer is to "Used" department
      if (movement.movementType === 'transfer_out' && 
          movement.reference.toLowerCase().includes('used')) {
        departmentTransfers[deptName].transfersToUsed += movement.quantity;
        if (productId) {
          departmentTransfers[deptName].products[productId].transfersToUsed += movement.quantity;
        }
      }
      
      // Check if transfer is to "Trash" department
      if (movement.movementType === 'transfer_out' && 
          movement.reference.toLowerCase().includes('trash')) {
        departmentTransfers[deptName].transfersToTrash += movement.quantity;
        if (productId) {
          departmentTransfers[deptName].products[productId].transfersToTrash += movement.quantity;
        }
      }
    });

    // Get current stock levels for each department
    const Stock = require('../models/stock');
    const currentStocks = await Stock.find()
      .populate('produit department')
      .exec();

    const departmentStocks = {};
    
    currentStocks.forEach(stock => {
      const deptName = stock.department?.name || 'Unknown';
      if (!departmentStocks[deptName]) {
        departmentStocks[deptName] = {
          name: deptName,
          totalQuantity: 0,
          totalValue: 0,
          products: []
        };
      }

      departmentStocks[deptName].totalQuantity += stock.quantity;
      departmentStocks[deptName].totalValue += stock.quantity * (stock.produit?.price || 0);
      departmentStocks[deptName].products.push({
        productId: stock.produit?._id,
        name: stock.produit?.product_name || 'Unknown',
        quantity: stock.quantity,
        unit: stock.produit?.unit || '',
        price: stock.produit?.price || 0,
        value: stock.quantity * (stock.produit?.price || 0)
      });
    });

    res.status(200).json({
      departmentTransfers,
      departmentStocks
    });
  } catch (error) {
    console.error("Error fetching department transfers:", error);
    res.status(500).json({ 
      message: "Error fetching department transfers",
      error: error.message 
    });
  }
};