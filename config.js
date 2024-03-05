require("dotenv").config({ path: "./config.env" });

const AppConfig = {
    ServerPort: process.env.PORT || 5000,
    IPFS: {
        NFT_STORAGE_TOKEN: process.env.NFT_STORAGE_KEY,
    }
}

module.exports = AppConfig