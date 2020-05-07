const CronJob = require('cron').CronJob;
const { Populator } = require('./populator')
const { Processor } = require('./processor')
const { Db } = require('./db');

class Cron {
    constructor() {
    }

    async start() {
        var job = new CronJob(`0 ${process.env.FULL_SYNC_SCHEDULE}`, async function () {
            console.log('Executing scheduled full sync');
            const populator = new Populator();
            await populator.update(true);
            const processor = new Processor();
            await processor.syncAll();
        }, null, true);
        job.start();
    }

}
module.exports.Cron = Cron;
