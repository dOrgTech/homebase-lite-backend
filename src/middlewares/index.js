const { char2Bytes, verifySignature } = require("@taquito/utils");

const requireSignature = async (request, response, next) => {
  const { signature, userAddress, publicKey } = request.body;

  if (!signature || !userAddress || !publicKey) {
    response.status(500).send("Invalid Signature Payload");
    return;
  }

  const formattedInput = [
    "Tezos Signed Message:",
    // "http://localhost:3000",
    // new Date().toISOString(),
    `Tezos Homebase Lite - I am ${userAddress}`,
  ].join(" ");

  const bytes = char2Bytes(formattedInput);
  const payloadBytes =
    "05" + "0100" + char2Bytes(bytes.length.toString()) + bytes;

  const isVerified = verifySignature(payloadBytes, publicKey, signature);
  console.log("isVerified: ", isVerified);
  if (isVerified) {
    next();
  } else {
    response.status(400).send("Invalid Signature/Account");
  }
};

module.exports = {
  requireSignature,
};
