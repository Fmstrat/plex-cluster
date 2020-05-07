const { Watcher } = require('./watcher');
const { Cron } = require('./cron');
const { Db } = require('./db');
const listener = require('./listener');
const { Processor } = require('./processor');
const { Populator } = require('./populator');

async function main() {
    await Db.get();
    await Db.build();
    if (process.env.UPDATE_ON_START && process.env.UPDATE_ON_START == 'true') {
        const populator = new Populator();
        await populator.update(true);
        const processor = new Processor();
        await processor.syncAll();
    }
    listener.start();
    const watcher = new Watcher();
    await watcher.start();
    const cron = new Cron();
    await cron.start();
    return true;
}

process.on('exit', async function () {
    await Db.close();
    console.log('exiting...');
});

main()
    .catch(err => console.error(err.stack));

