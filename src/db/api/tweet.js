const { execute } = require("../pool");

async function checkUser(twitterId) {
    let sql = "SELECT id FROM user_info WHERE is_del = 0 AND status = 1 AND twitter_id = ?;";
    const res = await execute(sql, [twitterId]);
    if (res && res.length > 0)
        return true;
    return false;
}

async function getUserByTwitterId(twitterId) {
    let sql = "SELECT * FROM user_info WHERE is_del = 0 AND status = 1 AND twitter_id = ?;";
    const res = await execute(sql, [twitterId]);
    if (res && res.length > 0)
        return res[0];
    return null;
}

async function updateTwitterUsername(user) {
    let sql = `UPDATE user_info SET twitter_username=? WHERE twitter_id=?`;
    await execute(sql, [user.username, user.id])
}

async function existTweet(tweetId) {
    let sql = "select tweet_id from tweets where tweet_id=?;"
    const res = await execute(sql, [tweetId]);
    if (res && res.length > 0)
        return true;
    return false;
}

async function saveTweet(tweet) {
    let sql = `INSERT INTO tweets (
                tweet_id,
                twitter_id,
                parent_id,
                content,
                images,
                post_time,
                retweet_id
            )
            VALUES (?,?,?,?,?,?,?);`;
    await execute(sql, [tweet.tweet_id, tweet.twitter_id, tweet.parent_id, tweet.content,
    JSON.stringify(tweet.images), tweet.post_time, tweet.retweet_id]);
}

async function getUnPostTweets(limit = 100) {
    let sql = `SELECT A.*,B.near_id FROM tweets AS A
                LEFT JOIN user_info AS B ON B.twitter_id=A.twitter_id
                WHERE A.is_del=0 AND A.status=0 AND (A.parent_id IS NULL OR A.parent_id=A.tweet_id) AND B.is_del=0
                ORDER BY A.create_time
                LIMIT ?`;
    const res = await execute(sql, [limit]);
    if (res && res.length > 0)
        return res;
    return [];
}

async function updateStatus(tweetId, status) {
    let sql = "UPDATE tweets SET status=? WHERE tweet_id=?;";
    await execute(sql, [status, tweetId]);
}

module.exports = {
    checkUser,
    getUserByTwitterId,
    updateTwitterUsername,
    existTweet,
    saveTweet,
    getUnPostTweets,
    updateStatus
}