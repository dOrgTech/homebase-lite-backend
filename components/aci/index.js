const { catchAsync } = require("../../services/response.util");
const { getContractEndpoints } = require("../../services/aci.service");

const getContractEndpointsController = catchAsync(async(req, response) => {
    const {network} = req.body;
    const contractId = req.params.contract_id;
    if(!contractId) throw new Error("Contract ID is required");
    
    let [endpoints, error] = await getContractEndpoints(network, contractId)
    if(error) throw new Error(error)

    if(endpoints){
        endpoints = {
            ...endpoints,
            operations: endpoints.children.map(x => x.name)
        }
    }

    return response.json(endpoints);
}) 

module.exports = {
    getContractEndpointsController
}