const User = require('../models/User');
const { signToken } = require('../middleware/auth');

// Register user
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all fields' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password
    });

    const token = signToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        color: user.color,
        avatar: user.avatar
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = signToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        color: user.color,
        avatar: user.avatar
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 1-Click Guest / Recruiter Demo Login
exports.guestLogin = async (req, res) => {
  try {
    const demoNames = [
      'Sarah Connor', 'Alex Chen', 'Elena Rostova', 'Marcus Vance',
      'Jordan Lee', 'Maya Patel', 'Devon Miller', 'Aria Stark'
    ];
    const chosenName = req.body.name || demoNames[Math.floor(Math.random() * demoNames.length)];
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const guestEmail = `guest_${randomSuffix}@demo.internal`;
    const tempPassword = `guestPass_${randomSuffix}`;

    const user = await User.create({
      name: chosenName,
      email: guestEmail,
      password: tempPassword,
      isGuest: true
    });

    const token = signToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        color: user.color,
        avatar: user.avatar,
        isGuest: true
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get current logged-in user
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        color: user.color,
        avatar: user.avatar,
        isGuest: user.isGuest
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Search users for collaborator sharing dialog
exports.searchUsers = async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query || query.length < 2) {
      return res.json({ success: true, users: [] });
    }

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).select('name email avatar color').limit(10);

    res.json({
      success: true,
      users: users.map(u => ({
        id: u._id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        color: u.color
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
