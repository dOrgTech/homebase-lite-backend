const request = require("supertest");
const express = require("express");
const aciRoutes = require("./aci");

const app = express();
app.use(express.json());
app.use("/", aciRoutes);

const contractIds = [
    "KT1MzN5jLkbbq9P6WEFmTffUrYtK8niZavzH",
    "KT1VG3ynsnyxFGzw9mdBwYnyZAF8HZvqnNkw",
    "I_AM_INVALID_ID"
]

describe("ACI Routes", () => {
    it("should return bad status on invalid address ", async () => {
      await request(app)
        .post(`/aci/${contractIds[2]}`)
        .expect(400)
        .expect("Content-Type", /json/)
    });
    it("should return valid status on valid address ", async () => {
        await request(app)
        .post(`/aci/${contractIds[0]}`)
        .send({network:"ghostnet"})
        .expect(200)
        .expect("Content-Type", /json/)
    });
    it("should return valid JSON on valid address", async () => {
        const res = await request(app)
        .post(`/aci/${contractIds[0]}`)
        .send({network:"ghostnet"})
        .expect(200)
        .expect("Content-Type", /json/)

        expect(res.body).toHaveProperty("counter");
        expect(res.body).toHaveProperty("name");
        expect(res.body).toHaveProperty("type");
        expect(res.body).toHaveProperty("children");
        expect(res.body).toHaveProperty("operations");
    });
  });
  