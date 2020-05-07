const Request = require('superagent');
const URL = require('url');
const QueryString = require('querystring');
const { Db } = require('./db');
const { Config } = require('./config');
const { Populator } = require('./populator');

class Processor {
    constructor() {
    }

    async syncAll() {
        // Check for mismatched 0 vs > 0
        // Loop through results
        // Call api to other servers to update
        console.log(`Syncing watched status.`);
        const db = await Db.get();
        const media = await db.allAsync(`
            SELECT DISTINCT v.*,
                            (
                                SELECT t.token
                                FROM tokens t
                                WHERE t.username = v.username
                                ORDER BY t.updated_ts DESC
                                LIMIT 1
                            ) AS token,
                            v2.host AS hostGreater,
                            v2.viewCount AS viewCountGreater
            FROM viewCount v,
                 viewCount v2
            WHERE v.viewCount = 0
            AND   v2.viewCount > 0
            AND   v.guid = v2.guid
            AND   v.host != v2.host
            AND (
                SELECT title
                FROM sections
                WHERE key = v.section_key
            ) = (
                SELECT title
                FROM sections
                WHERE key = v2.section_key                
            );
        `);
        for (var i = 0; i < media.length; i++) {
            console.log(`Syncing watched status for ${media[i].username}@${media[i].host} - ${media[i].title} (${media[i].guid})`);
            const url = `https://${media[i].host}/:/scrobble?identifier=com.plexapp.plugins.library&key=${media[i].ratingKey}&ratingKey=${media[i].ratingKey}&X-Plex-Token=${media[i].token}&plex-cluster=1`;
            try {
                const res = await Request.get(url);
                if (res.status == 200) {
                    console.log(`Marked ${media[i].username}@${media[i].host} - ${media[i].title} (${media[i].guid}) watched.`);
                } else {
                    console.error(`Error marking ${media[i].username}@${media[i].host} - ${media[i].title} (${media[i].guid}) watched.`);
                }
            } catch(err) {
                console.error(`ERROR: ${err.message}`);
            }        
        }
    }

    async syncItem(data) {
        if (process.env.DEBUG) console.log(`DEBUG: ${data.uri}`);
        const uri = URL.parse(data.uri);
        const type = uri.pathname.slice(3, uri.pathname.length);
        let qs = QueryString.parse(uri.query);
        if (!qs['X-Plex-Token'] && data.token != '')
            qs['X-Plex-Token'] = data.token;
        if (!qs['X-Plex-Client-Identifier'] && data.identifier != '')
            qs['X-Plex-Client-Identifier'] = data.identifier;
        if (qs['X-Plex-Token']) {
            const db = await Db.get();
            await db.runAsync(`
                INSERT INTO tokens (
                    host,
                    token,
                    clientIdentifier,
                    updated_ts
                ) VALUES (
                    (?),
                    (?),
                    (?),
                    CURRENT_TIMESTAMP
                )
            `, [
                data.host,
                qs['X-Plex-Token'],
                qs['X-Plex-Client-Identifier']
            ]);
            var queryKey = qs.key;
            if (type == 'timeline')
                queryKey = qs.ratingKey;
            const srcMedia = await db.getAsync(`
                SELECT m.*,
                       s.title as section_title
                FROM media m,
                     sections s
                WHERE m.ratingKey = (?)
                AND   m.host = (?)
                AND   m.host = s.host
                AND   m.section_key = s.key;
            `, [
                queryKey,
                data.host
            ]);
            const config = await Config.get();
            const hosts = config.hosts;
            if (srcMedia) {
                const config = await Config.get();
                const hosts = config.hosts;
                let destFound = false;
                for (var i = 0; i < hosts.length; i++) {
                    if (data.host != `${hosts[i].host}:${hosts[i].port}`) {
                        destFound = true;
                        const destMedia = await db.getAsync(`
                            SELECT m.*
                            FROM media m,
                                 sections s
                            WHERE m.guid = (?)
                            AND   m.host = s.host
                            AND   m.section_key = s.key
                            AND   s.title = (?)
                            AND   m.host = (?);
                        `, [
                            srcMedia.guid,
                            srcMedia.section_title,
                            `${hosts[i].host}:${hosts[i].port}`
                        ]); 
                        if (!destMedia) {
                            const populator = new Populator();
                            await populator.update();
                        }
                        if (destMedia) {
                            let marked = '';
                            if (type == 'timeline') {
                                marked = 'stopped';
                                qs.key = destMedia.key;
                                qs.ratingKey = destMedia.ratingKey;                           
                            } else {
                                if (type == 'scrobble')
                                    marked = 'watched';
                                else   
                                    marked = 'unwatched';
                                qs.key = destMedia.ratingKey;
                            }
                            const url = `https://${hosts[i].host}:${hosts[i].port}${uri.pathname}?${QueryString.stringify(qs)}&plex-cluster=1`;
                            try {
                                const res = await Request.get(url);
                                if (res.status == 200) {
                                    console.log(`Marked ${hosts[i].host}:${hosts[i].port} - ${destMedia.title} (${destMedia.guid}) ${marked}.`);
                                } else {
                                    console.error(`Error marking ${hosts[i].host}:${hosts[i].port} - ${destMedia.title} (${destMedia.guid}) ${marked}.`);
                                }
                            } catch(err) {
                                console.error(`ERROR: ${err.message}`);
                            }        
                        }
                    }
                }
                if (!destFound)
                    console.error(`No destinations found other than source of ${hosts[i].host}:${hosts[i].port}.`);
            } else {
                console.error(`No source configured for ${hosts[i].host}:${hosts[i].port}.`);
            }
        } else {
            console.error(`ERROR: No token with request ${JSON.stringify(data)}`);
        }
    }

    parse(data) {
        if (data.status == '200') {
            this.syncItem(data);
        } else {
            console.error(`Not processing from ${data.host}${data.uri} when status is ${data.status}.`);
        }
    }

}
module.exports.Processor = Processor;
