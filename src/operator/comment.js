const config = require("../../operator.config.js")
const { SteemOps, steem } = require("./steemapi")
const { getNotSyncedComments, updateCommentStatus } = require("../db/api/comment")
const { updateLastPostTime } = require("../db/api/post");
const { sleep, getTitle } = require('../utils/helper')
const log4js = require("log4js");
const Synchronizer = require("./steem_interval_sync");

steem.api.setOptions({ url: config.STEEM_RPC[0] });

log4js.configure({
    appenders: {
        comment: {
            type: "dateFile", filename: "logs/comment.log", pattern: ".yy-MM-dd"
        },
        consoleout: {
            type: "console",
            layout: { type: "colored" }
        }
    },
    categories: {
        default: { appenders: ["comment", "consoleout"], level: config.LOG_LEVEL }
    }
});

var isRun = true;
var retries = 0;
var logger = log4js.getLogger("comment");

process.on('SIGINT', async function () {
    logger.debug("Comment server stop...");
    isRun = false;
});

async function run() {
    logger.debug("Comment server start...");
    while (isRun) {
        try {
            // let sus = await Synchronizer.getUsers();
            let records = await getNotSyncedComments([], config.DATA_PAGE_SIZE)
            for (let index in records) {
                let record = records[index];
                try {
                    if (!record.steemUserName || !record.parentId || !record.commentId || !record.parentSteemUserName) {
                        await updateCommentStatus(record.id, 4);
                        continue;
                    }
                    let comment = {
                        postingWif: record.postingWif,
                        parentAuthor: record.post_by_wh3 == 0 ? record.parentSteemUserName : config.WH3_POSTING_ACCOUNT,
                        parentPermlink: record.parentId,
                        author: record.steemUserName,
                        permlink: record.commentId,
                        title: getTitle(record.content, config.STEEM_TITLE_LENGHT),
                        body: record.content,
                        tags: record.tags ? JSON.parse(record.tags) : config.PARENTPERMLINK
                    };
                    // let result = await SteemOps.comment(comment);
                    // logger.debug("post comment: %s %s %s %s", record.id, comment.title, result.block_num, result.id);
                    // let status = (!!result && !!result.id) ? 1 : (record.commentStatus === 0 ? 2 : 3);
                    let status = 1;
                    await updateCommentStatus(record.id, status);
                    if (!isRun) return;
                } catch (e) {
                    logger.error("post comment on chain fail:", e)
                    updateCommentStatus(record.id, record.commentStatus === 0 ? 2 : 3).catch();
                }
            }
            // if (records){
            //     sus = records.map((r) => r.steemUserName);
            //     await Synchronizer.addUsers(sus);
            // }
            await sleep(1);
        } catch (e) {
            logger.error("post comment error: ", e);
            if (retries < config.MAX_RETRIES) {
                retries += 1;
                if (!isRun) return;
                await sleep(10);
                continue;
            }
        }

    }
}



run().then(() => {
    logger.debug("Comment server stopped.");
    process.exit();
});



