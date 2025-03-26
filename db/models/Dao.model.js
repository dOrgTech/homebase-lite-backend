const mongoose = require('mongoose');
const cachingPlugin = require('../plugins/cache.plugin');

const Schema = mongoose.Schema;

const PollSchema = new Schema({
  oid: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Poll",
    required: true,
  },
});

const DaoModelSchema = new Schema({
  type:{
    type: String,
    enum:["onchain","lite"],
    default: "lite",
  },
  address:{
    type: String,
    index: true,
    sparse: true
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  // Contract Address of deployed DAO
  daoContract:{
    type:String,
  },
  linkToTerms: {
    type: String,
    default: '',
  },
  picUri: {
    type: String,
    default: '',
  },
  members: [{
    type: String,
    required: true,
  }],
  polls: [PollSchema],
  tokenAddress: {
    type: String,
    required: true,
  },
  tokenType: {
    type: String,
    required: true,
  },
  requiredTokenOwnership: {
    type: Boolean,
    default: true,
  },
  allowPublicAccess: {
    type: Boolean,
    default: true,
  },
  network: {
    type: String,
    required: true,
  },
  votingAddressesCount: {
    type: Number,
    required: true,
  },
},{
  timestamps: true
});



// DaoModelSchema.plugin(cachingPlugin('dao'));

const DaoModel = mongoose.model('DAO', DaoModelSchema,'DAOs');

module.exports = DaoModel;