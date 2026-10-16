/**
 * Creation gates: who may create polls and communities, which token they are
 * bound to, and that user-written HTML is neutralised. Runs the real handlers
 * against an in-memory MongoDB; only chain lookups are stubbed.
 */
jest.setTimeout(120000);

jest.mock("../../../utils-eth", () => ({
  ...jest.requireActual("../../../utils-eth"),
  getEthDaoToken: jest.fn(),
  getEthCurrentBlockNumber: jest.fn(async () => 100),
  getEthTotalSupply: jest.fn(async () => 1000000n),
  getEthUserBalanceAtLevel: jest.fn(async () => 10n),
}));
jest.mock("../../../utils", () => ({
  ...jest.requireActual("../../../utils"),
  getInputFromSigPayload: jest.fn(),
  getDaoGovernanceToken: jest.fn(),
  getCurrentBlock: jest.fn(async () => 500),
  getUserBalanceAtLevel: jest.fn(),
}));
jest.mock("../../../services", () => ({
  ...jest.requireActual("../../../services"),
  getTokenMetadata: jest.fn(async () => ({ standard: "fa2", metadata: { symbol: "TST", decimals: "6" } })),
}));

const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { BigNumber } = require("bignumber.js");
const { getPkhfromPk } = require("@taquito/utils");
const utilsEth = require("../../../utils-eth");
const utils = require("../../../utils");
const DAOModel = require("../../../db/models/Dao.model");
const PollModel = require("../../../db/models/Poll.model");
const TokenModel = require("../../../db/models/Token.model");
const { addPoll, getPollById } = require("../../../components/polls");
const { createDAO, getDAOById, joinDAO } = require("../../../components/daos");

let replSet;
let counter = 0;

const call = (handler, body, extra = {}) =>
  new Promise((resolve) => {
    const req = { body, params: {}, query: {}, ...extra };
    handler(req, {
      json: (payload) => resolve({ status: 200, payload }),
      status: (code) => ({
        send: (payload) => resolve({ status: code, payload }),
        json: (payload) => resolve({ status: code, payload }),
      }),
    });
  });

const ethAddr = "0x1111111111111111111111111111111111111111";
const otherEth = "0x2222222222222222222222222222222222222222";
const daoContractEth = "0xeedca7f405210cbcb4e63a67f18e974c821f4ca1";
const chainToken = "0x444ac1384afa71700eebdc5d3b05256c8229f008";
const attackerToken = "0x9999999999999999999999999999999999999999";

const ethPoll = (payload, publicKey = ethAddr) =>
  call(
    addPoll,
    { network: "etherlink_shadownet", payloadBytes: `eth-payload-${counter++}`, signature: "sig", publicKey },
    { payloadObj: payload, verifiedAddress: publicKey.toLowerCase() }
  );

const basePoll = (daoId) => ({
  name: "Budget",
  description: "plain",
  choices: ["yes", "no"],
  endTime: String(Date.now() + 1e7),
  votingStrategy: 0,
  daoId,
  tokenAddress: attackerToken,
});

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

describe("Etherlink on-chain DAO polls", () => {
  beforeAll(() => {
    utilsEth.getEthDaoToken.mockImplementation(async (network, dao) => (dao.toLowerCase() === daoContractEth ? chainToken : null));
  });

  it("binds the DAO record to the token read from the contract, not the payload", async () => {
    const res = await ethPoll(basePoll(daoContractEth));
    expect(res.status).toBe(200);
    const dao = await DAOModel.findOne({ address: daoContractEth }).lean();
    expect(dao.tokenAddress).toBe(chainToken);
    expect(dao.network).toBe("etherlink_shadownet");
    expect(dao.polls).toHaveLength(1);
  });

  it("keeps the chain token when another author posts a poll naming a different token", async () => {
    const res = await ethPoll(basePoll(daoContractEth), otherEth);
    expect(res.status).toBe(200);
    const dao = await DAOModel.findOne({ address: daoContractEth }).lean();
    expect(dao.tokenAddress).toBe(chainToken);
    expect(dao.polls).toHaveLength(2);
  });

  it("rejects an author with no balance of the DAO token", async () => {
    utilsEth.getEthUserBalanceAtLevel.mockImplementationOnce(async () => 0n);
    const res = await ethPoll(basePoll(daoContractEth));
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/balance/);
  });

  it("rejects a contract that is not a Homebase DAO", async () => {
    const res = await ethPoll(basePoll("0x3333333333333333333333333333333333333333"));
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/resolve the DAO token/);
    expect(await DAOModel.findOne({ address: "0x3333333333333333333333333333333333333333" })).toBeNull();
  });
});

