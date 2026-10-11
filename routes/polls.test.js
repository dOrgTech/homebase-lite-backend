const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { char2Bytes } = require("@taquito/utils");

const pollsRoutes = require("./polls");
const { linkProposal, validateFundingRequest } = require("../components/polls");
const PollModel = require("../db/models/Poll.model");
const DaoModel = require("../db/models/Dao.model");
const { connectToMongoose } = require("../db/mongoose-connection");
const { createTestDAO, createTestPoll } = require("../tests/fixtures/test-data");

const app = express();
app.use(express.json());
app.use("/", pollsRoutes);
const id = 123;

// Real Tezos addresses, needed because validateAddress verifies the checksum.
const DAO_ADDRESS = "KT1T17GC91HrJ8ijZgnMaE9j4PZbojbVAn73";
const RECIPIENT = "tz1burnburnburnburnburnburnburjAYjjX";
const AUTHOR = "tz1TestUser1";
const DAO_ADMIN = "tz1TestUser1";

const signedPayload = (data) =>
  char2Bytes(
    `Tezos Signed Message: homebase.com ${new Date().toISOString()} ${JSON.stringify(data)}`
  );

/**
 * linkProposal is mounted behind requireSignature in the real router, which
 * needs a genuine wallet signature. These tests exercise the component
 * directly so the authorization rules can be checked without a signer, and
 * the route level test below covers the signature gate itself.
 */
const linkProposalApp = express();
linkProposalApp.use(express.json());
linkProposalApp.post("/polls/:id/link-proposal", linkProposal);

describe("Polls Routes", () => {
  it("should not get a poll with an invalid id", async () => {
    await request(app)
      .get(`/polls/${id}/polls`)
      .expect(400)
      .expect("Content-Type", /json/);
  });
  it("should not a list for a poll with an invalid signature payload", async () => {
    await request(app)
      .get(`/polls/${id}/list`)
      .expect(400)
      .expect("Content-Type", /json/);
  });
  it("should not add a poll with an invalid signature payload", async () => {
    await request(app).post(`/poll/add`).send("").expect(500);
  });
  it("should not link a proposal with an invalid signature payload", async () => {
    await request(app).post(`/polls/${id}/link-proposal`).send("").expect(500);
  });
});

describe("validateFundingRequest", () => {
  it("should return undefined when no funding request is present", () => {
    expect(validateFundingRequest(undefined)).toBeUndefined();
    expect(validateFundingRequest(null)).toBeUndefined();
  });

  it("should accept a valid recipient and amount", () => {
    expect(validateFundingRequest({ recipient: RECIPIENT, amount: "12.5" })).toEqual({
      recipient: RECIPIENT,
      amount: "12.5",
    });
  });

  it("should accept a KT1 recipient", () => {
    expect(validateFundingRequest({ recipient: DAO_ADDRESS, amount: "1" })).toEqual({
      recipient: DAO_ADDRESS,
      amount: "1",
    });
  });

  it("should accept exactly six decimals", () => {
    expect(validateFundingRequest({ recipient: RECIPIENT, amount: "0.000001" })).toEqual({
      recipient: RECIPIENT,
      amount: "0.000001",
    });
  });

  it("should reject an invalid recipient", () => {
    expect(() =>
      validateFundingRequest({ recipient: "not-an-address", amount: "1" })
    ).toThrow("Invalid funding request recipient");
  });

  it("should reject more than six decimals", () => {
    expect(() =>
      validateFundingRequest({ recipient: RECIPIENT, amount: "0.0000001" })
    ).toThrow("Invalid funding request amount");
  });

  it("should reject a zero or negative amount", () => {
    expect(() => validateFundingRequest({ recipient: RECIPIENT, amount: "0" })).toThrow(
      "Invalid funding request amount"
    );
    expect(() => validateFundingRequest({ recipient: RECIPIENT, amount: "-5" })).toThrow(
      "Invalid funding request amount"
    );
  });

  it("should reject a non string amount", () => {
    expect(() => validateFundingRequest({ recipient: RECIPIENT, amount: 5 })).toThrow(
      "Invalid funding request amount"
    );
  });
});

