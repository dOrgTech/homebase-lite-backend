/**
 * Vote integrity: the rules that decide whether a signed vote counts.
 * Runs the real handler against an in-memory MongoDB; only the chain
 * balance lookups and the Tezos payload decoding are stubbed.
 */
jest.setTimeout(120000);

jest.mock("../../../utils-eth", () => ({
  ...jest.requireActual("../../../utils-eth"),
  getEthUserBalanceAtLevel: jest.fn(),
}));
jest.mock("../../../utils", () => ({
  ...jest.requireActual("../../../utils"),
  getUserTotalVotingPowerAtReferenceBlock: jest.fn(),
  getInputFromSigPayload: jest.fn(),
  getTimestampFromPayloadBytes: jest.fn(),
}));

const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { BigNumber } = require("bignumber.js");
const { getPkhfromPk } = require("@taquito/utils");
const utilsEth = require("../../../utils-eth");
const utils = require("../../../utils");
const DAOModel = require("../../../db/models/Dao.model");
const PollModel = require("../../../db/models/Poll.model");
const ChoiceModel = require("../../../db/models/Choice.model");
const TokenModel = require("../../../db/models/Token.model");
const { updateChoiceById } = require("../../../components/choices");

let replSet;

const call = (body, extra = {}) =>
  new Promise((resolve) => {
    const req = { body, ...extra };
    updateChoiceById(req, {
      json: (payload) => resolve({ status: 200, payload }),
      status: (code) => ({ send: (payload) => resolve({ status: code, payload }) }),
    });
  });

const entries = async (choiceId) => (await ChoiceModel.findById(choiceId).lean()).walletAddresses;

async function makePoll(dao, { endTime = Date.now() + 1e7, votingStrategy = 0 } = {}) {
  const poll = await PollModel.create({
    name: "p",
    description: "d",
    daoID: String(dao._id),
    endTime: String(endTime),
    startTime: "0",
    referenceBlock: "5",
    totalSupplyAtReferenceBlock: "1",
    author: "x",
    votingStrategy,
  });
  const choices = await ChoiceModel.insertMany([
    { name: "yes", pollID: poll._id, walletAddresses: [] },
    { name: "no", pollID: poll._id, walletAddresses: [] },
  ]);
  return { poll, choices };
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

describe("Etherlink votes", () => {
  const addr = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const upper = "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD";
  let dao, open, ended, multi;

  const message = (choices, when) =>
    ["Tezos Signed Message:", "https://tezos-homebase.io", new Date(when).toISOString(), JSON.stringify(choices)].join(" ");

  const vote = (choiceObjs, when, { address = addr } = {}) => {
    const choices = choiceObjs.map((c) => ({ address, pollID: String(c.pollID), choiceId: String(c._id) }));
    return call(
      { network: "etherlink_mainnet", payloadBytes: message(choices, when), signature: "sig", publicKey: address },
      { payloadObj: choices, verifiedAddress: address.toLowerCase() }
    );
  };

  beforeAll(async () => {
    utilsEth.getEthUserBalanceAtLevel.mockImplementation(async () => new BigNumber(1000));
    dao = await DAOModel.create({
      name: "d", tokenAddress: "0xT", tokenType: "ERC20", network: "etherlink_mainnet",
      votingAddressesCount: 0, members: [addr],
    });
    await TokenModel.create({ tokenAddress: "0xT", tokenType: "ERC20", daoID: dao._id, decimals: "18" });
    open = await makePoll(dao);
    ended = await makePoll(dao, { endTime: Date.now() - 1e7 });
    multi = await makePoll(dao, { votingStrategy: 1 });
  });

  it("records a first vote with its signed payload", async () => {
    const res = await vote([open.choices[0]], 1000);
    expect(res.status).toBe(200);
    const stored = await entries(open.choices[0]._id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ address: addr, balanceAtReferenceBlock: "1000", choiceId: String(open.choices[0]._id), signature: "sig" });
    expect(stored[0].payloadBytes).toContain("Tezos Signed Message:");
  });

  it("rejects the same signed vote sent again", async () => {
    const res = await vote([open.choices[0]], 1000);
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/already been recorded/);
    expect(await entries(open.choices[0]._id)).toHaveLength(1);
  });

  it("moves the vote when a newer one is cast, keeping one entry per voter", async () => {
    const res = await vote([open.choices[1]], 2000);
    expect(res.status).toBe(200);
    expect(await entries(open.choices[0]._id)).toHaveLength(0);
    expect(await entries(open.choices[1]._id)).toHaveLength(1);
  });

  it("rejects an older signed vote replayed after a newer one", async () => {
    const res = await vote([open.choices[0]], 1500);
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/newer vote/);
    expect(await entries(open.choices[0]._id)).toHaveLength(0);
    expect(await entries(open.choices[1]._id)).toHaveLength(1);
  });

  it("treats a checksummed and a lowercase address as the same voter", async () => {
    const res = await vote([open.choices[0]], 3000, { address: upper });
    expect(res.status).toBe(200);
    expect(await entries(open.choices[1]._id)).toHaveLength(0);
    expect(await entries(open.choices[0]._id)).toHaveLength(1);
  });

  it("rejects a choice that belongs to another poll", async () => {
    const choices = [{ address: addr, pollID: String(open.poll._id), choiceId: String(ended.choices[0]._id) }];
    const res = await call(
      { network: "etherlink_mainnet", payloadBytes: message(choices, 4000), signature: "sig", publicKey: addr },
      { payloadObj: choices, verifiedAddress: addr }
    );
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/does not belong/);
    expect(await entries(ended.choices[0]._id)).toHaveLength(0);
  });

  it("rejects more than one choice in a single-choice poll", async () => {
    const res = await vote([open.choices[0], open.choices[1]], 5000);
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/single choice/);
  });

  it("splits the weight across choices in a multi-choice poll", async () => {
    const res = await vote([multi.choices[0], multi.choices[1]], 6000);
    expect(res.status).toBe(200);
    expect((await entries(multi.choices[0]._id))[0].balanceAtReferenceBlock).toBe("500");
    expect((await entries(multi.choices[1]._id))[0].balanceAtReferenceBlock).toBe("500");
  });

  it("rejects a voter with no balance", async () => {
    utilsEth.getEthUserBalanceAtLevel.mockImplementationOnce(async () => new BigNumber(0));
    const res = await vote([open.choices[0]], 7000);
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/No balance/);
  });

  it("rejects a vote on an ended poll", async () => {
    const res = await vote([ended.choices[0]], 8000);
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/Ended/);
  });
});

