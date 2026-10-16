const request = require("supertest");
const express = require("express");
const tokensRoutes = require("./tokens");

const app = express();
app.use(express.json());
app.use("/", tokensRoutes);
const id = 123;

describe("Tokens Routes", () => {
  it("does not expose an unauthenticated token creation endpoint", async () => {
    await request(app)
      .post(`/token/add`)
      .send("")
      .expect(404)
  });
  it("should not get a token with an invalid id", async () => {
    await request(app)
      .get(`/token/${id}`)
      .expect(400)
      .expect("Content-Type", /json/);
  });
  it("should not a find voting power for a token with an invalid location", async () => {
    await request(app)
      .get(`/network/${id}/token/${id}/token-id/${id}/voting-power`)
      .expect(400)
      .expect("Content-Type", /json/);
  });
});
