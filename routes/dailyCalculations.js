const express = require('express');
const router = express.Router();
const dailyCalculationController = require('../controllers/dailyCalculationController');

// Save/update daily calculations
router.post('/', dailyCalculationController.saveDailyCalculations);

// Get calculations for specific date
router.get('/:date', dailyCalculationController.getDailyCalculations);

// Get calculations for date range
router.get('/range/:startDate/:endDate', dailyCalculationController.getCalculationsByRange);

module.exports = router;