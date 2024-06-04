const express = require("express");
const { getContractEndpointsController } = require("../components/aci");

/**
 * TEST Contracts
 * 
 * KT1MzN5jLkbbq9P6WEFmTffUrYtK8niZavzH
 * KT1VG3ynsnyxFGzw9mdBwYnyZAF8HZvqnNkw
 * 
 */

const aciRoutes = express.Router();

/**
 * @swagger
 * /aci/{contract_id}:
 *   post:
 *     summary: Get contract endpoints
 *     tags: [ACI]
 *     parameters:
 *       - in: path
 *         name: contract_id
 *         required: true
 *         description: The ID of the contract
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               network:
 *                type: string
 *     responses:
 *       200:
 *         description: Contract ACI Endpoints
 */
aciRoutes.post('/aci/:contract_id', getContractEndpointsController)

module.exports = aciRoutes;