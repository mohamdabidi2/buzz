const StockMovement = require('../models/StockMovement');
const DailyCalculation = require('../models/DailyCalculation');
const mongoose = require('mongoose');

exports.compareIngredientUsage = async (req, res) => {
  try {
    const { startDate, endDate, departmentId } = req.query;
    const userId = req.user.id;

    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start and end dates are required" });
    }

    // Convert dates to start and end of day
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // 1. Get all daily calculations in date range with populated data
    const dailyCalcs = await DailyCalculation.find({
      date: { $gte: start, $lte: end }
    })
    .populate({
      path: 'calculations.recipe',
      populate: {
        path: 'department',
        model: 'Department'
      }
    })
    .populate('ingredientRequirements.product');

    // Filter by department if specified
    let filteredCalcs = dailyCalcs;
    if (departmentId) {
      filteredCalcs = dailyCalcs.filter(calc => 
        calc.calculations.some(c => 
          c.recipe.department && 
          c.recipe.department._id.toString() === departmentId
        )
      );
    }

    // Calculate total required ingredients
    const requiredIngredients = {};
    filteredCalcs.forEach(calc => {
      calc.ingredientRequirements.forEach(ing => {
        const productId = ing.product._id.toString();
        if (!requiredIngredients[productId]) {
          requiredIngredients[productId] = {
            productId: productId,
            name: ing.product.product_name,
            unit: ing.unit,
            requiredQuantity: 0,
            totalPrice: 0,
            usedInRecipes: []
          };
        }
        requiredIngredients[productId].requiredQuantity += ing.requiredQuantity;
        requiredIngredients[productId].totalPrice += ing.totalPrice;
        
        // Track which recipes use this ingredient
        calc.calculations.forEach(c => {
          if (!requiredIngredients[productId].usedInRecipes.includes(c.recipe._id.toString())) {
            requiredIngredients[productId].usedInRecipes.push(c.recipe._id.toString());
          }
        });
      });
    });

    // 2. Get all stock movements for these products in date range
    const productIds = Object.keys(requiredIngredients);
    if (productIds.length === 0) {
      return res.status(200).json({
        message: "No ingredient requirements found for the selected period",
        startDate: start,
        endDate: end,
        department: departmentId || 'All',
        comparison: []
      });
    }

    const stockMovements = await StockMovement.find({
      product: { $in: productIds.map(id => mongoose.Types.ObjectId(id)) },
      createdAt: { $gte: start, $lte: end }
    })
    .populate('product department user');

    // Calculate actual movements by department
    const actualMovements = {};
    productIds.forEach(id => {
      actualMovements[id] = {
        productId: id,
        name: requiredIngredients[id].name,
        unit: requiredIngredients[id].unit,
        movementsByDepartment: {},
        totalIn: 0,
        totalOut: 0,
        totalTransferToTrash: 0,
        totalTransferToUsed: 0,
        totalAdjustmentIn: 0,
        totalAdjustmentOut: 0
      };
    });

    stockMovements.forEach(movement => {
      const productId = movement.product._id.toString();
      const departmentId = movement.department ? movement.department._id.toString() : 'unknown';
      const quantity = movement.quantity;

      // Initialize department if not exists
      if (!actualMovements[productId].movementsByDepartment[departmentId]) {
        actualMovements[productId].movementsByDepartment[departmentId] = {
          departmentName: movement.department ? movement.department.name : 'Unknown',
          in: 0,
          out: 0,
          transferToTrash: 0,
          transferToUsed: 0,
          adjustmentIn: 0,
          adjustmentOut: 0
        };
      }

      const deptMovements = actualMovements[productId].movementsByDepartment[departmentId];

      switch (movement.movementType) {
        case 'entry':
          deptMovements.in += quantity;
          actualMovements[productId].totalIn += quantity;
          break;
        case 'exit':
          deptMovements.out += quantity;
          actualMovements[productId].totalOut += quantity;
          break;
        case 'transfer_out':
          if (movement.reference.toLowerCase().includes('trash')) {
            deptMovements.transferToTrash += quantity;
            actualMovements[productId].totalTransferToTrash += quantity;
          } else if (movement.reference.toLowerCase().includes('used')) {
            deptMovements.transferToUsed += quantity;
            actualMovements[productId].totalTransferToUsed += quantity;
          }
          break;
        case 'adjustment':
          if (quantity > 0) {
            deptMovements.adjustmentIn += quantity;
            actualMovements[productId].totalAdjustmentIn += quantity;
          } else {
            deptMovements.adjustmentOut += Math.abs(quantity);
            actualMovements[productId].totalAdjustmentOut += Math.abs(quantity);
          }
          break;
      }
    });

    // 3. Compare required vs. actual
    const comparisonResults = [];
    productIds.forEach(id => {
      const required = requiredIngredients[id];
      const actual = actualMovements[id];
      
      // Total actual out includes all types of outbound movements
      const totalActualOut = actual.totalOut + 
                           actual.totalTransferToTrash + 
                           actual.totalTransferToUsed + 
                           actual.totalAdjustmentOut;
      
      const difference = totalActualOut - required.requiredQuantity;
      const percentageDiff = required.requiredQuantity > 0 ? 
        (difference / required.requiredQuantity) * 100 : 0;

      comparisonResults.push({
        product: {
          id: id,
          name: required.name,
          unit: required.unit
        },
        required: {
          quantity: required.requiredQuantity,
          price: required.totalPrice,
          recipeCount: required.usedInRecipes.length
        },
        actual: {
          totalOut: totalActualOut,
          out: actual.totalOut,
          transferToTrash: actual.totalTransferToTrash,
          transferToUsed: actual.totalTransferToUsed,
          adjustmentOut: actual.totalAdjustmentOut,
          totalIn: actual.totalIn,
          adjustmentIn: actual.totalAdjustmentIn
        },
        comparison: {
          difference: difference,
          percentageDifference: percentageDiff,
          isMatch: Math.abs(percentageDiff) < 15, // Within 15% is considered a match
          status: Math.abs(percentageDiff) < 15 ? 'match' : 
                 difference > 0 ? 'overuse' : 'underuse'
        },
        movementsByDepartment: actual.movementsByDepartment
      });
    });

    res.status(200).json({
      startDate: start,
      endDate: end,
      department: departmentId || 'All',
      totalProducts: comparisonResults.length,
      requiredIngredients: Object.keys(requiredIngredients).length,
      productsWithMovements: Object.keys(actualMovements).length,
      comparison: comparisonResults
    });

  } catch (error) {
    console.error("Error in ingredient comparison:", error);
    res.status(500).json({ 
      message: "Error processing ingredient comparison",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};