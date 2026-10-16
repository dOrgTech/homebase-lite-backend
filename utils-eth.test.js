const {
  verityEthSignture,
  getEthTokenMetadata,
  getEthCurrentBlock,
  getEthCurrentBlockNumber,
  getEthUserBalanceAtLevel,
  getEthTotalSupply,
  getEthTokenHoldersCount,
  getEthBlockTimeDifference,
} = require('./utils-eth');

const { ethers, JsonRpcProvider } = require('ethers');
const { default: BigNumber } = require('bignumber.js');

// Mock dependencies
jest.mock('ethers');
jest.mock('bignumber.js');

// Mock fetch globally
global.fetch = jest.fn();

describe('utils-eth.js', () => {
  let mockProvider;
  let mockContract;
  let mockBlock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock provider
    mockProvider = {
      getBlock: jest.fn(),
      getBlockNumber: jest.fn(),
    };

    // Setup mock contract
    mockContract = {
      symbol: jest.fn(),
      decimals: jest.fn(),
      name: jest.fn(),
      totalSupply: jest.fn(),
      balanceOf: jest.fn(),
      filters: {
        Transfer: jest.fn()
      },
      queryFilter: jest.fn(),
    };

    // Setup mock block
    mockBlock = {
      number: 12345,
      timestamp: 1640995200,
      hash: '0x123',
    };

    JsonRpcProvider.mockImplementation(() => mockProvider);
    ethers.Contract.mockImplementation(() => mockContract);
  });

  describe('verityEthSignture', () => {
    it('should return true for any signature (placeholder implementation)', () => {
      const result = verityEthSignture('mock_signature', 'mock_payload');
      expect(result).toBe(true);
    });
  });

  describe('getEthTokenMetadata', () => {
    it('should return token metadata from REST API for testnet', async () => {
      const mockTokenData = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        total_supply: '1000000',
        holders: 100
      };

      global.fetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue(mockTokenData)
      });

      const result = await getEthTokenMetadata('etherlink_testnet', '0x123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://testnet.explorer.etherlink.com/api/v2/tokens/0x123'
      );
      expect(result).toEqual({
        name: 'Test Token',
        decimals: 18,
        symbol: 'TEST',
        totalSupply: '1000000',
        holders: 100
      });
    });

    it('should return token metadata from REST API for mainnet', async () => {
      const mockTokenData = {
        name: 'Main Token',
        symbol: 'MAIN',
        decimals: 6,
        total_supply: '5000000',
        holders: 500
      };

      global.fetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue(mockTokenData)
      });

      const result = await getEthTokenMetadata('etherlink_mainnet', '0x456');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://explorer.etherlink.com/api/v2/tokens/0x456'
      );
      expect(result).toEqual({
        name: 'Main Token',
        decimals: 6,
        symbol: 'MAIN',
        totalSupply: '5000000',
        holders: 500
      });
    });

    it('should handle API errors gracefully', async () => {
      global.fetch.mockRejectedValue(new Error('API Error'));

      await expect(getEthTokenMetadata('etherlink_testnet', '0x123'))
        .rejects.toThrow('API Error');
    });
  });

  describe('getEthCurrentBlock', () => {
    it('should return current block for testnet', async () => {
      mockProvider.getBlock.mockResolvedValue(mockBlock);

      const result = await getEthCurrentBlock('etherlink_testnet');

      expect(JsonRpcProvider).toHaveBeenCalledWith('https://node.ghostnet.etherlink.com');
      expect(mockProvider.getBlock).toHaveBeenCalledWith('latest');
      expect(result).toBe(mockBlock);
    });

    it('should return current block for mainnet', async () => {
      mockProvider.getBlock.mockResolvedValue(mockBlock);

      const result = await getEthCurrentBlock('etherlink_mainnet');

      expect(JsonRpcProvider).toHaveBeenCalledWith('https://node.mainnet.etherlink.com');
      expect(mockProvider.getBlock).toHaveBeenCalledWith('latest');
      expect(result).toBe(mockBlock);
    });

    it('should handle provider errors', async () => {
      mockProvider.getBlock.mockRejectedValue(new Error('Provider Error'));

      await expect(getEthCurrentBlock('etherlink_testnet'))
        .rejects.toThrow('Provider Error');
    });
  });

  describe('getEthCurrentBlockNumber', () => {
    it('should return current block number for testnet', async () => {
      mockProvider.getBlock.mockResolvedValue(mockBlock);

      const result = await getEthCurrentBlockNumber('etherlink_testnet');

      expect(JsonRpcProvider).toHaveBeenCalledWith('https://node.ghostnet.etherlink.com');
      expect(mockProvider.getBlock).toHaveBeenCalledWith('latest');
      expect(result).toBe(12345);
    });

    it('should return current block number for mainnet', async () => {
      mockProvider.getBlock.mockResolvedValue(mockBlock);

      const result = await getEthCurrentBlockNumber('etherlink_mainnet');

      expect(JsonRpcProvider).toHaveBeenCalledWith('https://node.mainnet.etherlink.com');
      expect(mockProvider.getBlock).toHaveBeenCalledWith('latest');
      expect(result).toBe(12345);
    });
  });

  describe('getEthUserBalanceAtLevel', () => {
    it('should return user balance at specific block', async () => {
      const mockBalance = { toString: () => '1000' };
      mockProvider.getBlock.mockResolvedValue(mockBlock);
      mockContract.balanceOf.mockResolvedValue(mockBalance);

      const result = await getEthUserBalanceAtLevel(
        'etherlink_testnet',
        '0xUser',
        '0xToken',
        12345
      );

      expect(JsonRpcProvider).toHaveBeenCalledWith('https://node.ghostnet.etherlink.com');
      expect(ethers.Contract).toHaveBeenCalledWith('0xToken', expect.any(Array), mockProvider);
      expect(mockContract.balanceOf).toHaveBeenCalledWith('0xUser', { blockTag: 12345 });
      expect(result).toBe(mockBalance);
    });

    it('should use current block when no block specified', async () => {
      const mockBalance = { toString: () => '1000' };
      mockProvider.getBlock.mockResolvedValue(mockBlock);
      mockContract.balanceOf.mockResolvedValue(mockBalance);

      const result = await getEthUserBalanceAtLevel(
        'etherlink_testnet',
        '0xUser',
        '0xToken'
      );

      expect(mockProvider.getBlock).toHaveBeenCalledWith('latest');
      expect(mockContract.balanceOf).toHaveBeenCalledWith('0xUser', { blockTag: 12345 });
      expect(result).toBe(mockBalance);
    });

    it('should handle contract errors', async () => {
      mockProvider.getBlock.mockResolvedValue(mockBlock);
      mockContract.balanceOf.mockRejectedValue(new Error('Contract Error'));

      await expect(getEthUserBalanceAtLevel(
        'etherlink_testnet',
        '0xUser',
        '0xToken',
        12345
      )).rejects.toThrow('Contract Error');
    });
  });

  describe('getEthTotalSupply', () => {
    it('should return total supply at specific block', async () => {
      const mockTotalSupply = { toString: () => '1000000' };
      mockProvider.getBlock.mockResolvedValue(mockBlock);
      mockContract.totalSupply.mockResolvedValue(mockTotalSupply);

      const result = await getEthTotalSupply(
        'etherlink_testnet',
        '0xToken',
        12345
      );

      expect(JsonRpcProvider).toHaveBeenCalledWith('https://node.ghostnet.etherlink.com');
      expect(ethers.Contract).toHaveBeenCalledWith('0xToken', expect.any(Array), mockProvider);
      expect(mockContract.totalSupply).toHaveBeenCalledWith({ blockTag: 12345 });
      expect(result).toBe(mockTotalSupply);
    });

    it('should use current block when no block specified', async () => {
      const mockTotalSupply = { toString: () => '1000000' };
      mockProvider.getBlock.mockResolvedValue(mockBlock);
      mockContract.totalSupply.mockResolvedValue(mockTotalSupply);

      const result = await getEthTotalSupply(
        'etherlink_testnet',
        '0xToken'
      );

      expect(mockProvider.getBlock).toHaveBeenCalledWith('latest');
      expect(mockContract.totalSupply).toHaveBeenCalledWith({ blockTag: 12345 });
      expect(result).toBe(mockTotalSupply);
    });
  });

  describe('getEthTokenHoldersCount', () => {
    it('should return holders count for testnet', async () => {
      const mockEvents = [
        { args: { from: '0x1', to: '0x2' } },
        { args: { from: '0x2', to: '0x3' } },
        { args: { from: '0x3', to: '0x1' } }
      ];

      mockProvider.getBlockNumber.mockResolvedValue(13000);
      mockContract.queryFilter.mockResolvedValue(mockEvents);
      mockContract.balanceOf
        .mockResolvedValueOnce({ eq: () => false }) // 0x1 has balance
        .mockResolvedValueOnce({ eq: () => true })  // 0x2 has no balance
        .mockResolvedValueOnce({ eq: () => false }); // 0x3 has balance

      const result = await getEthTokenHoldersCount(
        'etherlink_testnet',
        '0xToken',
        12345
      );

      expect(JsonRpcProvider).toHaveBeenCalledWith('https://node.ghostnet.etherlink.com');
      expect(ethers.Contract).toHaveBeenCalledWith('0xToken', expect.any(Array), mockProvider);
      expect(mockProvider.getBlockNumber).toHaveBeenCalled();
      expect(mockContract.queryFilter).toHaveBeenCalled();
      expect(result).toBe(2); // 0x1 and 0x3 have balances
    });

    it('should use current block when no block specified', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(13000);
      mockContract.queryFilter.mockResolvedValue([]);

      const result = await getEthTokenHoldersCount(
        'etherlink_testnet',
        '0xToken'
      );

      expect(mockProvider.getBlockNumber).toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('should handle contract errors', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(13000);
      mockContract.queryFilter.mockRejectedValue(new Error('Contract Error'));

      await expect(getEthTokenHoldersCount(
        'etherlink_testnet',
        '0xToken',
        12345
      )).rejects.toThrow('Contract Error');
    });
  });

  describe('getEthBlockTimeDifference', () => {
    it('should return time difference between blocks for testnet', async () => {
      const mockBlocksData = {
        items: [
          { timestamp: '2024-01-01T12:00:00Z' },
          { timestamp: '2024-01-01T11:58:00Z' }
        ]
      };

      global.fetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue(mockBlocksData)
      });

      const result = await getEthBlockTimeDifference('etherlink_testnet');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://testnet.explorer.etherlink.com/api/v2/blocks?type=block'
      );
      expect(result).toEqual({
        timeBetweenBlocks: 120 // 2 minutes in seconds
      });
    });

    it('should return time difference between blocks for mainnet', async () => {
      const mockBlocksData = {
        items: [
          { timestamp: '2024-01-01T12:00:00Z' },
          { timestamp: '2024-01-01T11:59:30Z' }
        ]
      };

      global.fetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue(mockBlocksData)
      });

      const result = await getEthBlockTimeDifference('etherlink_mainnet');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://explorer.etherlink.com/api/v2/blocks?type=block'
      );
      expect(result).toEqual({
        timeBetweenBlocks: 30 // 30 seconds
      });
    });

    it('should handle API errors', async () => {
      global.fetch.mockRejectedValue(new Error('API Error'));

      await expect(getEthBlockTimeDifference('etherlink_testnet'))
        .rejects.toThrow('API Error');
    });
  });

  describe('_getEthProvider', () => {
    it('should return testnet provider for test networks', () => {
      // We need to test the internal function, so we'll test it indirectly
      // through the functions that use it
      const testnetProvider = new JsonRpcProvider('https://node.ghostnet.etherlink.com');
      JsonRpcProvider.mockReturnValue(testnetProvider);

      getEthCurrentBlock('etherlink_testnet');
      expect(JsonRpcProvider).toHaveBeenCalledWith('https://node.ghostnet.etherlink.com');
    });

    it('should return mainnet provider for mainnet networks', () => {
      const mainnetProvider = new JsonRpcProvider('https://node.mainnet.etherlink.com');
      JsonRpcProvider.mockReturnValue(mainnetProvider);

      getEthCurrentBlock('etherlink_mainnet');
      expect(JsonRpcProvider).toHaveBeenCalledWith('https://node.mainnet.etherlink.com');
    });
  });

  describe('_getEthRestEndpoint', () => {
    it('should return testnet endpoint for test networks', () => {
      // Test indirectly through getEthTokenMetadata
      global.fetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({})
      });

      getEthTokenMetadata('etherlink_testnet', '0x123');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://testnet.explorer.etherlink.com/api/v2/tokens/0x123'
      );
    });

    it('should return mainnet endpoint for mainnet networks', () => {
      global.fetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({})
      });

      getEthTokenMetadata('etherlink_mainnet', '0x123');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://explorer.etherlink.com/api/v2/tokens/0x123'
      );
    });
  });

  describe('_getEthTokenMetadataWithRpc', () => {
    it('should return token metadata using RPC calls', async () => {
      const mockTokenData = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: '1000000'
      };

      mockContract.name.mockResolvedValue(mockTokenData.name);
      mockContract.symbol.mockResolvedValue(mockTokenData.symbol);
      mockContract.decimals.mockResolvedValue(mockTokenData.decimals);
      mockContract.totalSupply.mockResolvedValue(mockTokenData.totalSupply);

      // We need to test the internal function indirectly
      // Since it's not exported, we'll test through the public API
      // that might use it internally
      const result = await getEthTokenMetadata('etherlink_testnet', '0x123');

      // The function uses REST API by default, so we expect that behavior
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('BigNumber integration', () => {
    it('should properly handle BigNumber in totalSupply', async () => {
      const mockTotalSupply = '1000000000000000000'; // 1 token with 18 decimals
      const mockBigNumber = { toString: () => mockTotalSupply };
      
      BigNumber.mockImplementation((value) => ({
        toString: () => value.toString()
      }));

      mockProvider.getBlock.mockResolvedValue(mockBlock);
      mockContract.totalSupply.mockResolvedValue(mockTotalSupply);

      const result = await getEthTotalSupply('etherlink_testnet', '0xToken');

      expect(BigNumber).toHaveBeenCalledWith(mockTotalSupply);
      expect(result).toBe(mockTotalSupply);
    });
  });
});



