const request = require("supertest");
const express = require("express");
const { ethers } = require("ethers");
const { requireSignature } = require("./index");

const app = express();
app.use(express.json());
app.post("/guarded", requireSignature, (req, res) => {
  res.json({ ok: true, verifiedAddress: req.verifiedAddress, payloadObj: req.payloadObj });
});

const wallet = ethers.Wallet.createRandom();
const other = ethers.Wallet.createRandom();
const payloadObj = { pollID: "abc", address: wallet.address };
const message = ["Tezos Signed Message:", "https://tezos-homebase.io", "2026-10-16T00:00:00.000Z", JSON.stringify(payloadObj)].join(" ");

describe("requireSignature on Etherlink networks", () => {
  it("accepts a payload signed by the claimed address", async () => {
    const signature = await wallet.signMessage(message);
    const res = await request(app)
      .post("/guarded")
      .send({ network: "etherlink_shadownet", signature, publicKey: wallet.address, payloadBytes: message })
      .expect(200);
    expect(res.body.verifiedAddress).toBe(wallet.address.toLowerCase());
    expect(res.body.payloadObj).toEqual(payloadObj);
  });

  it("rejects a signature made by a different wallet", async () => {
    const signature = await other.signMessage(message);
    await request(app)
      .post("/guarded")
      .send({ network: "etherlink_shadownet", signature, publicKey: wallet.address, payloadBytes: message })
      .expect(400);
  });

  it("rejects a tampered payload", async () => {
    const signature = await wallet.signMessage(message);
    await request(app)
      .post("/guarded")
      .send({ network: "etherlink_shadownet", signature, publicKey: wallet.address, payloadBytes: message + " " })
      .expect(400);
  });

  it("rejects a missing or malformed signature", async () => {
    await request(app)
      .post("/guarded")
      .send({ network: "etherlink_mainnet", publicKey: wallet.address, payloadBytes: message })
      .expect(400);
    await request(app)
      .post("/guarded")
      .send({ network: "etherlink_mainnet", signature: "0xdeadbeef", publicKey: wallet.address, payloadBytes: message })
      .expect(400);
  });

  it("rejects when no address is claimed", async () => {
    const signature = await wallet.signMessage(message);
    await request(app)
      .post("/guarded")
      .send({ network: "etherlink_mainnet", signature, payloadBytes: message })
      .expect(400);
  });
});
