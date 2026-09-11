const mongoose = require('mongoose');

const collaboratorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['owner', 'editor', 'viewer'],
    default: 'editor'
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const revisionItemSchema = new mongoose.Schema({
  version: {
    type: Number,
    required: true
  },
  op: {
    type: Array,
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  authorName: {
    type: String,
    default: 'Anonymous'
  },
  authorColor: {
    type: String,
    default: '#2563eb'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    default: 'Untitled Document',
    trim: true
  },
  // Content stored as an array of Quill Delta operations (e.g. [{ insert: 'Hello world\n' }])
  content: {
    type: Array,
    default: () => [{ insert: '\n' }]
  },
  version: {
    type: Number,
    default: 0
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collaborators: [collaboratorSchema],
  isPublic: {
    type: Boolean,
    default: false
  },
  publicRole: {
    type: String,
    enum: ['viewer', 'editor'],
    default: 'viewer'
  },
  // We keep a rolling revision history for OT transformation and version inspection
  revisionLog: {
    type: [revisionItemSchema],
    default: []
  },
  lastSavedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for fast collaborator and owner lookups
documentSchema.index({ owner: 1 });
documentSchema.index({ 'collaborators.user': 1 });

module.exports = mongoose.model('Document', documentSchema);
