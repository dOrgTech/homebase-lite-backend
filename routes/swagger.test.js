const request = require("supertest");
const express = require("express");
const swaggerRoutes = require("./swagger");

const app = express();
app.use(express.json());
app.use("/", swaggerRoutes);

describe("Swagger Routes", () => {
  it("should serve the Swagger documentation on /", async () => {
    await request(app)
      .get("/")
      .expect(200)
      .expect("Content-Type", /html/);
  });
});
