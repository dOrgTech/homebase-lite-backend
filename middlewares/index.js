const { verifySignature, bytes2Char } = require("@taquito/utils");
const { verityEthSignture } = require("../utils-eth");
const securePayload = require("./secure-payload");

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
    const network = request.body.network;
    const reqId = request.id || "no-reqid";
    console.log("[requireSignature:start]", {
      reqId,
      path: request.originalUrl,
      method: request.method,
      network,
      hasSignature: Boolean(signature),
      hasPublicKey: Boolean(publicKey),
      hasPayloadBytes: Boolean(payloadBytes),
    });
    if(network?.startsWith("etherlink")){
      const payloadBytes = request.body.payloadBytes
      const isVerified = verityEthSignture(signature, payloadBytes)
      if(isVerified){
        try{
        const [_, secondPart] = splitAtBrace(payloadBytes)
        const jsonString = secondPart
        console.log("[requireSignature:eth:payload-parsed]", { reqId, length: jsonString?.length })
        const payloadObj = JSON.parse(jsonString)
        request.payloadObj = payloadObj

        return next()
        }catch(error){
          console.error("[requireSignature:eth:parse-error]", { reqId, error: error?.message })
          response.status(400).send("Invalid Eth Signature/Account")
        }
      }else{
        console.warn("[requireSignature:eth:invalid]", { reqId })
        response.status(400).send("Invalid Eth Signature/Account")
      }
    }
    if (!signature || !publicKey || !payloadBytes) {
      console.warn("[requireSignature:invalid-payload]", { reqId })
      response.status(500).send("Invalid Signature Payload");
      return;
    }

    let isVerified = false;
    try {
      isVerified = verifySignature(payloadBytes, publicKey, signature);
    } catch (e) {
      console.error("[requireSignature:verify-throw]", { reqId, error: e?.message });
      return response.status(400).send("Could not verify signature");
    }
    if (isVerified) {
      console.log("[requireSignature:ok]", { reqId });
      next();
    } else {
      console.warn("[requireSignature:invalid]", { reqId });
      response.status(400).send("Invalid Signature/Account");
    }
  } catch (error) {
    console.error("[requireSignature:catch]", { error: error?.message });
    response.status(400).send("Could not verify signature");
  }
};

module.exports = {
  requireSignature,
  securePayload,
};
