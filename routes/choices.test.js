const request = require("supertest");
const express = require("express");
const choicesRoutes = require("../routes/choices");

const app = express();
app.use(express.json());
app.use("/", choicesRoutes);
const choiceId = 123;

describe("Choices Routes", () => {
  it("should not find a choice with an invalid ID", async () => {
    await request(app)
      .get(`/choices/${choiceId}/find`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
  it("should not find votes for an nonexistent choice", async () => {
    await request(app)
      .get(`/choices/${choiceId}/user_votes`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
  it("should not find choices for an nonexistent user", async () => {
    await request(app)
      .get(`/choices/${choiceId}/user`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
  it("should not find votes for a choice with an invalid ID", async () => {
    await request(app)
      .get(`/choices/${choiceId}/votes`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
});
