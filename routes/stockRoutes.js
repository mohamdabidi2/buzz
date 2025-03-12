const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');

router.post('/add', stockController.addStock);
router.get('/', stockController.getAllStocks);
router.post('/transfer', stockController.transferStock);
router.get('/department/:department', stockController.getStocksByDepartment); // Added this route

module.exports = router;
