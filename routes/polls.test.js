const request = require("supertest");
const express = require("express");
const pollsRoutes = require("../routes/polls");

const app = express();
app.use(express.json());
app.use("/", pollsRoutes);
const id = 123;

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
    await request(app)
      .post(`/poll/add`)
      .send("")
      .expect(500)
  });
});
