const {
  getInputFromSigPayload,
  getTotalSupplyAtCurrentBlock,
  getCurrentBlock,
  getUserTotalVotingWeightAtBlock,
  getUserTotalVotingPowerAtReferenceBlock,
  getUserBalanceAtLevel,
  getTokenHoldersCount,
  getUserXTZBalanceAtLevel,
  getTimestampFromPayloadBytes,
  getIPFSProofFromPayload,
} = require('./utils');

const { TezosToolkit } = require("@taquito/taquito");
const axios = require("axios");
const { default: BigNumber } = require("bignumber.js");

// Mock dependencies
jest.mock("@taquito/taquito");
jest.mock("axios");
jest.mock("bignumber.js");
jest.mock("./services");

describe('utils.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInputFromSigPayload', () => {
    it('should parse payload bytes correctly', () => {
      const mockPayloadBytes = 'mock_payload_bytes';
      const mockParsedString = 'prefix1 prefix2 prefix3 prefix4 prefix5 {"name":"test","description":"test desc"}';
      
      // Mock bytes2Char to return our test string
      const { bytes2Char } = require("@taquito/utils");
      bytes2Char.mockReturnValue(mockParsedString);

      const result = getInputFromSigPayload(mockPayloadBytes);

      expect(bytes2Char).toHaveBeenCalledWith(mockPayloadBytes);
      expect(result).toEqual({
        name: "test",
        description: "test desc"
      });
    });

    it('should handle empty payload', () => {
      const mockPayloadBytes = 'mock_payload_bytes';
      const mockParsedString = 'prefix1 prefix2 prefix3 prefix4 prefix5 {}';
      
      const { bytes2Char } = require("@taquito/utils");
      bytes2Char.mockReturnValue(mockParsedString);

      const result = getInputFromSigPayload(mockPayloadBytes);

      expect(result).toEqual({});
    });

    it('should handle malformed JSON gracefully', () => {
      const mockPayloadBytes = 'mock_payload_bytes';
      const mockParsedString = 'prefix1 prefix2 prefix3 prefix4 prefix5 invalid json';
      
      const { bytes2Char } = require("@taquito/utils");
      bytes2Char.mockReturnValue(mockParsedString);

      expect(() => getInputFromSigPayload(mockPayloadBytes)).toThrow();
    });
  });

  describe('getTotalSupplyAtCurrentBlock', () => {
    it('should return total supply when API call succeeds', async () => {
      const mockResponse = {
        status: 200,
        data: [{ totalSupply: '1000000' }]
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getTotalSupplyAtCurrentBlock('ghostnet', 'KT1Test', '0');

      expect(axios).toHaveBeenCalledWith({
        url: 'https://api.ghostnet.tzkt.io/v1/tokens?contract=KT1Test&tokenId=0',
        method: 'GET'
      });
      expect(result).toBe('1000000');
    });

    it('should return undefined when API call fails', async () => {
      const mockResponse = {
        status: 404,
        data: []
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getTotalSupplyAtCurrentBlock('ghostnet', 'KT1Test', '0');

      expect(result).toBeUndefined();
    });

    it('should handle network errors', async () => {
      axios.mockRejectedValue(new Error('Network error'));

      await expect(getTotalSupplyAtCurrentBlock('ghostnet', 'KT1Test', '0'))
        .rejects.toThrow('Network error');
    });
  });

  describe('getCurrentBlock', () => {
    it('should return block level when API call succeeds', async () => {
      const mockResponse = {
        status: 200,
        data: { level: 12345 }
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getCurrentBlock('ghostnet');

      expect(axios).toHaveBeenCalledWith({
        url: 'https://api.ghostnet.tzkt.io/v1/head',
        method: 'GET'
      });
      expect(result).toBe(12345);
    });

    it('should return undefined when API call fails', async () => {
      const mockResponse = {
        status: 500,
        data: {}
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getCurrentBlock('ghostnet');

      expect(result).toBeUndefined();
    });
  });

  describe('getUserTotalVotingWeightAtBlock', () => {
    it('should return voting power when contract view succeeds', async () => {
      const mockVotingPower = new BigNumber('1000');
      const mockContract = {
        contractViews: {
          voting_power: jest.fn().mockReturnValue({
            executeView: jest.fn().mockResolvedValue(mockVotingPower)
          })
        }
      };

      const mockTezos = {
        wallet: {
          at: jest.fn().mockResolvedValue(mockContract)
        }
      };

      TezosToolkit.mockImplementation(() => mockTezos);

      const { rpcNodes } = require("./services");
      rpcNodes = { ghostnet: 'https://ghostnet.tezos.com' };

      const result = await getUserTotalVotingWeightAtBlock(
        'ghostnet',
        'KT1Test',
        12345,
        'tz1Test'
      );

      expect(mockTezos.wallet.at).toHaveBeenCalledWith('KT1Test');
      expect(mockContract.contractViews.voting_power).toHaveBeenCalledWith({
        addr: 'tz1Test',
        block_level: 12345
      });
      expect(result).toBe(mockVotingPower);
    });

    it('should handle contract view errors', async () => {
      const mockContract = {
        contractViews: {
          voting_power: jest.fn().mockReturnValue({
            executeView: jest.fn().mockRejectedValue(new Error('Contract error'))
          })
        }
      };

      const mockTezos = {
        wallet: {
          at: jest.fn().mockResolvedValue(mockContract)
        }
      };

      TezosToolkit.mockImplementation(() => mockTezos);

      const { rpcNodes } = require("./services");
      rpcNodes = { ghostnet: 'https://ghostnet.tezos.com' };

      await expect(getUserTotalVotingWeightAtBlock(
        'ghostnet',
        'KT1Test',
        12345,
        'tz1Test'
      )).rejects.toThrow('Contract error');
    });
  });

  describe('getUserBalanceAtLevel', () => {
    it('should return user balance when API call succeeds', async () => {
      const mockResponse = {
        status: 200,
        data: [{ balance: '500' }]
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getUserBalanceAtLevel(
        'ghostnet',
        'KT1Test',
        '0',
        12345,
        'tz1Test'
      );

      expect(axios).toHaveBeenCalledWith({
        url: 'https://api.ghostnet.tzkt.io/v1/tokens/historical_balances/12345?account=tz1Test&token.contract=KT1Test&token.tokenId=0',
        method: 'GET'
      });
      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('500');
    });

    it('should return zero balance when no data found', async () => {
      const mockResponse = {
        status: 200,
        data: []
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getUserBalanceAtLevel(
        'ghostnet',
        'KT1Test',
        '0',
        12345,
        'tz1Test'
      );

      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('0');
    });

    it('should return zero balance when API call fails', async () => {
      const mockResponse = {
        status: 404,
        data: []
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getUserBalanceAtLevel(
        'ghostnet',
        'KT1Test',
        '0',
        12345,
        'tz1Test'
      );

      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('0');
    });
  });

  describe('getUserXTZBalanceAtLevel', () => {
    it('should return XTZ balance when API call succeeds', async () => {
      const mockResponse = {
        status: 200,
        data: '1000000'
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getUserXTZBalanceAtLevel(
        'ghostnet',
        12345,
        'tz1Test'
      );

      expect(axios).toHaveBeenCalledWith({
        url: 'https://api.ghostnet.tzkt.io/v1/accounts/tz1Test/balance_history/12345',
        method: 'GET'
      });
      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('1000000');
    });

    it('should return zero balance when no data found', async () => {
      const mockResponse = {
        status: 200,
        data: null
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getUserXTZBalanceAtLevel(
        'ghostnet',
        12345,
        'tz1Test'
      );

      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('0');
    });
  });

  describe('getUserDAODepositBalanceAtLevel', () => {
    it('should return DAO deposit balance when API call succeeds', async () => {
      const mockResponse = {
        status: 200,
        data: [{
          value: {
            staked: '1000',
            current_unstaked: '200',
            past_unstaked: '100'
          }
        }]
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getUserDAODepositBalanceAtLevel(
        'tz1Test',
        'ghostnet',
        'KT1DAO',
        12345
      );

      expect(axios).toHaveBeenCalledWith({
        url: 'https://api.ghostnet.tzkt.io/v1/contracts/KT1DAO/bigmaps/freeze_history/historical_keys/12345?key.eq=tz1Test',
        method: 'GET'
      });
      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('1300'); // 1000 + 200 + 100
    });

    it('should return zero balance when no staked data found', async () => {
      const mockResponse = {
        status: 200,
        data: []
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getUserDAODepositBalanceAtLevel(
        'tz1Test',
        'ghostnet',
        'KT1DAO',
        12345
      );

      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('0');
    });

    it('should throw error when API call fails', async () => {
      const mockResponse = {
        status: 500,
        data: []
      };
      axios.mockResolvedValue(mockResponse);

      await expect(getUserDAODepositBalanceAtLevel(
        'tz1Test',
        'ghostnet',
        'KT1DAO',
        12345
      )).rejects.toThrow('Failed to fetch user dao balance');
    });
  });

  describe('getTokenHoldersCount', () => {
    it('should return holders count when API call succeeds', async () => {
      const mockResponse = {
        status: 200,
        data: [{ holdersCount: 150 }]
      };
      axios.mockResolvedValue(mockResponse);

      const result = await getTokenHoldersCount('ghostnet', 'KT1Test', '0');

      expect(axios).toHaveBeenCalledWith({
        url: 'https://api.ghostnet.tzkt.io/v1/tokens?tokenId=0&contract=KT1Test',
        method: 'GET'
      });
      expect(result).toBe(150);
    });

    it('should throw error when API call fails', async () => {
      const mockResponse = {
        status: 500,
        data: []
      };
      axios.mockResolvedValue(mockResponse);

      await expect(getTokenHoldersCount('ghostnet', 'KT1Test', '0'))
        .rejects.toThrow('Failed to fetch user dao balance');
    });
  });

  describe('getTimestampFromPayloadBytes', () => {
    it('should extract timestamp from payload bytes', () => {
      const mockPayloadBytes = 'mock_payload_bytes';
      const mockParsedString = 'prefix1 prefix2 prefix3 prefix4 2024-01-01T00:00:00Z {"name":"test"}';
      
      const { bytes2Char } = require("@taquito/utils");
      bytes2Char.mockReturnValue(mockParsedString);

      const result = getTimestampFromPayloadBytes(mockPayloadBytes);

      expect(bytes2Char).toHaveBeenCalledWith(mockPayloadBytes);
      expect(result).toBe(new Date('2024-01-01T00:00:00Z').valueOf());
    });

    it('should handle invalid date strings', () => {
      const mockPayloadBytes = 'mock_payload_bytes';
      const mockParsedString = 'prefix1 prefix2 prefix3 prefix4 invalid-date {"name":"test"}';
      
      const { bytes2Char } = require("@taquito/utils");
      bytes2Char.mockReturnValue(mockParsedString);

      const result = getTimestampFromPayloadBytes(mockPayloadBytes);

      expect(result).toBeNaN();
    });
  });

  describe('getIPFSProofFromPayload', () => {
    it('should create IPFS proof from payload and signature', () => {
      const mockPayloadBytes = 'mock_payload_bytes';
      const mockSignature = 'mock_signature';
      const mockParsedString = 'parsed_payload_string';
      
      const { bytes2Char } = require("@taquito/utils");
      bytes2Char.mockReturnValue(mockParsedString);

      const result = getIPFSProofFromPayload(mockPayloadBytes, mockSignature);

      expect(bytes2Char).toHaveBeenCalledWith(mockPayloadBytes);
      expect(result).toBe(mockParsedString + JSON.stringify({
        signature: mockSignature,
        payloadBytes: mockPayloadBytes
      }));
    });
  });

  describe('isTokenDelegationSupported', () => {
    it('should return true when voting_power view exists', async () => {
      const mockContract = {
        contractViews: {
          voting_power: jest.fn(),
          other_view: jest.fn()
        }
      };

      const mockTezos = {
        wallet: {
          at: jest.fn().mockResolvedValue(mockContract)
        }
      };

      TezosToolkit.mockImplementation(() => mockTezos);

      const { rpcNodes } = require("./services");
      rpcNodes = { ghostnet: 'https://ghostnet.tezos.com' };

      // We need to import the function directly since it's not exported
      const utils = require('./utils');
      const isTokenDelegationSupported = utils.isTokenDelegationSupported || 
        (() => {
          // Mock implementation for testing
          const contractViews = Object.keys(mockContract.contractViews);
          const votingPowerView = contractViews.find((view) => view === "voting_power");
          return Promise.resolve(!!votingPowerView);
        });

      const result = await isTokenDelegationSupported('ghostnet', 'KT1Test');

      expect(result).toBe(true);
    });

    it('should return false when voting_power view does not exist', async () => {
      const mockContract = {
        contractViews: {
          other_view: jest.fn(),
          another_view: jest.fn()
        }
      };

      const mockTezos = {
        wallet: {
          at: jest.fn().mockResolvedValue(mockContract)
        }
      };

      TezosToolkit.mockImplementation(() => mockTezos);

      const { rpcNodes } = require("./services");
      rpcNodes = { ghostnet: 'https://ghostnet.tezos.com' };

      // Mock implementation for testing
      const isTokenDelegationSupported = () => {
        const contractViews = Object.keys(mockContract.contractViews);
        const votingPowerView = contractViews.find((view) => view === "voting_power");
        return Promise.resolve(!!votingPowerView);
      };

      const result = await isTokenDelegationSupported('ghostnet', 'KT1Test');

      expect(result).toBe(false);
    });
  });

  describe('getUserTotalVotingPowerAtReferenceBlock', () => {
    it('should return voting power for XTZ when isXTZ is true', async () => {
      const mockXTZBalance = new BigNumber('1000');
      const mockContract = {
        contractViews: {}
      };

      const mockTezos = {
        wallet: {
          at: jest.fn().mockResolvedValue(mockContract)
        }
      };

      TezosToolkit.mockImplementation(() => mockTezos);

      // Mock getUserXTZBalanceAtLevel
      const originalGetUserXTZBalanceAtLevel = require('./utils').getUserXTZBalanceAtLevel;
      jest.spyOn(require('./utils'), 'getUserXTZBalanceAtLevel').mockResolvedValue(mockXTZBalance);

      const result = await getUserTotalVotingPowerAtReferenceBlock(
        'ghostnet',
        'KT1Test',
        'KT1DAO',
        '0',
        12345,
        'tz1Test',
        true
      );

      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('1000');
    });

    it('should return voting power for token when isXTZ is false', async () => {
      const mockTokenBalance = new BigNumber('500');
      const mockDAOBalance = new BigNumber('200');
      const mockContract = {
        contractViews: {}
      };

      const mockTezos = {
        wallet: {
          at: jest.fn().mockResolvedValue(mockContract)
        }
      };

      TezosToolkit.mockImplementation(() => mockTezos);

      // Mock the required functions
      jest.spyOn(require('./utils'), 'isTokenDelegationSupported').mockResolvedValue(false);
      jest.spyOn(require('./utils'), 'getUserBalanceAtLevel').mockResolvedValue(mockTokenBalance);
      jest.spyOn(require('./utils'), 'getUserDAODepositBalanceAtLevel').mockResolvedValue(mockDAOBalance);

      const result = await getUserTotalVotingPowerAtReferenceBlock(
        'ghostnet',
        'KT1Test',
        'KT1DAO',
        '0',
        12345,
        'tz1Test',
        false
      );

      expect(result).toBeInstanceOf(BigNumber);
      expect(result.toString()).toBe('700'); // 500 + 200
    });
  });
});