describe("Etherlink lite communities", () => {
  const liteToken = "0x4444444444444444444444444444444444444444";

  const createEth = (payload, publicKey = ethAddr) =>
    call(
      createDAO,
      { network: "etherlink_shadownet", payloadBytes: `dao-${counter++}`, signature: "sig", publicKey },
      { payloadObj: payload, verifiedAddress: publicKey.toLowerCase() }
    );

  const baseDao = (over = {}) => ({
    name: "Lite",
    description: "d",
    tokenAddress: liteToken,
    symbol: "LT",
    decimals: 18,
    network: "etherlink_shadownet",
    requiredTokenOwnership: true,
    allowPublicAccess: false,
    ...over,
  });

  it("rejects a community claiming a DAO contract that uses another token", async () => {
    const res = await createEth(baseDao({ daoContract: daoContractEth }));
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/does not use this token/);
  });

  it("accepts the claim when the contract's token matches, once", async () => {
    const ok = await createEth(baseDao({ tokenAddress: chainToken, daoContract: daoContractEth }));
    expect(ok.status).toBe(200);
    expect(ok.payload.dao.daoContract).toBe(daoContractEth);
    const dup = await createEth(baseDao({ tokenAddress: chainToken, daoContract: daoContractEth }), otherEth);
    expect(dup.status).toBe(400);
    expect(dup.payload.message).toMatch(/already exists/);
  });

  it("rejects a creator without balance and an unknown network", async () => {
    utilsEth.getEthUserBalanceAtLevel.mockImplementationOnce(async () => 0n);
    const noBalance = await createEth(baseDao());
    expect(noBalance.status).toBe(400);
    expect(noBalance.payload.message).toMatch(/balance/);
    const badNetwork = await createEth(baseDao({ network: "evil.example/?" }));
    expect(badNetwork.status).toBe(400);
    expect(badNetwork.payload.message).toMatch(/not supported/);
  });

  it("requires a balance to post a poll when the community asks for it", async () => {
    const created = await createEth(baseDao());
    expect(created.status).toBe(200);
    const daoId = String(created.payload.dao._id);
    utilsEth.getEthUserBalanceAtLevel.mockImplementationOnce(async () => 0n);
    const res = await ethPoll(basePoll(daoId), otherEth);
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/balance/);
  });
});

describe("Stored HTML", () => {
  it("neutralises executable markup in poll fields at write and read", async () => {
    const payload = {
      ...basePoll(daoContractEth),
      name: "<img src=x onerror=alert(1)>Title",
      description: '<iframe srcdoc="<script>alert(1)</script>"></iframe><p onclick="x()">Hi <a href="javascript:alert(1)">link</a></p>',
      choices: ["<script>alert(1)</script>yes", "no"],
    };
    const res = await ethPoll(payload);
    expect(res.status).toBe(200);
    const read = await call(getPollById, {}, { params: { id: String(res.payload.pollId) } });
    expect(read.status).toBe(200);
    expect(read.payload.name).toBe("Title");
    expect(read.payload.description).not.toMatch(/iframe|srcdoc|onclick|javascript:/i);
    expect(read.payload.description).toMatch(/<p>Hi <a/);
    const poll = await PollModel.findById(res.payload.pollId).populate("choices").lean();
    expect(poll.choices.map((c) => c.name)).toEqual(["yes", "no"]);
  });
});

