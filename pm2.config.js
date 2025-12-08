module.exports = {
    name: "homebase-api",
    script: "server.js", 
    // Use Node.js to run the server to avoid Bun-specific HTTP decompression issues
    interpreter: "node",
};
