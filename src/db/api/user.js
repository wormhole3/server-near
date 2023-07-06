const { execute, executeTransaction } = require("../pool");

async function getUnbindingUsers(limit = 100) {
    let sql = "SELECT * FROM twitter_auth_record WHERE status=1 ORDER BY create_time LIMIT ?;"
    const res = await execute(sql, [limit]);
    if (res && res.length > 0)
        return res;
    return [];
}

async function updateStatus(user, status) {
    let sql = "UPDATE twitter_auth_record SET status=? WHERE twitter_id=?;";
    if (status == 2) {
        sql += `INSERT INTO user_info (twitter_id,near_id,twitter_username,twitter_name,profile_img) 
                VALUES (?,?,?,?,?);`
    }
    await executeTransaction(sql, [status, user.twitter_id, user.twitter_id, user.near_id, user.twitter_username, user.twitter_name, user.profile_img]);
}

module.exports = {
    getUnbindingUsers,
    updateStatus
}