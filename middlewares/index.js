const { verifySignature } = require("@taquito/utils");

const requireSignature = async (request, response, next) => {
  const { signature, publicKey, payloadBytes } = request.body;

  if (!signature || !publicKey || !payloadBytes) {
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
