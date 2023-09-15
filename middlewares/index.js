const { verifySignature, bytes2Char } = require("@taquito/utils");

const requireSignature = async (request, response, next) => {
  try {
    const { signature, publicKey, payloadBytes } = request.body;
    if (!signature || !publicKey || !payloadBytes) {
      console.log("Invalid Signature Payload");
      response.status(500).send("Invalid Signature Payload");
      return;
    }

    const isVerified = verifySignature(payloadBytes, publicKey, signature);
    if (isVerified) {
      next();
    } else {
      console.log("Invalid Signature/Account");
      response.status(400).send("Invalid Signature/Account");
    }
  } catch (error) {
    console.log(error);
    response.status(400).send("Could not verify signature");
  }
};

module.exports = {
  requireSignature,
};
