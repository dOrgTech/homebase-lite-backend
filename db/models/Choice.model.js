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
  // Which choice this entry was cast for (redundant with the parent choice,
  // kept so a vote record is self-describing).
  choiceId: {
    type: String,
  },
  // The signed message and its signature, kept so a vote can be audited and
  // so replays and out-of-order resubmissions can be rejected.
  payloadBytes: {
    type: String,
  },
  payloadBytesHash: {
    type: String,
  },
  signature: {
    type: String,
  },
  votedAt: {
    type: Date,
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