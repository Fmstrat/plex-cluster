const yaml = require('js-yaml')
const fs = require('fs')

let _config = null;

class Config {

    static async get() {
        //console.log("Db get");
        if (!_config)
            _config = yaml.safeLoad(fs.readFileSync('/config/plex-cluster-manager.yml', 'utf8'));
        return _config;
    }

}
module.exports.Config = Config;