describe("Tezos communities", () => {
  const publicKey = "edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav";
  const address = getPkhfromPk(publicKey);
  const token = "KT1Tr1365tKdpS1ZxkVLzzp1UPgUUd3u7JnG";
  const daoContract = "KT1MH4CJWShYNq53iF6f17FbGH2Pe7qAwHMn";

  const createTz = (values) => {
    const payloadBytes = `05tz${counter++}`;
    utils.getInputFromSigPayload.mockImplementation((bytes) => (bytes === payloadBytes ? values : {}));
    return call(createDAO, { network: "mainnet", payloadBytes, signature: "sig", publicKey });
  };

  const baseDao = (over = {}) => ({
    name: "Tz", description: "d", tokenAddress: token, tokenID: 0, network: "mainnet",
    requiredTokenOwnership: false, allowPublicAccess: false, ...over,
  });

  beforeAll(() => {
    utils.getUserBalanceAtLevel.mockImplementation(async () => new BigNumber(5));
    utils.getDaoGovernanceToken.mockImplementation(async (network, kt) =>
      kt === daoContract ? { address: token, tokenId: "0" } : null
    );
  });

  it("rejects a claim on a DAO contract whose governance token differs", async () => {
    const res = await createTz(baseDao({ tokenAddress: "KT1KFJ8GdcqCPupJh8L15cBb6m2UT9mvWdXi", daoContract }));
    expect(res.status).toBe(400);
    expect(res.payload.message).toMatch(/does not use this token/);
  });

  it("accepts a matching claim and refuses an unknown network", async () => {
    const ok = await createTz(baseDao({ daoContract }));
    expect(ok.status).toBe(200);
    expect(ok.payload.dao.daoContract).toBe(daoContract);
    const bad = await createTz(baseDao({ network: "evil.example/?" }));
    expect(bad.status).toBe(400);
    expect(bad.payload.message).toMatch(/not supported/);
  });

  it("gates joining on access or balance and keeps the creator", async () => {
    const created = await createTz(baseDao());
    const daoId = String(created.payload.dao._id);
    const joinAs = (pk, bytes) => {
      utils.getInputFromSigPayload.mockImplementation((b) => (b === bytes ? { daoId } : {}));
      return call(joinDAO, { network: "mainnet", payloadBytes: bytes, signature: "sig", publicKey: pk });
    };
    const leave = await joinAs(publicKey, "05leave");
    expect(leave.status).toBe(400);
    expect(leave.payload.message).toMatch(/creator cannot leave/);

    const joiner = "edpkv8EUUH68jmo3f7Um5PezmfGrRF24gnfLpH3sVNwJnV5bVCxL2n";
    utils.getUserBalanceAtLevel.mockImplementationOnce(async () => new BigNumber(0));
    const denied = await joinAs(joiner, "05join1");
    expect(denied.status).toBe(400);
    expect(denied.payload.message).toMatch(/requires holding/);
    const allowed = await joinAs(joiner, "05join2");
    expect(allowed.status).toBe(200);
    const dao = await DAOModel.findById(daoId).lean();
    expect(dao.members).toEqual([address, getPkhfromPk(joiner)]);
  });
});

describe("DAO lookup", () => {
  it("does not treat the id as a regex and does not crash on bad input", async () => {
    for (const id of ["(", "KT1.*", "0x.*", ".*"]) {
      const res = await call(getDAOById, {}, { params: { id }, query: {} });
      expect(res.status).toBe(404);
    }
    const hit = await call(getDAOById, {}, { params: { id: daoContractEth.toUpperCase().replace("0X", "0x") }, query: { include: "polls" } });
    expect(hit.status).toBe(200);
    expect(hit.payload.polls.length).toBeGreaterThan(0);
    expect(hit.payload.polls[0].description).not.toMatch(/iframe/);
  });
});
