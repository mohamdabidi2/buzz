const StockMovement = require('../models/StockMovement');
const Stock = require('../models/stock'); // Your stock model
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



exports.getDepartmentTransfers = async (req, res) => {
  try {
      const { startDate, endDate, departmentId } = req.query;

      // Validate inputs
      if (!startDate) {
          return res.status(400).json({ message: "startDate is required" });
      }

      // Set date ranges
      const effectiveEndDate = endDate || startDate;
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(effectiveEndDate);
      const dayBeforeStart = new Date(startDateObj);
      dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

      // Build base query with department filter if provided
      const baseQuery = departmentId ? { department: departmentId } : {};

      // 1. Get initial stock (day before start)
      const initialStocks = await Stock.find({
          ...baseQuery,
          createdAt: { $lte: dayBeforeStart }
      }).populate('produit department');

      // 2. Get all transfer movements in the period
      const movements = await StockMovement.find({
          ...baseQuery,
          movementType: { $in: ['transfer_in', 'transfer_out'] },
          createdAt: { $gte: startDateObj, $lte: endDateObj }
      }).populate('product department');

      // 3. Get all entry movements (for initial stock calculation)
      const entryMovements = await StockMovement.find({
          ...baseQuery,
          movementType: 'entry',
          createdAt: { $lte: endDateObj } // All entries up to end date
      }).populate('product');

      // 4. Process data
      const productReport = {};

      // Process initial stock (day before)
      initialStocks.forEach(stock => {
          const productId = stock.produit?._id.toString();
          if (!productId) return;

          if (!productReport[productId]) {
              productReport[productId] = {
                  name: stock.produit?.product_name || 'Unknown',
                  unit: stock.produit?.unit || '',
                  price: stock.produit?.price || 0,
                  initialStock: 0,
                  transfersToUsed: 0,
                  transfersToTrash: 0,
                  transfersIn: 0,
                  entries: 0
              };
          }
          productReport[productId].initialStock += stock.quantity;
      });

      // Process entry movements (add to initial stock)
      entryMovements.forEach(movement => {
          const productId = movement.product?._id.toString();
          if (!productId) return;

          if (!productReport[productId]) {
              productReport[productId] = {
                  name: movement.product?.product_name || 'Unknown',
                  unit: movement.product?.unit || '',
                  price: movement.product?.price || 0,
                  initialStock: 0,
                  transfersToUsed: 0,
                  transfersToTrash: 0,
                  transfersIn: 0,
                  entries: 0
              };
          }
          productReport[productId].entries += movement.quantity;
      });

      // Process transfer movements
      movements.forEach(movement => {
          const productId = movement.product?._id.toString();
          if (!productId) return;

          if (!productReport[productId]) {
              productReport[productId] = {
                  name: movement.product?.product_name || 'Unknown',
                  unit: movement.product?.unit || '',
                  price: movement.product?.price || 0,
                  initialStock: 0,
                  transfersToUsed: 0,
                  transfersToTrash: 0,
                  transfersIn: 0,
                  entries: 0
              };
          }

          if (movement.movementType === 'transfer_out') {
              if (movement.reference.toLowerCase().includes('used')) {
                  productReport[productId].transfersToUsed += movement.quantity;
              } else if (movement.reference.toLowerCase().includes('trash')) {
                  productReport[productId].transfersToTrash += movement.quantity;
              }
          } else if (movement.movementType === 'transfer_in') {
              productReport[productId].transfersIn += movement.quantity;
          }
      });

      // 5. Calculate final values and prepare response
      const reportData = Object.values(productReport).map(product => ({
          name: product.name,
          unit: product.unit,
          price: product.price,
          initialStock: product.initialStock + product.entries + product.transfersIn,
          transfersToUsed: product.transfersToUsed,
          transfersToTrash: product.transfersToTrash,
          currentStock: (product.initialStock + product.entries + product.transfersIn) - 
                       (product.transfersToUsed + product.transfersToTrash),
          totalValue: (product.initialStock + product.entries + product.transfersIn) * product.price
      }));

      // Filter only products with transfers (used/trash) or stock movements
      const filteredReport = reportData.filter(product => 
          product.transfersToUsed > 0 || 
          product.transfersToTrash > 0 ||
          product.currentStock > 0
      );

      // 6. Send response
      res.status(200).json({
          success: true,
          data: filteredReport,
          period: {
              start: startDate,
              end: effectiveEndDate
          },
          totals: {
              totalInitialValue: filteredReport.reduce((sum, p) => sum + p.initialStock * p.price, 0),
              totalCurrentValue: filteredReport.reduce((sum, p) => sum + p.currentStock * p.price, 0),
              totalTransfersToUsed: filteredReport.reduce((sum, p) => sum + p.transfersToUsed, 0),
              totalTransfersToTrash: filteredReport.reduce((sum, p) => sum + p.transfersToTrash, 0)
          }
      });

  } catch (error) {
      console.error("Error fetching transfer report:", error);
      res.status(500).json({
          success: false,
          message: "Error fetching transfer report",
          error: error.message
      });
  }
};