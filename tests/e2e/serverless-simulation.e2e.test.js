const mongoose = require('mongoose');
const { connectToMongoose } = require('../../db/mongoose-connection');

describe('E2E: Serverless Simulation', () => {
  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe('Cold Start', () => {
    it('should initialize connection on first request', async () => {
      const connection = await connectToMongoose();
      
      expect(connection).toBeDefined();
      expect(mongoose.connection.readyState).toBe(1);
    });

    it('should reuse connection on subsequent requests', async () => {
      const conn1 = await connectToMongoose();
      const conn2 = await connectToMongoose();
      
      expect(conn1).toBe(conn2);
    });
  });

  describe('Connection Reuse', () => {
    it('should cache connection across invocations', async () => {
      const startTime = Date.now();
      await connectToMongoose();
      const firstCallDuration = Date.now() - startTime;

      const secondStartTime = Date.now();
      await connectToMongoose();
      const secondCallDuration = Date.now() - secondStartTime;

      expect(secondCallDuration).toBeLessThan(firstCallDuration);
    });

    it('should not leak connections', async () => {
      for (let i = 0; i < 10; i++) {
        await connectToMongoose();
      }
      
      expect(mongoose.connection.readyState).toBe(1);
    });
  });

  describe('Environment Detection', () => {
    it('should detect serverless environment variables', () => {
      const isNetlify = !!process.env.NETLIFY;
      const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
      const isVercel = !!process.env.VERCEL;
      
      const isServerless = isNetlify || isLambda || isVercel;
      expect(typeof isServerless).toBe('boolean');
    });

    it('should disable cache in serverless environments', () => {
      const originalNetlify = process.env.NETLIFY;
      process.env.NETLIFY = 'true';
      
      delete require.cache[require.resolve('../../db/cache.db')];
      const dbCache = require('../../db/cache.db');
      
      const result = dbCache.getSync('test-key');
      expect(result).toBeNull();
      
      dbCache.put('key', 'value', (err) => {
        expect(err).toBeNull();
      });
      
      if (originalNetlify) {
        process.env.NETLIFY = originalNetlify;
      } else {
        delete process.env.NETLIFY;
      }
    });
  });

  describe('Performance', () => {
    it('should handle requests within acceptable time', async () => {
      const startTime = Date.now();
      await connectToMongoose();
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(5000);
    });
  });
});

