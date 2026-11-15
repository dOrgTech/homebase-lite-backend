/**
 * Email links: a GET (what link scanners in mail filters do) only shows a page and changes
 * nothing; the page's button POSTs and makes the change. A POST without ?via=page is a mail
 * client's one-click unsubscribe. Runs the real routes against an in-memory MongoDB.
 */
jest.setTimeout(120000);

const express = require("express");
const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const SubscriptionModel = require("../../../db/models/Subscription.model");

const app = express();
app.use(express.json());
app.use(require("../../../routes/subscriptions"));

let replSet;
let n = 0;

const makeSubscription = (overrides = {}) =>
  SubscriptionModel.create({
    email: `reader${n}@example.com`,
    daoAddress: "KT1NYT495uBmnimBJa74vdCS1DJnP9na4rsy",
    network: "mainnet",
    confirmed: false,
    confirmToken: `confirm-${n}`,
    unsubscribeToken: `unsub-${n++}`,
    ...overrides,
  });

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

describe("confirm link", () => {
  test("GET shows a page with a POST button and does not confirm", async () => {
    const sub = await makeSubscription();
    const res = await request(app).get(`/subscriptions/confirm/${sub.confirmToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.text).toContain('<form method="post" action="?via=page">');
    expect((await SubscriptionModel.findById(sub._id)).confirmed).toBe(false);
  });

  test("POST confirms and redirects to the DAO page", async () => {
    const sub = await makeSubscription();
    const res = await request(app).post(`/subscriptions/confirm/${sub.confirmToken}?via=page`);

    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(new RegExp(`/explorer/dao/${sub.daoAddress}\\?alerts=confirmed$`));
    expect((await SubscriptionModel.findById(sub._id)).confirmed).toBe(true);
  });

  test("POST with an unknown token redirects to invalid", async () => {
    const res = await request(app).post("/subscriptions/confirm/nope?via=page");
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/alerts=invalid$/);
  });
});

describe("unsubscribe link", () => {
  test("GET shows a page and keeps the subscription", async () => {
    const sub = await makeSubscription({ confirmed: true });
    const res = await request(app).get(`/subscriptions/unsubscribe/${sub.unsubscribeToken}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Unsubscribe");
    expect(await SubscriptionModel.findById(sub._id)).not.toBeNull();
  });

  test("POST from the page removes it and redirects", async () => {
    const sub = await makeSubscription({ confirmed: true });
    const res = await request(app).post(`/subscriptions/unsubscribe/${sub.unsubscribeToken}?via=page`);

    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/alerts=unsubscribed$/);
    expect(await SubscriptionModel.findById(sub._id)).toBeNull();
  });

  test("one-click POST from a mail client removes it and answers 200", async () => {
    const sub = await makeSubscription({ confirmed: true });
    const res = await request(app)
      .post(`/subscriptions/unsubscribe/${sub.unsubscribeToken}`)
      .type("form")
      .send("List-Unsubscribe=One-Click");

    expect(res.status).toBe(200);
    expect(await SubscriptionModel.findById(sub._id)).toBeNull();
  });
});
