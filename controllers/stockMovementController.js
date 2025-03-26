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