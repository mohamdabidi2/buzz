const express = require('express');
const { createRecipe, getRecipes, calculateTotal } = require('../controllers/recipeController');

const router = express.Router();

router.post('/', createRecipe);
router.get('/', getRecipes);
router.post('/calculate', calculateTotal);

module.exports = router;
