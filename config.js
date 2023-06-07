require("dotenv").config();
const { b64uDec } = require('./src/utils/helper')

const KEY_SERVER_NAME = "near";

const TWITTER_SEARCH_TOKEN = b64uDec(process.env.TWITTER_SEARCH_TOKEN)

const TWITTER_LISTEN_FIELDS = {
    "tweet.fields": "id,author_id,text,created_at,conversation_id,entities,geo",
    "expansions": "author_id,attachments.media_keys,geo.place_id",
    "user.fields": "id,name,username,profile_image_url,verified,public_metrics,created_at",
    "media.fields": "media_key,url,preview_image_url,width,height,duration_ms"
};
const TWITTER_POST_TAG = '#' + process.env.TWITTER_POST_TAG

// *****************redis********************
const REDIS_PWD = b64uDec(process.env.REDIS_PWD)
const REDIS_TEST_PWD = b64uDec(process.env.REDIS_TEST_PWD)

// redis keys
const REDIS_TWEET_KEY = `redis_tweet_key`;

// Redis expire time(second).
const REDIS_EXPIRE_TIME = 1000 * 60;

/**
 * User who has more than {FOLLOWER_THRESHOLD} followers get the highest reputation of MAX_REP
 */
const FOLLOWER_THRESHOLD = 100000;
const MAX_REP = 1000000;
const MIN_REP = 1;

const BOT_MSG_INTERVAL = 30 * 60;

module.exports = {
    KEY_SERVER_NAME,
    TWITTER_POST_TAG,
    TWITTER_LISTEN_FIELDS,
    REDIS_PWD,
    REDIS_EXPIRE_TIME,
    REDIS_TEST_PWD,
    REDIS_TWEET_KEY,
    FOLLOWER_THRESHOLD,
    MAX_REP,
    MIN_REP,
    TWITTER_SEARCH_TOKEN,
    BOT_MSG_INTERVAL
}
