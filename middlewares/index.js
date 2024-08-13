const { verifySignature, bytes2Char } = require("@taquito/utils");
const { verityEthSignture } = require("../utils-eth");

function splitAtBrace(inputString) {
  const squareBracketIndex = inputString.indexOf('[');
  const braceIndex = inputString.indexOf('{');
  
   // Find the minimum between square bracket and brace indices, but > 0
   let minIndex = -1;
   if (squareBracketIndex > 0 && braceIndex > 0) {
     minIndex = Math.min(squareBracketIndex, braceIndex);
   } else if (squareBracketIndex > 0) {
     minIndex = squareBracketIndex;
   } else if (braceIndex > 0) {
     minIndex = braceIndex;
   }
  
   
  if (minIndex === -1) {
    // If '{' is not found, return the original string and an empty string
    return [inputString, ''];
  }

 
  // Split the string at the brace position
  const firstPart = inputString.slice(0, minIndex);
  const secondPart = inputString.slice(minIndex);
  
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
        const [_, secondPart] = splitAtBrace(payloadBytes)
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
