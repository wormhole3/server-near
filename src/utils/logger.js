const log4js = require("log4js");

log4js.configure({
    appenders: {
        datafileout: {
            type: "dateFile", filename: "logs/monitor.log", pattern: ".yy-MM-dd"
        },
        consoleout: {
            type: "console",
            layout: { type: "colored" }
        },
        errorLog: { type: 'file', filename: 'logs/monitor_error.log' },
        error: { type: "logLevelFilter", level: "error", appender: 'errorLog' }
    },
    categories: { default: { appenders: ["datafileout", "consoleout", "error"], level: "debug" } }
});

const logger = log4js.getLogger();

module.exports = logger