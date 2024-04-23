const AppConfig = require('../config')

const { NFTStorage } = require('nft.storage')
const NFT_STORAGE_KEY = AppConfig.IPFS.NFT_STORAGE_TOKEN

async function uploadToIPFS(jsonData) {
    const data = new Blob([jsonData], { type: 'text/plain' })
    const client = new NFTStorage({ token: NFT_STORAGE_KEY })
    const cid = await client.storeBlob(data)
    return cid
}

module.exports = {
    uploadToIPFS
}
