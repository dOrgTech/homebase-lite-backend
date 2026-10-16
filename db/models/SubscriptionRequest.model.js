const mongoose = require('mongoose');

const Schema = mongoose.Schema;

/**
 * One row per subscription request that caused an email to be sent. Rows
 * expire after an hour; counting them gives a throttle that holds across
 * serverless instances and cold starts.
 */
const SubscriptionRequestSchema = new Schema({
  key: {
    type: String,
    required: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60,
  },
});

const SubscriptionRequestModel = mongoose.model(
  'SubscriptionRequest',
  SubscriptionRequestSchema,
  'SubscriptionRequests'
);

module.exports = SubscriptionRequestModel;
