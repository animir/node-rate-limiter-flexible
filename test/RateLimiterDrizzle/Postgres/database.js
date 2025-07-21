const {drizzle} = require("drizzle-orm/node-postgres")

const db = drizzle("postgres://root:secret@127.0.0.1:5432")

module.exports = {
    db
}