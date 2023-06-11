const log4js = require("log4js");

log4js.configure({
    appenders: {
        consoleout: { type: "console", layout: { type: "colored" } },
        datafileout: { type: "dateFile", filename: "logs/server-near.log", pattern: ".yy-MM-dd" },
        errorLog: { type: 'file', filename: 'logs/server-near_error.log' },

        error: { type: "logLevelFilter", level: "error", appender: 'errorLog' },
        info: { type: "logLevelFilter", level: "info", appender: 'datafileout' }
    },
    categories: { default: { appenders: ["consoleout", "info", "error"], level: "all" } }
});

const logger = log4js.getLogger();

module.exports = logger