const isServerless = process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL || process.env.NETLIFY_DEV;

const noOpCache = {
  getSync: () => null,
  put: (key, value, callback) => {
    if (callback) callback(null);
  },
  clear: (callback) => {
    if (callback) callback(null);
  }
};

let dbCache;

if (isServerless) {
  dbCache = noOpCache;
} else {
  try {
    const cache = require('persistent-cache');
    dbCache = cache({
      base: './node_modules/.cache/',
      name: 'mongo',
    });
  } catch (error) {
    if (error.code === 'EROFS' || error.message.includes('read-only file system')) {
      console.warn('Read-only filesystem detected, disabling persistent cache');
      dbCache = noOpCache;
    } else {
      console.warn('Failed to initialize persistent cache, using in-memory fallback:', error.message);
      dbCache = noOpCache;
    }
  }
}

module.exports = dbCache;