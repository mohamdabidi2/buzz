const ActivityLog = require('../models/ActivityLog');

exports.getActivityLogs = async (req, res) => {
  try {
    const { entityType, entityId, action, startDate, endDate } = req.query;
    
    const query = {};
    
    if (entityType) query.entityType = entityType;
    if (entityId) query.entityId = entityId;
    if (action) query.action = action;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const logs = await ActivityLog.find(query)
      .populate('user')
      .sort({ createdAt: -1 });
      
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEntityActivity = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const logs = await ActivityLog.find({ 
      entityType, 
      entityId 
    })
    .populate('user')
    .sort({ createdAt: -1 });
    
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};