describe("Tezos votes", () => {
  const publicKey = "edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav";
  const address = getPkhfromPk(publicKey);
  let dao, open, ended;
  let counter = 0;

  const vote = (choiceObjs, when, pollOverride) => {
    const pollID = pollOverride || String(choiceObjs[0].pollID);
    const values = choiceObjs.map((c) => ({ address, pollID, choiceId: String(c._id) }));
    const payloadBytes = `05${counter++}`;
    utils.getInputFromSigPayload.mockImplementation((bytes) => (bytes === payloadBytes ? values : []));
    utils.getTimestampFromPayloadBytes.mockImplementation((bytes) => (bytes === payloadBytes ? when : Number(bytes.slice(2)) * 1000));
    return call({ network: "mainnet", payloadBytes, signature: "sig", publicKey });
  };

  beforeAll(async () => {
    utils.getUserTotalVotingPowerAtReferenceBlock.mockImplementation(async () => new BigNumber(500));
    dao = await DAOModel.create({
      name: "t", tokenAddress: "KT1token", tokenType: "fa2", network: "mainnet",
      votingAddressesCount: 0, members: [address],
    });
    await TokenModel.create({ tokenAddress: "KT1token", tokenType: "fa2", daoID: dao._id, decimals: "6", tokenID: "0" });
    open = await makePoll(dao);
    ended = await makePoll(dao, { endTime: Date.now() - 1e7 });
  });

  it("records a vote derived from the verified public key", async () => {
    const res = await vote([open.choices[0]], 10000);
    expect(res.status).toBe(200);
    const stored = await entries(open.choices[0]._id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ address, balanceAtReferenceBlock: "500" });
    expect(stored[0].payloadBytes).toBeDefined();
  });

  it("rejects a choice from another poll signed under an open poll", async () => {
    const res = await vote([ended.choices[0]], 11000, String(open.poll._id));
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/does not belong/);
    expect(await entries(ended.choices[0]._id)).toHaveLength(0);
  });

  it("replaces the earlier vote on a vote change", async () => {
    const res = await vote([open.choices[1]], 12000);
    expect(res.status).toBe(200);
    expect(await entries(open.choices[0]._id)).toHaveLength(0);
    expect(await entries(open.choices[1]._id)).toHaveLength(1);
  });
});
