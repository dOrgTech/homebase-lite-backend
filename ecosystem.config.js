module.exports = {
  apps: [
    {
      name: "homebase-api",
      script: "server.js",
      // Run with Node (project uses CommonJS and dotenv via config.js)
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};

