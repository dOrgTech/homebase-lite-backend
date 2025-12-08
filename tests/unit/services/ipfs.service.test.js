const { uploadToIPFS } = require('../../../services/ipfs.service');

jest.mock('nft.storage', () => {
  return {
    NFTStorage: jest.fn().mockImplementation(() => ({
      storeBlob: jest.fn().mockResolvedValue('bafybeitest123')
    }))
  };
});

describe('IPFS Service', () => {
  describe('uploadToIPFS', () => {
    it('should upload JSON data to IPFS', async () => {
      const jsonData = JSON.stringify({ test: 'data' });
      
      const cid = await uploadToIPFS(jsonData);
      
      expect(cid).toBe('bafybeitest123');
    });

    it('should convert JSON to blob', async () => {
      const jsonData = JSON.stringify({ key: 'value' });
      
      const cid = await uploadToIPFS(jsonData);
      
      expect(cid).toBeDefined();
      expect(typeof cid).toBe('string');
    });

    it('should handle complex JSON objects', async () => {
      const complexData = JSON.stringify({
        poll: {
          name: 'Test',
          choices: ['Yes', 'No'],
          metadata: { nested: { value: 123 } }
        }
      });
      
      const cid = await uploadToIPFS(complexData);
      
      expect(cid).toBe('bafybeitest123');
    });

    it('should handle empty JSON', async () => {
      const jsonData = JSON.stringify({});
      
      const cid = await uploadToIPFS(jsonData);
      
      expect(cid).toBeDefined();
    });

    it('should handle large JSON payloads', async () => {
      const largeData = JSON.stringify({
        data: new Array(1000).fill({ value: 'test' })
      });
      
      const cid = await uploadToIPFS(largeData);
      
      expect(cid).toBeDefined();
    });
  });
});

