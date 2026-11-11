const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const adminSchema = new Schema({
  removed: {
    type: Boolean,
    default: false,
  },
  enabled: {
    type: Boolean,
    default: false,
  },

  email: {
    type: String,
    lowercase: true,
    trim: true,
    required: true,
    unique: true,
  },
  name: { type: String, required: true },
  surname: { type: String },
  photo: {
    type: String,
    trim: true,
  },
  created: {
    type: Date,
    default: Date.now,
  },
    role: {
    type: String,
    default: 'member',
    enum: ['owner', 'member'],
  },

  businessRoles: {
    type: [{
      type: String,
      enum: [
        'sales',
        'project_manager',
        'expert',
        'project_team',
        'expense_approver',
        'management',
        'finance',
      ],
    }],
    default: [],
  },
});

module.exports = mongoose.model('Admin', adminSchema);
