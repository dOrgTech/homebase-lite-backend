const dbCache = require('../cache.db');

const cachingPlugin = (modelName) => (schema) => {
    // Middleware to check cache before executing find query
    schema.pre('find', async function(next) {
      const cacheKey = `${modelName}_find_${JSON.stringify(this.getQuery())}`;
      const cachedResult = dbCache.getSync(cacheKey);
  
      if (cachedResult) {
        this.result = cachedResult;
        return next();
      }
  
      next();
    });
  
    // Middleware to cache results after find query
    schema.post('find', function(docs) {
      const cacheKey = `${modelName}_find_${JSON.stringify(this.getQuery())}`;
      dbCache.put(cacheKey, docs, (err) => {
        if (err) console.error(`Error caching ${modelName} find results:`, err);
      });
    });
  
    // Middleware to invalidate cache on save
    schema.post('save', function() {
      dbCache.clear((err) => {
        if (err) console.error(`Error clearing ${modelName} cache:`, err);
      });
    });

    // Middleware to handle create operation
    schema.post('create', function(docs) {
        const cacheKey = `${modelName}_find_${JSON.stringify(this.getQuery())}`;
        dbCache.clear((err) => {
        if (err) console.error(`Error clearing ${modelName} cache after create:`, err);
        });
    });   
  
    // Middleware to invalidate cache on update
    schema.post('updateOne', function() {
      dbCache.clear((err) => {
        if (err) console.error(`Error clearing ${modelName} cache:`, err);
      });
    });
  
    // Middleware to invalidate cache on delete
    schema.post('deleteOne', function() {
      dbCache.clear((err) => {
        if (err) console.error(`Error clearing ${modelName} cache:`, err);
      });
    });
};
  
  
module.exports = cachingPlugin;