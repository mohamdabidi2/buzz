const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');

// Import controller methods directly
const { 
  register, 
  login, 
  getMe 
} = require('../controllers/authController');

const { 
    compareIngredientUsage
  } = require('../controllers/reportController');
const { 
  getAllUsers, 
  createUser, 
  deleteUser ,
  updateUser
} = require('../controllers/userController');

const { 
  addProduit, 
  getAllProduits, 
  getProduitById, 
  updateProduit, 
  deleteProduit 
} = require('../controllers/produitController');

const { 
  getRecipes, 
  searchRecipes, 
  getRecipeById, 
  createRecipe, 
  updateRecipe, 
  deleteRecipe, 
  calculateTotal 
} = require('../controllers/recipeController');

const { 
  addDepartment, 
  getAllDepartments, 
  getDepartmentById, 
  updateDepartment, 
  deleteDepartment 
} = require('../controllers/departmentController');

const { 
  addStock, 
  getAllStocks, 
  transferStock, 
  getStocksByDepartment ,
  getLowStockItems,
  getTotalStockValue,
  transferToTrash,
  transferToUsedDepartment
} = require('../controllers/stockController');

const { 
  saveDailyCalculations, 
  getDailyCalculations, 
  getCalculationsByRange 
} = require('../controllers/dailyCalculationController');

const { 
  getStockMovements, 
  getProductMovementHistory ,
  getDepartmentTransfers
} = require('../controllers/stockMovementController');

const { 
  getActivityLogs, 
  getEntityActivity 
} = require('../controllers/activityLogController');

// Auth Routes
router.post("/auth/register", register);
router.post("/auth/login", login);
router.get("/auth/me", authMiddleware, getMe);

// User Routes
router.get("/users", getAllUsers);
router.post("/users", createUser);
router.delete("/users/:id", deleteUser);
router.put("/users/:id", updateUser);

// Product Routes
router.post("/produits/add",authMiddleware, addProduit);
router.get("/produits", getAllProduits);
router.get("/produits/:id", getProduitById);
router.put("/produits/:id",authMiddleware, updateProduit);
router.delete("/produits/:id",authMiddleware, deleteProduit);

// Recipe Routes
router.get("/recipes", getRecipes);
router.get("/recipes/search", searchRecipes);
router.get("/recipes/:id", getRecipeById);
router.post("/recipes", authMiddleware, createRecipe);
router.put("/recipes/:id", authMiddleware, updateRecipe);
router.delete("/recipes/:id", authMiddleware, deleteRecipe);
router.post("/recipes/calculate", authMiddleware, calculateTotal);

// Department Routes
router.post("/departments", addDepartment);
router.get("/departments", getAllDepartments);
router.get("/departments/:id", getDepartmentById);
router.put("/departments/:id", updateDepartment);
router.delete("/departments/:id", deleteDepartment);

// Stock Routes
router.post("/stocks/add",authMiddleware, addStock);
router.get("/stocks", getAllStocks);
router.get("/stocks/low", getLowStockItems);
router.post('/stocks/transfer-to-used',authMiddleware, transferToUsedDepartment);
router.post("/stocks/transfer",authMiddleware,  transferStock);
router.get("/stocks/department/:department",authMiddleware,  getStocksByDepartment);
router.post('/stocks/transfer-to-trash',authMiddleware,transferToTrash);
router.get("/stocks/total-value",authMiddleware,  getTotalStockValue);

// Daily Calculation Routes
router.post("/calcule", saveDailyCalculations);
router.get("/calcule/:date", getDailyCalculations);
router.get("/calcule/range/:startDate/:endDate", getCalculationsByRange);

// Logs Routes
router.get("/logs/stock-movements", authMiddleware, getStockMovements);
router.get("/logs/products/:id/movements", authMiddleware, getProductMovementHistory);
router.get("/logs/activity-logs", authMiddleware, getActivityLogs);
router.get("/logs/activity/:entityType/:entityId", authMiddleware, getEntityActivity);
// Add this to your apiRoutes.js
router.get("/logs/department-transfers", authMiddleware, getDepartmentTransfers);
//Report Routes
router.get("/reports/ingredient-comparison", authMiddleware, compareIngredientUsage);


module.exports = router;