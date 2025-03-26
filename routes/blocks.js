const express = require("express");
const {catchAsync} = require("../services/response.util");
const { getEthCurrentBlock, getEthBlockTimeDifference } = require("../utils-eth");

const blocksRoutes = express.Router();

blocksRoutes.get("/blocks", catchAsync(async (req, res) => {
  const { network } = req.query;
  if(!network) {
    throw new Error("Network is required");
  }
  const block = await getEthCurrentBlock(network);
  res.json({ block });
}));

blocksRoutes.get("/blocks/stats", catchAsync(async (req, res) => {
  const { network } = req.query;
  if(!network) {
    throw new Error("Network is required");
  }
  const data = await getEthBlockTimeDifference(network);
  res.json(data);
}));

module.exports = blocksRoutes;