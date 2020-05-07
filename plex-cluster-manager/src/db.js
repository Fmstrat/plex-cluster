const SQL = require('sqlite3')

let _db = null;
let _dbDebug = false;

class Db {

    static async init() {        
        //console.log("Db init");
        if (!_db) {
            _db = new SQL.Database('/data/plex-cluster.db');
            _db.getAsync = function (sql, params) {
                if (process.env.DEBUG && _dbDebug) console.log(`DEBUG: ${sql.replace(/\s\s+/g, ' ')}`);
                var that = this;
                return new Promise(function (resolve, reject) {
                    that.get(sql, params, function (err, row) {
                        if (err) {
                            console.error(err);
                            reject(err);
                        } else
                            resolve(row);
                    });
                });
            };
            _db.allAsync = function (sql, params) {
                if (process.env.DEBUG && _dbDebug) console.log(`DEBUG: ${sql.replace(/\s\s+/g, ' ')}`);
                var that = this;
                return new Promise(function (resolve, reject) {
                    that.all(sql, params, function (err, rows) {
                        if (err) {
                            console.error(err);
                            reject(err);
                        } else
                            resolve(rows);
                    });
                });
            };
            _db.runAsync = function (sql, params) {
                if (process.env.DEBUG && _dbDebug) console.log(`DEBUG: ${sql.replace(/\s\s+/g, ' ')}`);
                var that = this;
                return new Promise(function (resolve, reject) {
                    that.run(sql, params, function (err, row) {
                        if (err) {
                            console.error(err);
                            reject(err);
                        } else
                            resolve(row);
                    });
                });
            }; 
        }
    }

    static async build() {
        await _db.runAsync(`
            CREATE TABLE IF NOT EXISTS sections (
                host TEXT NOT NULL,
                key INTEGER NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                UNIQUE (
                    host,
                    key,
                    type
                )
                ON CONFLICT REPLACE
            );
        `);
        await _db.runAsync(`
            CREATE TABLE IF NOT EXISTS media (
                host TEXT NOT NULL,
                section_key INTEGER NOT NULL,
                guid TEXT NOT NULL,
                key TEXT NOT NULL,
                ratingKey INTEGER NOT NULL,
                title TEXT NOT NULL,
                UNIQUE (
                    host,
                    section_key,
                    guid
                )
                ON CONFLICT REPLACE
            );
        `);
        await _db.runAsync(`
            CREATE TABLE IF NOT EXISTS tokens (
                host TEXT NOT NULL,
                token TEXT NOT NULL,
                clientIdentifier TEXT NOT NULL,
                username TEXT,
                updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (
                    host,
                    token
                )
                ON CONFLICT REPLACE
            );
        `);
        await _db.runAsync(`
            CREATE TABLE IF NOT EXISTS viewCount (
                host TEXT NOT NULL,
                username TEXT NOT NULL,
                section_key INTEGER NOT NULL,
                guid TEXT NOT NULL,
                key TEXT NOT NULL,
                ratingKey INTEGER NOT NULL,
                title TEXT NOT NULL,
                viewCount INTEGER NOT NULL,
                UNIQUE (
                    host,
                    username,
                    guid
                )
                ON CONFLICT REPLACE
            );
        `);        
    }

    static async get() {
        //console.log("Db get");
        if (!_db)
            await this.init();
        return _db;
    }

    static async close() {
        //console.log("Db close");
        if (!_db)
            _db.close();
    }

}
module.exports.Db = Db;
