const { verifySignature, bytes2Char } = require("@taquito/utils");
const { verityEthSignture } = require("../utils-eth");

function splitAtBrace(inputString) {
  const braceIndex = inputString.indexOf('{');
  
  if (braceIndex === -1) {
    // If '{' is not found, return the original string and an empty string
    return [inputString, ''];
  }
  
  // Split the string at the brace position
  const firstPart = inputString.slice(0, braceIndex);
  const secondPart = inputString.slice(braceIndex);
  
  return [firstPart, secondPart];
}

const requireSignature = async (request, response, next) => {
  try {
    const { signature, publicKey, payloadBytes } = request.body;
    const network = request.body.network
    if(network?.startsWith("etherlink")){
      const payloadBytes = request.body.payloadBytes
      const isVerified = verityEthSignture(signature, payloadBytes)
      if(isVerified){
        try{
        const [firstPart, secondPart] = splitAtBrace(payloadBytes)
        const jsonString = secondPart
        console.log({jsonString, secondPart})
        const payloadObj = JSON.parse(jsonString)
        request.payloadObj = payloadObj

        return next()
        }catch(error){
          console.log(error)
          response.status(400).send("Invalid Eth Signature/Account")
        }
      }else{
        response.status(400).send("Invalid Eth Signature/Account")
      }
    }
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