describe("Poll funding request and proposal linking", () => {
  // Jest workers share one in-memory Mongo, so this suite only removes the
  // documents it created rather than emptying the collections.
  const createdPollIds = [];
  const createdDaoIds = [];

  const makeDao = async (overrides) => {
    const dao = await DaoModel.create(createTestDAO(overrides));
    createdDaoIds.push(dao._id);
    return dao;
  };

  const makePoll = async (daoId, overrides) => {
    const poll = await PollModel.create(createTestPoll(daoId, overrides));
    createdPollIds.push(poll._id);
    return poll;
  };

  beforeAll(async () => {
    await connectToMongoose();
  });

  afterAll(async () => {
    await PollModel.deleteMany({ _id: { $in: createdPollIds } });
    await DaoModel.deleteMany({ _id: { $in: createdDaoIds } });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  it("should persist a funding request on the poll document", async () => {
    const dao = await makeDao();
    const poll = await makePoll(dao._id, { fundingRequest: { recipient: RECIPIENT, amount: "100.5" } });

    const saved = await PollModel.findById(poll._id).lean();
    expect(saved.fundingRequest).toEqual({ recipient: RECIPIENT, amount: "100.5" });
  });

  it("should return the funding request from GET /polls/:id/polls", async () => {
    const dao = await makeDao();
    const poll = await makePoll(dao._id, { fundingRequest: { recipient: RECIPIENT, amount: "7" } });

    const response = await request(app).get(`/polls/${poll._id}/polls`).expect(200);
    expect(response.body.fundingRequest).toEqual({ recipient: RECIPIENT, amount: "7" });
  });

  it("should return the funding request from GET /polls/:id/list", async () => {
    const dao = await makeDao();
    await makePoll(dao._id, { fundingRequest: { recipient: RECIPIENT, amount: "7" } });

    const response = await request(app).get(`/polls/${dao._id}/list`).expect(200);
    expect(response.body[0].fundingRequest).toEqual({ recipient: RECIPIENT, amount: "7" });
  });

  it("should leave fundingRequest unset when no funding is requested", async () => {
    const dao = await makeDao();
    const poll = await makePoll(dao._id);

    const saved = await PollModel.findById(poll._id).lean();
    expect(saved.fundingRequest).toBeUndefined();
  });

  describe("POST /polls/:id/link-proposal", () => {
    const proposalPayload = (overrides = {}) => ({
      daoAddress: DAO_ADDRESS,
      proposalKey: "0xproposalkey",
      network: "mainnet",
      ...overrides,
    });

    it("should link a proposal when the signer is the poll author", async () => {
      const dao = await makeDao();
      const poll = await makePoll(dao._id, { author: AUTHOR });

      const payload = proposalPayload();
      const response = await request(linkProposalApp)
        .post(`/polls/${poll._id}/link-proposal`)
        .send({
          payloadBytes: signedPayload(payload),
          publicKey: AUTHOR,
          network: "etherlink-mainnet",
        })
        .expect(200);

      expect(response.body).toEqual({ ok: true });

      const saved = await PollModel.findById(poll._id).lean();
      expect(saved.onchainProposal).toEqual(payload);
    });

    it("should link a proposal when the signer is the community admin", async () => {
      const dao = await makeDao({ members: [DAO_ADMIN, "tz1Other"] });
      const poll = await makePoll(dao._id, { author: "tz1SomebodyElse" });

      await request(linkProposalApp)
        .post(`/polls/${poll._id}/link-proposal`)
        .send({
          payloadBytes: signedPayload(proposalPayload()),
          publicKey: DAO_ADMIN,
          network: "etherlink-mainnet",
        })
        .expect(200);

      const saved = await PollModel.findById(poll._id).lean();
      expect(saved.onchainProposal.proposalKey).toBe("0xproposalkey");
    });

    it("should return 403 when the signer is neither author nor admin", async () => {
      const dao = await makeDao({ members: ["tz1Admin"] });
      const poll = await makePoll(dao._id, { author: "tz1SomebodyElse" });

      await request(linkProposalApp)
        .post(`/polls/${poll._id}/link-proposal`)
        .send({
          payloadBytes: signedPayload(proposalPayload()),
          publicKey: "tz1Intruder",
          network: "etherlink-mainnet",
        })
        .expect(403);

      const saved = await PollModel.findById(poll._id).lean();
      expect(saved.onchainProposal).toBeUndefined();
    });

    it("should return 404 for an unknown poll", async () => {
      await request(linkProposalApp)
        .post(`/polls/${new mongoose.Types.ObjectId()}/link-proposal`)
        .send({
          payloadBytes: signedPayload(proposalPayload()),
          publicKey: AUTHOR,
          network: "etherlink-mainnet",
        })
        .expect(404);
    });

    it("should return 404 for a malformed poll id", async () => {
      await request(linkProposalApp)
        .post(`/polls/not-an-id/link-proposal`)
        .send({
          payloadBytes: signedPayload(proposalPayload()),
          publicKey: AUTHOR,
          network: "etherlink-mainnet",
        })
        .expect(404);
    });

    it("should return 400 for an invalid dao address", async () => {
      const dao = await makeDao();
      const poll = await makePoll(dao._id, { author: AUTHOR });

      await request(linkProposalApp)
        .post(`/polls/${poll._id}/link-proposal`)
        .send({
          payloadBytes: signedPayload(proposalPayload({ daoAddress: "not-an-address" })),
          publicKey: AUTHOR,
          network: "etherlink-mainnet",
        })
        .expect(400);
    });

    it("should return 400 for a missing proposal key", async () => {
      const dao = await makeDao();
      const poll = await makePoll(dao._id, { author: AUTHOR });

      await request(linkProposalApp)
        .post(`/polls/${poll._id}/link-proposal`)
        .send({
          payloadBytes: signedPayload(proposalPayload({ proposalKey: "  " })),
          publicKey: AUTHOR,
          network: "etherlink-mainnet",
        })
        .expect(400);
    });
  });
});
