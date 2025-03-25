const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const PollModelSchema = new Schema({
  description: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  daoID: {
    type: String,
    required: true,
  },
  endTime: {
    type: String,
    required: true,
  },
  startTime: {
    type: String,
    required: true,
  },
  referenceBlock: {
    type: String,
    required: true,
  },
  choices: [{
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Choice',
  }],
  totalSupplyAtReferenceBlock: {
    type: String,
    required: true,
  },
  externalLink: {
    type: String,
    default: '',
  },
  author: {
    type: String,
    required: true,
  },
  // 0 - Single Choice, 1 - Multi Choice
  votingStrategy: {
    type: Number,
    required: true,
  },
  isXTZ: {
    type: Boolean,
    default: false,
  },
  payloadBytes:{
    type: String,
  },
  payloadBytesHash:{
    type: String,
    index: true, 
    sparse: true,
  }
},{
    timestamps: true,
});

const PollModel = mongoose.model('Poll', PollModelSchema,'Polls');
module.exports = PollModel;