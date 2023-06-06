const { execute } = require("../pool");

async function pushNewTwitter(twitter) {
    const twitterId = twitter.data.id;
    const twitterStr = JSON.stringify(twitter);
    let sql = `INSERT INTO twitter (twitter_id,twitter,created_at) VALUES(?,?,now())
        ON DUPLICATE KEY UPDATE write_count=write_count+1;`
    const res = await execute(sql, [twitterId, twitterStr]);
    if (!res) {
        return 0;
    }
        return res.affectedRows
}

async function fetchOneUnhandledTwitter() {
    let sql = ``
}

/**
 * update twitter handled result
 * @param {*} twitterId  
 * @param {*} handleResult 
 */
async function updateHandleResult(twitterId, handleResult) {
    let sql = `UPDATE twitter SET handle_result=${handleResult} WHERE twitter_id='${twitterId}';`
}

module.exports = {
    pushNewTwitter,
    updateHandleResult
}