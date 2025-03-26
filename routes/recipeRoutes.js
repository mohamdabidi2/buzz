const express = require('express');
const router = express.Router();
const recipeController = require('../controllers/recipeController');
const authMiddleware = require('../middleware/authMiddleware');



// Public routes
router.get('/', recipeController.getRecipes);
router.get('/search', recipeController.searchRecipes);
router.get('/:id', recipeController.getRecipeById);
router.use(authMiddleware.protect);

router.post('/', 

  recipeController.createRecipe
);

router.put('/:id', 

  recipeController.updateRecipe
);

router.delete('/:id', 

  recipeController.deleteRecipe
);

// Calculation endpoint with rate limiting and validation
router.post('/calculate', 
  recipeController.calculateTotal
);

module.exports = router;