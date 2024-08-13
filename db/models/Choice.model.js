const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const WalletAddressSchema = new Schema({
  address: {
    type: String,
    required: true,
  },
  balanceAtReferenceBlock: {
    type: String,
    required: true,
  },
});

const ChoiceSchema = new Schema({
  name: {
    type: String,
    default: '',
  },
  pollID: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  walletAddresses: [WalletAddressSchema],
});


const ChoiceModel = mongoose.model('Choice', ChoiceSchema,'Choices');
module.exports = ChoiceModel;