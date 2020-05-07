const Tail = require('tail').Tail;
const { Processor } = require('./processor');
const { Config } = require('./config');

class Watcher {
    constructor() {
    }

    async start() {
        const config = await Config.get();
        const hosts = config.hosts;
        for (var i = 0; i < hosts.length; i++) {
            if (hosts[i].log) {
                const processor = new Processor();
                console.log(`Starting watcher for ${hosts[i].host}:${hosts[i].port}`)
                let tail = new Tail(hosts[i].log, { fromBeginning: true });
                tail.on("line", function (line) {
                    processor.parse(JSON.parse(line));
                });
                tail.on("error", function (error) {
                    console.error('ERROR: ', error);
                });
                    
            }
        }
    }

}
module.exports.Watcher = Watcher;
