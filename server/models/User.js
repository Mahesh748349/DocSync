const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const USER_COLORS = [
  '#2563eb', // Blue
  '#7c3aed', // Purple
  '#db2777', // Pink
  '#dc2626', // Red
  '#ea580c', // Orange
  '#d97706', // Amber
  '#059669', // Emerald
  '#0891b2', // Cyan
  '#4f46e5', // Indigo
  '#0d9488'  // Teal
];

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6
  },
  avatar: {
    type: String,
    default: ''
  },
  color: {
    type: String,
    default: () => USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
  },
  isGuest: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
