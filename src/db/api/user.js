const { execute } = require("../pool");

async function getUnbindingUsers(limit = 100) {
    let sql = "SELECT * FROM user_info WHERE is_del=0 AND status=0 ORDER BY create_time LIMIT ?;"
    const res = await execute(sql, [limit]);
    if (res && res.length > 0)
        return res;
    return [];
}

async function updateStatus(twitterId, status) {
    let sql = "UPDATE user_info SET status=? WHERE twitter_id=?;";
    await execute(sql, [status, twitterId]);
}

module.exports = {
    getUnbindingUsers,
    updateStatus
}