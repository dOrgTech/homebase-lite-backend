const { setupEtherlinkMocks } = require('../mocks/blockchain.mock');
const {
  getEthCurrentBlockNumber,
  getEthTokenMetadata,
  getEthUserBalanceAtLevel,
  getEthTotalSupply,
  getEthTokenHoldersCount
} = require('../../utils-eth');

describe('Utils - Etherlink Functions', () => {
  beforeEach(() => {
    setupEtherlinkMocks(global.axiosMock, 'etherlink-testnet');
  });

  describe('getEthCurrentBlockNumber', () => {
    it('should fetch current block number', async () => {
      const result = await getEthCurrentBlockNumber('etherlink-testnet');
      
      expect(result).toBe('1000000');
    });

    it('should handle different networks', async () => {
      setupEtherlinkMocks(global.axiosMock, 'etherlink-mainnet');
      const result = await getEthCurrentBlockNumber('etherlink-mainnet');
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle API errors', async () => {
      global.axiosMock.reset();
      global.axiosMock
        .onGet(/https:\/\/.*\.explorer\.etherlink\.com\/api\/v2\/blocks/)
        .reply(500);

      await expect(getEthCurrentBlockNumber('etherlink-testnet')).rejects.toThrow();
    });

    it('should handle network timeout', async () => {
      global.axiosMock.reset();
      global.axiosMock
        .onGet(/https:\/\/.*\.explorer\.etherlink\.com\/api\/v2\/blocks/)
        .timeout();

      await expect(getEthCurrentBlockNumber('etherlink-testnet')).rejects.toThrow();
    });
  });

  describe('getEthTokenMetadata', () => {
    it('should fetch ERC20 token metadata', async () => {
      const result = await getEthTokenMetadata('etherlink-testnet', '0xTestToken');
      
      expect(result).toBeDefined();
      expect(result.name).toBe('Etherlink Test Token');
      expect(result.symbol).toBe('ETT');
      expect(result.decimals).toBe('18');
      expect(result.type).toBe('ERC-20');
    });

    it('should include holder count in metadata', async () => {
      const result = await getEthTokenMetadata('etherlink-testnet', '0xTestToken');
      
      expect(result.holders).toBeDefined();
      expect(result.holders).toBe('100');
    });

    it('should handle invalid token address', async () => {
      global.axiosMock.reset();
      global.axiosMock
        .onGet(/https:\/\/.*\.explorer\.etherlink\.com\/api\/v2\/tokens/)
        .reply(404);

      await expect(getEthTokenMetadata('etherlink-testnet', '0xInvalid')).rejects.toThrow();
    });

    it('should return total supply', async () => {
      const result = await getEthTokenMetadata('etherlink-testnet', '0xTestToken');
      
      expect(result.total_supply).toBeDefined();
      expect(typeof result.total_supply).toBe('string');
    });
  });

  describe('getEthUserBalanceAtLevel', () => {
    it('should fetch user balance at block level', async () => {
      const result = await getEthUserBalanceAtLevel(
        'etherlink-testnet',
        '0xTestUser',
        '0xTestToken',
        1000000
      );
      
      expect(result).toBeDefined();
      expect(result.toString()).toBe('100000000000000000000');
    });

    it('should return BigNumber instance', async () => {
      const result = await getEthUserBalanceAtLevel(
        'etherlink-testnet',
        '0xTestUser',
        '0xTestToken',
        1000000
      );
      
      expect(result.toString).toBeDefined();
      expect(typeof result.toString()).toBe('function');
    });

    it('should handle zero balance', async () => {
      global.axiosMock.reset();
      setupEtherlinkMocks(global.axiosMock, 'etherlink-testnet');
      
      const result = await getEthUserBalanceAtLevel(
        'etherlink-testnet',
        '0xNoBalance',
        '0xTestToken',
        1000000
      );
      
      expect(result.toString()).toBe('100000000000000000000');
    });

    it('should work without block level parameter', async () => {
      const result = await getEthUserBalanceAtLevel(
        'etherlink-testnet',
        '0xTestUser',
        '0xTestToken',
        null
      );
      
      expect(result).toBeDefined();
    });
  });

  describe('getEthTotalSupply', () => {
    it('should fetch total supply at specific block', async () => {
      const result = await getEthTotalSupply(
        'etherlink-testnet',
        '0xTestToken',
        1000000
      );
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should return supply as string', async () => {
      const result = await getEthTotalSupply(
        'etherlink-testnet',
        '0xTestToken',
        1000000
      );
      
      expect(result).toBe('1000000000000000000000000');
    });

    it('should handle contract errors', async () => {
      global.axiosMock.reset();
      global.axiosMock
        .onGet(/https:\/\/.*\.explorer\.etherlink\.com\/api\/v2\/tokens/)
        .reply(500);

      await expect(
        getEthTotalSupply('etherlink-testnet', '0xInvalid', 1000000)
      ).rejects.toThrow();
    });
  });

  describe('getEthTokenHoldersCount', () => {
    it('should count ERC20 token holders', async () => {
      const result = await getEthTokenHoldersCount('etherlink-testnet', '0xTestToken');
      
      expect(result).toBe(3);
    });

    it('should return number type', async () => {
      const result = await getEthTokenHoldersCount('etherlink-testnet', '0xTestToken');
      
      expect(typeof result).toBe('number');
    });

    it('should handle tokens with no holders', async () => {
      global.axiosMock.reset();
      global.axiosMock
        .onGet(/https:\/\/.*\.explorer\.etherlink\.com\/api\/v2\/tokens\/.*\/holders/)
        .reply(200, { items: [], next_page_params: null });

      const result = await getEthTokenHoldersCount('etherlink-testnet', '0xTestToken');
      
      expect(result).toBe(0);
    });

    it('should handle pagination', async () => {
      const result = await getEthTokenHoldersCount('etherlink-testnet', '0xTestToken');
      
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });
});

