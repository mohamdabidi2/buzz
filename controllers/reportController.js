const Report = require("../models/Report");

// @desc Create a new report
// @route POST /api/reports
// @access Worker only
exports.createReport = async (req, res) => {
  try {
    const { title, date, status, description } = req.body;

    const newReport = new Report({
      title,
      date,
      status,
      description,
      user: req.user.id, // Get user from JWT
    });

    await newReport.save();
    res.status(201).json({ success: true, data: newReport });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

// @desc Get all reports (Admin only)
// @route GET /api/reports
// @access Admin only
exports.getReports = async (req, res) => {
  try {
    const reports = await Report.find().populate("user", "name email");
    res.status(200).json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

// @desc Get a single report
// @route GET /api/reports/:id
// @access Admin only
exports.getReportById = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).populate("user", "name email");

    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    res.status(200).json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
};

// @desc Delete a report (Admin only)
// @route DELETE /api/reports/:id
// @access Admin only
exports.deleteReport = async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);

    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    res.status(200).json({ success: true, message: "Report deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
};
