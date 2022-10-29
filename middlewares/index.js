const { verifySignature } = require("@taquito/utils");

const requireSignature = async (request, response, next) => {
  const { signature, userAddress, publicKey, payloadBytes } = request.body;

  if (!signature || !userAddress || !publicKey) {
    response.status(500).send("Invalid Signature Payload");
    return;
  }

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
