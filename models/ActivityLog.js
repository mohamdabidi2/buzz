const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ['User', 'Produit', 'Recipe', 'Department', 'Stock', 'DailyCalculation']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  changes: {
    type: mongoose.Schema.Types.Mixed
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;