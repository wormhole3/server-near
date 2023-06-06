require("dotenv").config();
const { b64uDec } = require('./src/utils/helper')

const KEY_SERVER_NAME = "near";
const TEST_SERVER = true;

const TWITTER_MONITOR_KEYS = [
    b64uDec(process.env.TWITTER_MONITOR1),
    b64uDec(process.env.TWITTER_MONITOR2),
    b64uDec(process.env.TWITTER_MONITOR3),
    b64uDec(process.env.TWITTER_MONITOR4)
];

const TWITTER_APP_ACCESS_TOKEN = b64uDec(process.env.TWITTER_APP_ACCESS_TOKEN)
const TWITTER_SEARCH_TOKEN = b64uDec(process.env.TWITTER_SEARCH_TOKEN)
const TWITTER_MONITOR_RULE = '@' + process.env.TWITTER_MONITOR_RULE
const TWITTER_POST_TAG = '#' + process.env.TWITTER_POST_TAG

const TWITTER_LISTEN_FIELDS = {
    "tweet.fields": "id,author_id,text,created_at,conversation_id,entities,geo",
    "expansions": "author_id,attachments.media_keys,geo.place_id",
    "user.fields": "id,name,username,profile_image_url,verified,public_metrics,created_at",
    "media.fields": "media_key,url,preview_image_url,width,height,duration_ms"
};

// *****************redis********************
const REDIS_PWD = b64uDec(process.env.REDIS_PWD)
const REDIS_TEST_PWD = b64uDec(process.env.REDIS_TEST_PWD)

// redis keys
const REDIS_TWEET_KEY = `${KEY_SERVER_NAME}_redis_tweet_key`;
// We push new tweet to both produce and debug evironment
// And we set a toggle to control wheather need to right to the test redis, "test_toggle.js"
const REDIS_TWEET_KEY_TEST = `${KEY_SERVER_NAME}_redis_tweet_key_test`;

// Redis expire time(second).
const REDIS_EXPIRE_TIME = 1000 * 60;

/**
 * User who has more than {FOLLOWER_THRESHOLD} followers get the highest reputation of MAX_REP
 */
const FOLLOWER_THRESHOLD = 100000;
const MAX_REP = 1000000;
const MIN_REP = 1;

module.exports = {
    KEY_SERVER_NAME,
    TEST_SERVER,
    TWITTER_MONITOR_KEYS,
    TWITTER_MONITOR_RULE,
    TWITTER_POST_TAG,
    TWITTER_LISTEN_FIELDS,
    REDIS_PWD,
    REDIS_EXPIRE_TIME,
    REDIS_TEST_PWD,
    REDIS_TWEET_KEY,
    REDIS_TWEET_KEY_TEST,
    FOLLOWER_THRESHOLD,
    MAX_REP,
    MIN_REP,
    TWITTER_APP_ACCESS_TOKEN,
    TWITTER_SEARCH_TOKEN
}
