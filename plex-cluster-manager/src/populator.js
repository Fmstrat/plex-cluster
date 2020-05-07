const { Config } = require('./config');
const Request = require('superagent');
const parseString = require('xml2js').parseString;
const { Db } = require('./db');

const size = 1000;

let _running = false;
let _skipPopulate = false;

class Populator {
    constructor() {
    }

    async xml2json(xml) {
        return new Promise((resolve, reject) => {
            parseString(xml, function (err, json) {
                if (err)
                    reject(err);
                else
                    resolve(json);
            });
    
        });
    }

    async getPage(url, page, quiet) {
        const start = page * size;
        url += `&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`;
        if (!quiet)
            console.log(`  Getting ${size} records starting at ${start}`);
        try {
            const res = await Request.get(url);
            if (res.status == 200) {
                const xml = await this.xml2json(res.text);
                return xml;    
            }
        } catch(err) {
            console.error(`ERROR: ${err.message}`);
        }        
        return null;
    }

    async getAll(url, type, quiet) {
        let data = [];
        let page = 0;
        while (true) {
            const xml = await this.getPage(url, page, quiet);
            data = data.concat(xml.MediaContainer[type])
            if (xml.MediaContainer.$.size < size)
                break;
            page++;
        }
        return data;
    }
    
    async populateSections(host, viewCounts) {
        console.log(`Getting sections for ${host.host}:${host.port}`);
        const db = await Db.get();
        const data = await this.getAll(`https://${host.host}:${host.port}/library/sections/?X-Plex-Token=${host.token}`, 'Directory');
        console.log(`Retrieved ${data.length} records.`);
        for (var i = 0; i < data.length; i++) {
            const record = data[i].$;
            if ((record.type == 'movie' || record.type == 'show') && record.agent != 'com.plexapp.agents.none') {
                await db.runAsync(`
                    INSERT OR REPLACE INTO sections (
                        host,
                        key,
                        type,
                        title
                    ) VALUES (
                        (?),
                        (?),
                        (?),
                        (?)
                    )
                `, [
                    `${host.host}:${host.port}`,
                    record.key,
                    record.type,
                    record.title
                ]);
                await this.populateMedia(host, record, viewCounts);
            }
        }
    }

    async populateMedia(host, section, viewCounts) {
        console.log(`Getting media for ${host.host}:${host.port} - ${section.title} (${section.key})`);
        const db = await Db.get();
        let data = [];
        if (!_skipPopulate)
            data = await this.getAll(`https://${host.host}:${host.port}/library/sections/${section.key}/allLeaves?X-Plex-Token=${host.token}`, 'Video');
        console.log(`Retrieved ${data.length} records.`);
        for (var i = 0; i < data.length; i++) {
            const record = data[i].$;
            if (!record.viewCount) {
                record.viewCount = 0;
            }
            await db.runAsync(`
                INSERT OR REPLACE INTO media (
                    host,
                    section_key,
                    guid,
                    key,
                    ratingKey,
                    title
                ) VALUES (
                    (?),
                    (?),
                    (?),
                    (?),
                    (?),
                    (?)
                )
            `, [
                `${host.host}:${host.port}`,
                section.key,
                record.guid,
                record.key,
                record.ratingKey,
                record.title,
            ]);
        }
        if (viewCounts) {
            // Get users
            const users = await db.allAsync(`
                SELECT username,
                        token,
                        clientIdentifier,
                        max(updated_ts) as updated_ts
                FROM tokens
                WHERE username IS NOT NULL
                GROUP BY username;
            `);
            if (users) {
               // Loop through usernames
                for (var i = 0; i < users.length; i++) {
                    await this.populateViewCounts(host, section, users[i]);
                }   
            }
        }
    }

    async populateViewCounts(host, section, user) {
        // TODO: Expire old tokens
        // Query watched counts
        console.log(`Getting watched stats for ${user.username}@${host.host}:${host.port} - ${section.title} (${section.key})`);
        const db = await Db.get();
        let data = [];
        if (!_skipPopulate)
            data = await this.getAll(`https://${host.host}:${host.port}/library/sections/${section.key}/allLeaves?X-Plex-Token=${user.token}`, 'Video');
        console.log(`Retrieved ${data.length} records.`);
        for (var j = 0; j < data.length; j++) {
            const record = data[j].$;
            if (!record.viewCount) {
                record.viewCount = 0;
            }
            await db.runAsync(`
                INSERT OR REPLACE INTO viewCount (
                    host,
                    username,
                    section_key,
                    guid,
                    key,
                    ratingKey,
                    title,
                    viewCount
                ) VALUES (
                    (?),
                    (?),
                    (?),
                    (?),
                    (?),
                    (?),
                    (?),
                    (?)
                )
            `, [
                `${host.host}:${host.port}`,
                user.username,
                section.key,
                record.guid,
                record.key,
                record.ratingKey,
                record.title,
                record.viewCount
            ]);
        }
    }

    async updateUsernames() {
        console.log(`Updating username list from plex.tv.`);
        const db = await Db.get();
        // Check for null usernames
        const nullUsers = await db.allAsync(`
            SELECT DISTINCT token
            FROM tokens
            WHERE username IS NULL;
        `);
        // Update null usernames from plex.tv
        for (var i = 0; i < nullUsers.length; i++) {
            const identifier = await db.getAsync(`
                SELECT clientIdentifier                        
                FROM tokens
                WHERE token = (?)
                ORDER BY updated_ts DESC
                LIMIT 1;
            `, [
                nullUsers[i].token
            ]);
            if (identifier) {
                var url = `https://plex.tv/api/v2/user?X-Plex-Client-Identifier=${identifier.clientIdentifier}&X-Plex-Token=${nullUsers[i].token}`;
                console.log(url)
                try {
                    const res = await Request.get(url)
                                            .buffer()
                                            .type('xml')
                                            .set('User-Agent', 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:72.0) Gecko/20100101 Firefox/72.0');
                    if (res.status == 200) {
                        const xml = await this.xml2json(res.text);
                        if (xml.user.$.username) {
                        console.log(`Updated token ${nullUsers[i].token} with username ${xml.user.$.username}`);
                        await db.runAsync(`
                            UPDATE tokens
                            SET username = (?)
                            WHERE token = (?)
                            AND   username IS NULL;
                        `, [
                            xml.user.$.username,
                            nullUsers[i].token
                        ]);
                        }
                    }

                } catch(err) {
                    console.error(`ERROR: ${err.message}`);
                }
            }
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async update(viewCounts=false) {
        if (!_running) {
            _running = true;
            const config = await Config.get();
            if (viewCounts) {
                await this.updateUsernames();
            }
            for (var i = 0; i < config.hosts.length; i++) {
                const host = config.hosts[i];
                await this.populateSections(host, viewCounts);
            }
            _running = false;
        } else {
            console.log('[*] A database update is already running, waiting for it to complete.')
            while (_running)
                await this.sleep(2000);
            console.log('[*] Update complete, continuing.')
        }
    }

}
module.exports.Populator = Populator;