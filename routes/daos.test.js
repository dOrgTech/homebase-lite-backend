const request = require("supertest");
const express = require("express");
const daosRoutes = require("./daos");

const app = express();
app.use(express.json());
app.use("/", daosRoutes);
const id = 123;

describe("Daos Routes", () => {
  it("should not join a dao with an invalid signature payload", async () => {
    await request(app)
      .post(`/daos/join`)
      .send({daoId: `${id}`})
      .set('Accept', 'application/json')
      .expect(500)
  });
  it("should not add a dao with an invalid signature payload", async () => {
    await request(app)
      .post(`/dao/add`)
      .send({daoDetails: {}})
      .set('Accept', 'application/json')
      .expect(500)
  });
  it("should not return a list of daos with an invalid signature payload", async () => {
    await request(app)
      .post(`/daos`)
      .send('')
      .expect(400)
      .expect("Content-Type", /json/)
  });
  it("should not return a dao contract with an invalid signature payload", async () => {
    await request(app)
      .post(`/daos/contracts/${id}`)
      .send('')
      .expect(400)
      .expect("Content-Type", /json/)
  });
  it("should not find a dao with an invalid ID", async () => {
    await request(app)
      .get(`/daos/${id}`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
  it("should not add a new field to the DAO collection with an invalid signature payload", async () => {
    await request(app)
      .get(`/daos/create/voting`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
  it("should not update total voting addresses count for a dao with an invalid ID", async () => {
    await request(app)
      .get(`/daos/${id}`)
      .expect(400)
      .expect("Content-Type", /json/)
  });
});
