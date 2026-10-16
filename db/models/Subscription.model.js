const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const SubscriptionModelSchema = new Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  daoAddress: {
    type: String,
    required: true,
  },
  network: {
    type: String,
    required: true,
  },
  confirmed: {
    type: Boolean,
    default: false,
  },
  confirmToken: {
    type: String,
    index: true,
    sparse: true,
  },
  unsubscribeToken: {
    type: String,
    index: true,
    sparse: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  confirmedAt: {
    type: Date,
    default: null,
  },
});

// One subscription per (email, DAO, network) triple.
SubscriptionModelSchema.index(
  { email: 1, daoAddress: 1, network: 1 },
  { unique: true }
);

// A request that is never confirmed is forgotten after a week, so the
// collection does not keep addresses that were submitted by someone else.
SubscriptionModelSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { confirmed: false } }
);

const SubscriptionModel = mongoose.model(
  'Subscription',
  SubscriptionModelSchema,
  'Subscriptions'
);

module.exports = SubscriptionModel;
