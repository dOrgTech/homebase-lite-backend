const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');

const axiosMock = new MockAdapter(axios);

global.axiosMock = axiosMock;

beforeEach(() => {
  axiosMock.reset();
});

afterEach(() => {
  jest.clearAllMocks();
});

global.testUtils = {
  generateObjectId: () => {
    const timestamp = (new Date().getTime() / 1000 | 0).toString(16);
    return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, () => {
      return (Math.random() * 16 | 0).toString(16);
    }).toLowerCase();
  },
  
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  createMockRequest: (options = {}) => ({
    body: options.body || {},
    query: options.query || {},
    params: options.params || {},
    method: options.method || 'GET',
    headers: options.headers || {},
    payloadObj: options.payloadObj || null,
    ...options
  }),
  
  createMockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.sendStatus = jest.fn().mockReturnValue(res);
    return res;
  },
  
  createMockNext: () => jest.fn()
};

