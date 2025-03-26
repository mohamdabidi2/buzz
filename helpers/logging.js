const ActivityLog = require('../models/ActivityLog');
const StockMovement = require('../models/StockMovement');

// Log activity helper
exports.logActivity = async (action, entityType, entityId, changes, userId) => {
  try {
    await ActivityLog.create({
      action,
      entityType,
      entityId,
      changes,
      user: userId
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

// Log stock movement helper
exports.logStockMovement = async (movementData) => {
  try {
    await StockMovement.create(movementData);
  } catch (error) {
    console.error('Error logging stock movement:', error);
  }
};