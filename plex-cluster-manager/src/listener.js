const express = require('express');
const bodyParser = require('body-parser');
const { Processor } = require('./processor');

module.exports = {

    start: function() {
        const app = express();
        app.use(bodyParser.json());
        const processor = new Processor();
        
        app.post('/', (req, res) => {
            if (req.query.token && req.query.token == process.env.CLUSTER_MANAGER_TOKEN) {
                processor.parse(req.body);
                res.sendStatus(200);
            } else {
                console.log(`Invalid token supplied with ${JSON.stringify(req.body)}`);
                res.sendStatus(403);
            }   
        });
        
        app.listen(3400, () => console.log(`Listening on port 3400`));
    }
}
