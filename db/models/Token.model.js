const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const TokenModelSchema = new Schema({
    tokenAddress: {
        type: String,
        required: true,
    },
    tokenType: {
        type: String,
        required: true,
    },
    symbol: {
        type: String,
        required: true,
    },
    tokenID: {
        type: Number
    },
    daoID: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    decimals: {
        type: String,
        required: true,
    },
},{
    timestamps: true,
});

const TokenModel = mongoose.model('Token', TokenModelSchema,'Tokens');

module.exports = TokenModel;