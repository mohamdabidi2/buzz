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
        const { startDate, endDate } = req.query;

        // Validate startDate input
        if (!startDate) {
            return res.status(400).json({
                message: "startDate is required"
            });
        }

        // Set date ranges
        const effectiveEndDate = endDate || startDate;
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(effectiveEndDate);
        const dayBeforeStart = new Date(startDateObj);
        dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

        // 1. Query for transfer movements within date range
        const transferQuery = {
            movementType: { $in: ['transfer_in', 'transfer_out'] },
            createdAt: {
                $gte: startDateObj,
                $lte: endDateObj
            }
        };

        const movements = await StockMovement.find(transferQuery)
            .populate('product department user')
            .sort({ createdAt: -1 });

        // 2. Get stock snapshots
        // Initial stock (day before start)
        const initialStocks = await Stock.find({
            createdAt: { $lte: dayBeforeStart }
        })
            .populate('produit department')
            .sort({ createdAt: -1 })
            .exec();

        // Final stock (end date)
        const finalStocks = await Stock.find({
            createdAt: { $lte: endDateObj }
        })
            .populate('produit department')
            .sort({ createdAt: -1 })
            .exec();

        // 3. Process data
        const departmentSummaries = {};
        const initialStockMap = {};
        const finalStockMap = {};
        const transferMap = {};

        // Process initial stock
        initialStocks.forEach(stock => {
            const deptName = stock.department?.name || 'Unknown';
            const productId = stock.produit?._id.toString();

            if (!initialStockMap[deptName]) {
                initialStockMap[deptName] = {};
            }

            if (!initialStockMap[deptName][productId]) {
                initialStockMap[deptName][productId] = {
                    name: stock.produit?.product_name || 'Unknown',
                    quantity: stock.quantity,
                    unit: stock.produit?.unit || '',
                    price: stock.produit?.price || 0,
                    value: stock.quantity * (stock.produit?.price || 0)
                };
            }
        });

        // Process final stock
        finalStocks.forEach(stock => {
            const deptName = stock.department?.name || 'Unknown';
            const productId = stock.produit?._id.toString();

            if (!finalStockMap[deptName]) {
                finalStockMap[deptName] = {};
            }

            if (!finalStockMap[deptName][productId]) {
                finalStockMap[deptName][productId] = {
                    name: stock.produit?.product_name || 'Unknown',
                    quantity: stock.quantity,
                    unit: stock.produit?.unit || '',
                    price: stock.produit?.price || 0,
                    value: stock.quantity * (stock.produit?.price || 0)
                };
            }
        });

        // Process transfers
        movements.forEach(movement => {
            const deptName = movement.department?.name || 'Unknown';
            const productId = movement.product?._id.toString();
            const productName = movement.product?.product_name || 'Unknown';

            // Initialize department if not exists
            if (!transferMap[deptName]) {
                transferMap[deptName] = {
                    name: deptName,
                    transfersToUsed: 0,
                    transfersToTrash: 0,
                    transfersIn: 0,
                    products: {}
                };
            }

            // Initialize product if not exists
            if (productId && !transferMap[deptName].products[productId]) {
                transferMap[deptName].products[productId] = {
                    name: productName,
                    unit: movement.product?.unit || '',
                    transfersToUsed: 0,
                    transfersToTrash: 0,
                    transfersIn: 0
                };
            }

            // Process different movement types
            if (movement.movementType === 'transfer_out') {
                if (movement.reference.toLowerCase().includes('used')) {
                    transferMap[deptName].transfersToUsed += movement.quantity;
                    if (productId) {
                        transferMap[deptName].products[productId].transfersToUsed += movement.quantity;
                    }
                } else if (movement.reference.toLowerCase().includes('trash')) {
                    transferMap[deptName].transfersToTrash += movement.quantity;
                    if (productId) {
                        transferMap[deptName].products[productId].transfersToTrash += movement.quantity;
                    }
                }
            } else if (movement.movementType === 'transfer_in') {
                transferMap[deptName].transfersIn += movement.quantity;
                if (productId) {
                    transferMap[deptName].products[productId].transfersIn += movement.quantity;
                }
            }
        });

        // 4. Create comprehensive response
        const allDepartments = new Set([
            ...Object.keys(transferMap),
            ...Object.keys(initialStockMap),
            ...Object.keys(finalStockMap)
        ]);

        allDepartments.forEach(deptName => {
            const initialStock = initialStockMap[deptName] || {};
            const finalStock = finalStockMap[deptName] || {};
            const transfers = transferMap[deptName] || {
                name: deptName,
                transfersToUsed: 0,
                transfersToTrash: 0,
                transfersIn: 0,
                products: {}
            };

            // Calculate totalStockEntries (initial + incoming transfers)
            const totalStockEntries = JSON.parse(JSON.stringify(initialStock)); // Deep clone

            Object.entries(transfers.products).forEach(([productId, productTransfers]) => {
                if (!totalStockEntries[productId] && productTransfers.transfersIn > 0) {
                    totalStockEntries[productId] = {
                        name: productTransfers.name,
                        quantity: 0,
                        unit: productTransfers.unit,
                        price: 0, // Will be filled from initial/final stock if available
                        value: 0
                    };
                }
                if (totalStockEntries[productId]) {
                    totalStockEntries[productId].quantity += productTransfers.transfersIn;
                    // Get price from final or initial stock if missing
                    if (totalStockEntries[productId].price === 0) {
                        if (finalStock[productId]?.price) {
                            totalStockEntries[productId].price = finalStock[productId].price;
                        } else if (initialStock[productId]?.price) {
                            totalStockEntries[productId].price = initialStock[productId].price;
                        }
                    }
                    totalStockEntries[productId].value = 
                        totalStockEntries[productId].quantity * totalStockEntries[productId].price;
                }
            });

            // Build products summary
            const allProducts = new Set([
                ...Object.keys(initialStock),
                ...Object.keys(finalStock),
                ...Object.keys(transfers.products)
            ]);

            const productsSummary = {};
            allProducts.forEach(productId => {
                const initial = initialStock[productId] || {};
                const final = finalStock[productId] || {};
                const transfer = transfers.products[productId] || {};

                productsSummary[productId] = {
                    name: transfer.name || initial.name || final.name || 'Unknown',
                    unit: transfer.unit || initial.unit || final.unit || '',
                    initialQuantity: initial.quantity || 0,
                    finalQuantity: final.quantity || 0,
                    transfersIn: transfer.transfersIn || 0,
                    transfersToUsed: transfer.transfersToUsed || 0,
                    transfersToTrash: transfer.transfersToTrash || 0,
                    price: initial.price || final.price || 0,
                    consumption: Math.max(0, 
                        (initial.quantity || 0) + 
                        (transfer.transfersIn || 0) - 
                        (final.quantity || 0) - 
                        (transfer.transfersToUsed || 0) - 
                        (transfer.transfersToTrash || 0))
                };
            });

            departmentSummaries[deptName] = {
                name: deptName,
                initialStock,
                finalStock,
                transfers,
                totalStockEntries,
                products: productsSummary,
                summary: {
                    totalInitialValue: Object.values(initialStock).reduce((sum, p) => sum + p.value, 0),
                    totalFinalValue: Object.values(finalStock).reduce((sum, p) => sum + p.value, 0),
                    totalTransfersIn: transfers.transfersIn,
                    totalTransfersToUsed: transfers.transfersToUsed,
                    totalTransfersToTrash: transfers.transfersToTrash,
                    totalAvailable: Object.values(totalStockEntries).reduce((sum, p) => sum + p.value, 0)
                }
            };
        });

        // 5. Send response
        res.status(200).json({
            success: true,
            departmentSummaries,
            period: {
                start: startDate,
                end: effectiveEndDate,
                days: Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1
            },
            totals: {
                initialValue: Object.values(departmentSummaries)
                    .reduce((sum, dept) => sum + dept.summary.totalInitialValue, 0),
                finalValue: Object.values(departmentSummaries)
                    .reduce((sum, dept) => sum + dept.summary.totalFinalValue, 0),
                transfersIn: Object.values(departmentSummaries)
                    .reduce((sum, dept) => sum + dept.summary.totalTransfersIn, 0),
                transfersToUsed: Object.values(departmentSummaries)
                    .reduce((sum, dept) => sum + dept.summary.totalTransfersToUsed, 0),
                transfersToTrash: Object.values(departmentSummaries)
                    .reduce((sum, dept) => sum + dept.summary.totalTransfersToTrash, 0)
            }
        });

    } catch (error) {
        console.error("Error fetching department transfers:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching department transfers",
            error: error.message
        });
    }
};