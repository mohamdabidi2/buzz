const DailyCalculation = require('../models/DailyCalculation');
const Recipe = require('../models/Recipe');
const Produit = require('../models/product');

// Save or update daily calculations
exports.saveDailyCalculations = async (req, res) => {
  try {
    const { date, calculations } = req.body;
    
    if (!date || !Array.isArray(calculations)) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    // Get recipes with populated products
    const recipeIds = calculations.map(c => c.recipe);
    const recipes = await Recipe.find({ _id: { $in: recipeIds } }).populate('products.productId');

    // Calculate ingredient requirements
    const ingredientMap = new Map();
    let totalCost = 0;

    calculations.forEach(calc => {
      const recipe = recipes.find(r => r._id.equals(calc.recipe));
      if (!recipe) return;

      totalCost += recipe.totalCost * calc.quantity;

      recipe.products.forEach(product => {
        const productId = product.productId._id.toString();
        const key = `${productId}_${product.unit}`;
        
        if (!ingredientMap.has(key)) {
          ingredientMap.set(key, {
            product: product.productId._id,
            name: product.productName,
            unit: product.unit,
            requiredQuantity: 0,
            totalPrice: 0
          });
        }

        const entry = ingredientMap.get(key);
        entry.requiredQuantity += product.quantity * calc.quantity;
        entry.totalPrice += product.price * product.quantity * calc.quantity;
      });
    });

    const ingredientRequirements = Array.from(ingredientMap.values());

    // Create or update daily calculation
    const calculationDate = new Date(date);
    calculationDate.setHours(0, 0, 0, 0);

    const dailyCalculation = await DailyCalculation.findOneAndUpdate(
      { date: calculationDate },
      {
        date: calculationDate,
        calculations,
        ingredientRequirements,
        totalCost
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('calculations.recipe');

    res.status(200).json(dailyCalculation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get calculations for a specific date
exports.getDailyCalculations = async (req, res) => {
  try {
    const { date } = req.params;
    const calculationDate = new Date(date);
    calculationDate.setHours(0, 0, 0, 0);

    const dailyCalculation = await DailyCalculation.findOne({ date: calculationDate })
      .populate('calculations.recipe')
      .populate('ingredientRequirements.product');

    if (!dailyCalculation) {
      return res.status(404).json({ message: 'No calculations found for this date' });
    }

    res.status(200).json(dailyCalculation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get calculations for a date range
exports.getCalculationsByRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const calculations = await DailyCalculation.find({
      date: { $gte: start, $lte: end }
    }).sort({ date: 1 });

    res.status(200).json(calculations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};