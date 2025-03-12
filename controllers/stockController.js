const Stock = require('../models/stock');
const Produit = require('../models/product');
const Department = require('../models/Department');

// Add stock
exports.addStock = async (req, res) => {
  try {
    const { product_name, quantity, department } = req.body;

    // 1. Find product by name
    const produit = await Produit.findOne({ product_name });
    if (!produit) {
      return res.status(404).json({ message: "Produit not found" });
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
      existingStock.quantity += quantity;
      await existingStock.save();
      return res.status(200).json({ message: "Stock updated", stock: existingStock });
    } else {
      // 5. Create new stock entry
      const newStock = new Stock({
        produit: produit._id,
        department: departmentDoc._id,
        quantity,
      });
      await newStock.save();
      return res.status(201).json({ message: "Stock added", stock: newStock });
    }

  } catch (error) {
    console.error("Add stock error:", error);
    res.status(400).json({ message: error.message });
  }
};


// Get all stocks
exports.getAllStocks = async (req, res) => {
  try {
    const stocks = await Stock.find().populate('produit department');

    const formattedStocks = stocks.map(stock => ({
      stock_id: stock._id,
      produit_id: stock.produit._id,
      product_name: stock.produit.product_name,
      unit: stock.produit.unit,
      department_id: stock.department._id,
      department_name: stock.department.name,
      quantity: stock.quantity,
    }));

    res.status(200).json(formattedStocks);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


// Transfer stock
exports.transferStock = async (req, res) => {
  try {
    const { from_department, to_department, product_name, quantity } = req.body;
console.log(req.body)
    // Fetch the department IDs from the database
    const fromDepartmentData = await Department.findOne({ name: from_department });
    const toDepartmentData = await Department.findOne({ name: to_department });

    // Fetch the product ID from the database
    const productData = await Produit.findOne({ product_name });
console.log(productData,toDepartmentData,fromDepartmentData)
    // Check if the departments and product exist
    if (!fromDepartmentData || !toDepartmentData || !productData) {
      return res.status(400).json({ message: "Invalid department or product name" });
    }

    // Extract the department IDs and product ID
    const fromDepartmentId = fromDepartmentData._id;
    const toDepartmentId = toDepartmentData._id;
    const produitId = productData._id;

    // Log the transferred data for debugging
    console.log({
      fromDepartmentId,
      toDepartmentId,
      produitId,
      quantity,
    });

    // Decrease quantity from the source department
    const fromStock = await Stock.findOne({ produit: produitId, department: fromDepartmentId });
    if (!fromStock || fromStock.quantity < quantity) {
      return res.status(400).json({ message: "Not enough stock in the source department" });
    }

    fromStock.quantity -= quantity;
    await fromStock.save();

    // Increase quantity in the destination department
    const toStock = await Stock.findOne({ produit: produitId, department: toDepartmentId });
    if (toStock) {
      toStock.quantity += quantity;
      await toStock.save();
    } else {
      const newStock = new Stock({ produit: produitId, department: toDepartmentId, quantity });
      await newStock.save();
    }

    res.status(200).json({ message: "Stock transferred successfully" });
  } catch (error) {
    console.error(error); // Log the error for debugging
    res.status(400).json({ message: error.message });
  }
 
};
exports.getStocksByDepartment = async (req, res) => {
  try {
    const { department } = req.params;

    // 1. Find department by name
    const departmentDoc = await Department.findOne({ name: department });
    if (!departmentDoc) {
      return res.status(404).json({ message: "Department not found" });
    }

    // 2. Fetch stocks for this department
    const stocks = await Stock.find({ department: departmentDoc._id }).populate('produit department');

    const formattedStocks = stocks.map(stock => ({
      stock_id: stock._id,
      produit_id: stock.produit._id,
      product_name: stock.produit.product_name,
      unit: stock.produit.unit,
      department_id: stock.department._id,
      department_name: stock.department.name,
      quantity: stock.quantity,
    }));

    res.status(200).json(formattedStocks);
  } catch (error) {
    console.error("Error fetching stocks by department:", error);
    res.status(400).json({ message: error.message });
  }
};