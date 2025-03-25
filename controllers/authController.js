const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ name, email, password: hashedPassword, role });
  await user.save();
  res.json({ message: "User registered" });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  console.log(req.body)
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "Invalid credentials" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

  const token = jwt.sign({ id: user._id, role: user.role,department:user.department }, process.env.JWT_SECRET, { expiresIn: "1d" });
  res.json({ token,_id: user._id, role: user.role,department:user.department});
};

exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
};
