const request = require("supertest");
const express = require("express");
const choicesRoutes = require("./choices");

const app = express();
app.use(express.json());
app.use("/", choicesRoutes);
const id = 123;

describe("Choices Routes", () => {
  it("should not find a choice with an invalid ID", async () => {
    await request(app)
      .get(`/choices/${id}/find`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
  it("should not find votes for an nonexistent choice", async () => {
    await request(app)
      .get(`/choices/${id}/user_votes`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
  it("should not find choices for an nonexistent user", async () => {
    await request(app)
      .get(`/choices/${id}/user`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
  it("should not find votes for a choice with an invalid ID", async () => {
    await request(app)
      .get(`/choices/${id}/votes`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
});
