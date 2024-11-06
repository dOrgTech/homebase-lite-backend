const cache = require('persistent-cache');

const dbCache = cache({
    base:'./node_modules/.cache/',
    name:'mongo',
})

module.exports = dbCache