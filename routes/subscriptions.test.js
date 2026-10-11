const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

jest.mock("../services/mailer.service", () => {
  const actual = jest.requireActual("../services/mailer.service");
  return {
    ...actual,
    sendMail: jest.fn().mockResolvedValue({ skipped: true }),
  };
});

const { sendMail } = require("../services/mailer.service");
const subscriptionsRoutes = require("./subscriptions");
const { resetRateLimit } = require("../components/subscriptions");
const SubscriptionModel = require("../db/models/Subscription.model");
const { connectToMongoose } = require("../db/mongoose-connection");

const app = express();
app.use(express.json());
app.use("/", subscriptionsRoutes);

// A real KT1 contract address, needed because validateAddress checks the checksum.
const DAO_ADDRESS = "KT1T17GC91HrJ8ijZgnMaE9j4PZbojbVAn73";
const APP_URL = "https://tezos-homebase.io";
const API_URL = "https://homebase-backend.netlify.app";

describe("Subscriptions Routes", () => {
  beforeAll(async () => {
    await connectToMongoose();
  });

  beforeEach(async () => {
    await SubscriptionModel.deleteMany({});
    resetRateLimit();
    sendMail.mockClear();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe("POST /subscriptions", () => {
    it("should create an unconfirmed subscription and send a confirmation email", async () => {
      const response = await request(app)
        .post("/subscriptions")
        .send({ email: "Alerts.User+dao@Example.com", daoAddress: DAO_ADDRESS, network: "mainnet" })
        .expect(200);

      expect(response.body).toEqual({ ok: true });

      const saved = await SubscriptionModel.findOne({ daoAddress: DAO_ADDRESS });
      expect(saved).not.toBeNull();
      expect(saved.email).toBe("alerts.user+dao@example.com");
      expect(saved.network).toBe("mainnet");
      expect(saved.confirmed).toBe(false);
      expect(saved.confirmToken).toHaveLength(64);
      expect(saved.unsubscribeToken).toHaveLength(64);

      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe("alerts.user+dao@example.com");
      expect(mail.text).toContain(`${API_URL}/subscriptions/confirm/${saved.confirmToken}`);
      expect(mail.text).toContain(DAO_ADDRESS);
      expect(mail.text).toContain("mainnet");
      expect(mail.text).toContain(
        `${API_URL}/subscriptions/unsubscribe/${saved.unsubscribeToken}`
      );
      expect(mail.headers["List-Unsubscribe"]).toBe(
        `<${API_URL}/subscriptions/unsubscribe/${saved.unsubscribeToken}>`
      );
    });

    it("should accept shadownet as a network", async () => {
      await request(app)
        .post("/subscriptions")
        .send({ email: "user@example.com", daoAddress: DAO_ADDRESS, network: "shadownet" })
        .expect(200);

      const saved = await SubscriptionModel.findOne({ network: "shadownet" });
      expect(saved).not.toBeNull();
    });

    it("should not create a duplicate subscription for the same email, dao and network", async () => {
      const body = { email: "user@example.com", daoAddress: DAO_ADDRESS, network: "mainnet" };

      await request(app).post("/subscriptions").send(body).expect(200);
      await request(app).post("/subscriptions").send(body).expect(200);

      const count = await SubscriptionModel.countDocuments({ email: "user@example.com" });
      expect(count).toBe(1);
    });

    it("should send an already-subscribed notice instead of a confirmation for a confirmed subscription", async () => {
      await SubscriptionModel.create({
        email: "user@example.com",
        daoAddress: DAO_ADDRESS,
        network: "mainnet",
        confirmed: true,
        confirmToken: "a".repeat(64),
        unsubscribeToken: "b".repeat(64),
        confirmedAt: new Date(),
      });

      const response = await request(app)
        .post("/subscriptions")
        .send({ email: "user@example.com", daoAddress: DAO_ADDRESS, network: "mainnet" })
        .expect(200);

      expect(response.body).toEqual({ ok: true });
      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe("user@example.com");
      expect(mail.subject).toMatch(/already subscribed/i);
      expect(mail.text).not.toContain("/subscriptions/confirm/");
      expect(mail.text).toContain(`/subscriptions/unsubscribe/${"b".repeat(64)}`);
      expect(await SubscriptionModel.countDocuments({ email: "user@example.com" })).toBe(1);
    });

    it("should reject an invalid email address", async () => {
      await request(app)
        .post("/subscriptions")
        .send({ email: "not-an-email", daoAddress: DAO_ADDRESS, network: "mainnet" })
        .expect(400);

      expect(sendMail).not.toHaveBeenCalled();
    });

    it("should reject a non KT1 dao address", async () => {
      await request(app)
        .post("/subscriptions")
        .send({
          email: "user@example.com",
          daoAddress: "tz1burnburnburnburnburnburnburjAYjjX",
          network: "mainnet",
        })
        .expect(400);
    });

    it("should reject an unsupported network", async () => {
      await request(app)
        .post("/subscriptions")
        .send({ email: "user@example.com", daoAddress: DAO_ADDRESS, network: "notanetwork" })
        .expect(400);
    });

    it("should reject more than 5 requests per email per hour", async () => {
      const body = { email: "spammer@example.com", daoAddress: DAO_ADDRESS, network: "mainnet" };

      for (let i = 0; i < 5; i += 1) {
        await request(app).post("/subscriptions").send(body).expect(200);
      }

      await request(app).post("/subscriptions").send(body).expect(429);
    });
  });

  describe("GET /subscriptions/confirm/:token", () => {
    it("should confirm the subscription and redirect to the dao page", async () => {
      const subscription = await SubscriptionModel.create({
        email: "user@example.com",
        daoAddress: DAO_ADDRESS,
        network: "mainnet",
        confirmToken: "c".repeat(64),
        unsubscribeToken: "d".repeat(64),
      });

      const response = await request(app)
        .get(`/subscriptions/confirm/${subscription.confirmToken}`)
        .expect(302);

      expect(response.headers.location).toBe(
        `${APP_URL}/explorer/dao/${DAO_ADDRESS}?alerts=confirmed`
      );

      const saved = await SubscriptionModel.findById(subscription._id);
      expect(saved.confirmed).toBe(true);
      expect(saved.confirmedAt).toBeInstanceOf(Date);
    });

    it("should redirect to the app root for an unknown token", async () => {
      const response = await request(app)
        .get(`/subscriptions/confirm/${"e".repeat(64)}`)
        .expect(302);

      expect(response.headers.location).toBe(`${APP_URL}/explorer/daos?alerts=invalid`);
    });
  });

  describe("GET /subscriptions/unsubscribe/:token", () => {
    it("should delete the subscription and redirect to the dao page", async () => {
      const subscription = await SubscriptionModel.create({
        email: "user@example.com",
        daoAddress: DAO_ADDRESS,
        network: "mainnet",
        confirmed: true,
        confirmToken: "f".repeat(64),
        unsubscribeToken: "1".repeat(64),
      });

      const response = await request(app)
        .get(`/subscriptions/unsubscribe/${subscription.unsubscribeToken}`)
        .expect(302);

      expect(response.headers.location).toBe(
        `${APP_URL}/explorer/dao/${DAO_ADDRESS}?alerts=unsubscribed`
      );

      const saved = await SubscriptionModel.findById(subscription._id);
      expect(saved).toBeNull();
    });

    it("should redirect to the app root for an unknown token", async () => {
      const response = await request(app)
        .get(`/subscriptions/unsubscribe/${"2".repeat(64)}`)
        .expect(302);

      expect(response.headers.location).toBe(`${APP_URL}/explorer/daos?alerts=invalid`);
    });
  });
});
