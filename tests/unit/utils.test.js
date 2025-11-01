const { setupTzktMocks, createValidSignaturePayload } = require('../mocks/blockchain.mock');
const {
  getInputFromSigPayload,
  getCurrentBlock,
  getTotalSupplyAtCurrentBlock,
  getUserBalanceAtLevel,
  getTokenHoldersCount,
  getTimestampFromPayloadBytes,
  getIPFSProofFromPayload
} = require('../../utils');

describe('Utils - Tezos Functions', () => {
  beforeEach(() => {
    setupTzktMocks(global.axiosMock, 'ghostnet');
  });

  describe('getInputFromSigPayload', () => {
    it('should parse signature payload correctly', () => {
      const testData = {
        tokenAddress: 'KT1Test',
        tokenID: '0',
        name: 'Test DAO'
      };
      const payloadBytes = createValidSignaturePayload(testData);
      const result = getInputFromSigPayload(payloadBytes);
      
      expect(result).toEqual(testData);
    });

    it('should handle complex nested objects', () => {
      const testData = {
        choices: ['Yes', 'No', 'Abstain'],
        daoID: '12345',
        metadata: { key: 'value' }
      };
      const payloadBytes = createValidSignaturePayload(testData);
      const result = getInputFromSigPayload(payloadBytes);
      
      expect(result).toEqual(testData);
    });

    it('should handle arrays in payload', () => {
      const testData = {
        members: ['tz1User1', 'tz1User2', 'tz1User3']
      };
      const payloadBytes = createValidSignaturePayload(testData);
      const result = getInputFromSigPayload(payloadBytes);
      
      expect(result).toEqual(testData);
    });
  });

  describe('getCurrentBlock', () => {
    it('should fetch current block for ghostnet', async () => {
      const result = await getCurrentBlock('ghostnet');
      
      expect(result).toBe(5000000);
    });

    it('should fetch current block for mainnet', async () => {
      setupTzktMocks(global.axiosMock, 'mainnet');
      const result = await getCurrentBlock('mainnet');
      
      expect(result).toBe(5000000);
    });

    it('should handle API errors gracefully', async () => {
      global.axiosMock.reset();
      global.axiosMock
        .onGet(/https:\/\/api\.ghostnet\.tzkt\.io\/v1\/head/)
        .reply(500);

      await expect(getCurrentBlock('ghostnet')).rejects.toThrow();
    });

    it('should handle network timeout', async () => {
      global.axiosMock.reset();
      global.axiosMock
        .onGet(/https:\/\/api\.ghostnet\.tzkt\.io\/v1\/head/)
        .timeout();

      await expect(getCurrentBlock('ghostnet')).rejects.toThrow();
    });
  });

  describe('getTotalSupplyAtCurrentBlock', () => {
    it('should fetch total supply for a token', async () => {
      const result = await getTotalSupplyAtCurrentBlock('ghostnet', 'KT1TestContract', 0);
      
      expect(result).toBe('1000000');
    });

    it('should handle invalid token address', async () => {
      global.axiosMock.reset();
      global.axiosMock
        .onGet(/https:\/\/api\.ghostnet\.tzkt\.io\/v1\/tokens/)
        .reply(200, []);

      const result = await getTotalSupplyAtCurrentBlock('ghostnet', 'KT1Invalid', 0);
      
      expect(result).toBeUndefined();
    });

    it('should handle different token IDs', async () => {
      const result = await getTotalSupplyAtCurrentBlock('ghostnet', 'KT1TestContract', 5);
      
      expect(result).toBe('1000000');
    });
  });

  describe('getUserBalanceAtLevel', () => {
    it('should fetch user balance at specific level', async () => {
      const result = await getUserBalanceAtLevel(
        'ghostnet',
        'KT1TestContract',
        '0',
        5000000,
        'tz1TestUser'
      );
      
      expect(result).toBeDefined();
      expect(result.toString()).toBe('100000');
    });

    it('should return zero balance for user without tokens', async () => {
      global.axiosMock.reset();
      global.axiosMock
        .onGet(/https:\/\/api\.ghostnet\.tzkt\.io\/v1\/tokens\/historical_balances/)
        .reply(200, []);

      const result = await getUserBalanceAtLevel(
        'ghostnet',
        'KT1TestContract',
        '0',
        5000000,
        'tz1NoTokens'
      );
      
      expect(result.toString()).toBe('0');
    });

    it('should handle FA2 tokens', async () => {
      const result = await getUserBalanceAtLevel(
        'ghostnet',
        'KT1TestContract',
        '0',
        5000000,
        'tz1TestUser'
      );
      
      expect(result).toBeDefined();
    });
  });

  describe('getTokenHoldersCount', () => {
    it('should count token holders correctly', async () => {
      const result = await getTokenHoldersCount('ghostnet', 'KT1TestContract', '0');
      
      expect(result).toBe(3);
    });

    it('should return 0 for tokens with no holders', async () => {
      global.axiosMock.reset();
      global.axiosMock
        .onGet(/https:\/\/api\.ghostnet\.tzkt\.io\/v1\/tokens\?/)
        .reply(200, []);

      const result = await getTokenHoldersCount('ghostnet', 'KT1TestContract', '0');
      
      expect(result).toBe(0);
    });

    it('should handle pagination for large holder counts', async () => {
      const result = await getTokenHoldersCount('ghostnet', 'KT1TestContract', '0');
      
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTimestampFromPayloadBytes', () => {
    it('should extract timestamp from payload', () => {
      const testData = { test: 'data' };
      const payloadBytes = createValidSignaturePayload(testData);
      const result = getTimestampFromPayloadBytes(payloadBytes);
      
      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
    });

    it('should return consistent timestamps', () => {
      const testData = { test: 'data' };
      const payloadBytes1 = createValidSignaturePayload(testData);
      const payloadBytes2 = createValidSignaturePayload(testData);
      
      const result1 = getTimestampFromPayloadBytes(payloadBytes1);
      const result2 = getTimestampFromPayloadBytes(payloadBytes2);
      
      expect(Math.abs(result1 - result2)).toBeLessThan(1000);
    });
  });

  describe('getIPFSProofFromPayload', () => {
    it('should generate IPFS proof from payload and signature', () => {
      const payloadBytes = createValidSignaturePayload({ test: 'data' });
      const signature = 'test_signature';
      
      const result = getIPFSProofFromPayload(payloadBytes, signature);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate different proofs for different payloads', () => {
      const payload1 = createValidSignaturePayload({ test: 'data1' });
      const payload2 = createValidSignaturePayload({ test: 'data2' });
      const signature = 'test_signature';
      
      const result1 = getIPFSProofFromPayload(payload1, signature);
      const result2 = getIPFSProofFromPayload(payload2, signature);
      
      expect(result1).not.toBe(result2);
    });

    it('should generate different proofs for different signatures', () => {
      const payload = createValidSignaturePayload({ test: 'data' });
      
      const result1 = getIPFSProofFromPayload(payload, 'signature1');
      const result2 = getIPFSProofFromPayload(payload, 'signature2');
      
      expect(result1).not.toBe(result2);
    });
  });
});

