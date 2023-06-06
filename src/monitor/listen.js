
const { TWITTER_MONITOR_RULE, TWITTER_POST_TAG, TWITTER_MONITOR_KEYS, TWITTER_LISTEN_FIELDS, KEY_SERVER_NAME, REDIS_TWEET_KEY,
    REDIS_TWEET_KEY_TEST } = require("../../config");
const { sleep2 } = require("../utils/helper")
const { postMessage } = require("../utils/grpc/report");
const { rPush, set, get } = require('../db/redis');
const redisTest = require("../db/redis_test");
const { isUndefined, isNull } = require("lodash");
const fs = require("fs");
const log4js = require("log4js");

const { Client } = require("twitter-api-sdk");
let client;
var twitterMonitorKeyIndex = 0;

const needle = require('needle');

function setUpClient(toggle = false) {
    if (toggle) {
        twitterMonitorKeyIndex++;
        if (twitterMonitorKeyIndex >= TWITTER_MONITOR_KEYS.length) {
            twitterMonitorKeyIndex = 0;
        }
    }
    client = new Client(TWITTER_MONITOR_KEYS[twitterMonitorKeyIndex]);
    return client;
}

log4js.configure({
    appenders: {
        datafileout: {
            type: "dateFile", filename: "logs/listen.log", pattern: ".yy-MM-dd"
        },
        consoleout: {
            type: "console",
            layout: { type: "colored" }
        }
    },
    categories: { default: { appenders: ["datafileout", "consoleout"], level: "debug" } }
});

const logger = log4js.getLogger();

let isRun = true
const TEST_TOGGLE_FILE = 'test_toggle.js';
const REDIS_LAST_READED_TWITTER_ID = `${KEY_SERVER_NAME}_last_tweet_id`;
let lastKey = '';
var hasSearched = false;

var searchStream = null;
var needChangeKey = false;

process.on('SIGINT', async () => {
    logger.debug('Listen Server stop....');
    isRun = false;
})

async function pollingSearchMissingTweet() {
    while (isRun) {
        try {
            setUpClient();
            let tweets = await searchMissingTweet();
            if (tweets.length > 0) {
                await postMessage(`[Twitter search] 🔴 🔴 🔴\nError occured: found ${tweets.length} missing tweets. Will restart tweet client`);
                // we missed some tweets, need add them back and restart tweet client
                await set(REDIS_LAST_READED_TWITTER_ID, tweets[0].data.id, false);
                logger.debug('Searched tweets:' + tweets.map(value => value.data.id));
                for (let tweet of tweets.reverse()) {
                    const tweetStr = JSON.stringify(tweet);
                    rPush(REDIS_TWEET_KEY, tweetStr);
                    writeTweetToDebugEnv(tweetStr);
                    fs.appendFile('logs/wormhole/twitter.txt', '[' + new Date().toISOString() + "]: " + tweetStr + '\n\n', 'utf8', err => {
                        if (err) {
                            logger.debug('Write new searched tweet to file fail: ' + err)
                        }
                    })
                }
                needChangeKey = true;
                searchStream.abort();
            }
        } catch (e) {
            logger.debug('Search missing tweets fail' + e)
        }
        hasSearched = true;
        if (!isRun) return;
        await sleep2(180, () => !isRun) // check every 3 minutes
    }
}

async function searchMissingTweet() {
    const lastId = await get(REDIS_LAST_READED_TWITTER_ID);
    let tweets = []
    if (lastId) {
        if (lastId != lastKey) {
            logger.debug('new search: ' + lastId);
            lastKey = lastId;
        }
        const query = {
            "query": `${TWITTER_MONITOR_RULE} OR ${TWITTER_POST_TAG}`,
            "max_results": 100,
            "since_id": lastId,
            "tweet.fields": ["id", "author_id", "text", "created_at", "conversation_id", "entities", "geo"],
            "expansions": ["author_id", "attachments.media_keys", "geo.place_id"],
            "user.fields": ["id", "name", "username", "profile_image_url", "verified", "public_metrics", "created_at"],
            "media.fields": ["media_key", "url", "preview_image_url", "width", "height", "duration_ms"]
        };
        let results = await client.tweets.tweetsRecentSearch(query)
        if (results.errors && results.errors.length > 0) {
            return []
        } else if (results.meta.result_count > 0) {
            tweets = resetTweet(results)
            while (results.meta.next_token) {
                results = await client.tweets.tweetsRecentSearch({
                    ...query,
                    "next_token": results.meta.next_token
                })
                if (results.errors && results.errors.length > 0) {
                    break
                }
                tweets.concat(resetTweet(results))
            }
        }
        return tweets;
    } else {
        return []
    }
}

function resetTweet(results) {
    const tweets = results.data.map(t => {
        let tweet = { data: t }
        tweet.includes = {
            users: [results.includes.users.find((user) => t.author_id == user.id)]
        }

        if ("entities" in t && "urls" in t.entities) {
            let media = []
            for (let m of t.entities.urls) {
                if (m.media_key) {
                    media.push(results.includes.media.find(media => m.media_key == media.media_key))
                }
            }
            if (media.length > 0) {
                tweet.includes.media = media
            }
        }

        if (t.geo && t.geo.place_id) {
            tweet.includes.places = [results.includes.places.find(p => p.id === t.geo.place_id)]
        }
        return tweet
    })
    return tweets
}

async function getAllRules() {
    const response = await needle('get', "https://api.twitter.com/2/tweets/search/stream/rules", {
        headers: {
            "authorization": `Bearer ${TWITTER_MONITOR_KEYS[twitterMonitorKeyIndex]}`
        }
    })
    if (response.statusCode !== 200) {
        console.log("Error:", response.statusMessage, response.statusCode)
        throw new Error(response.body);
    }
    return (response.body);
}

async function setRules(toggle = false) {
    if (toggle) {
        twitterMonitorKeyIndex++;
        if (twitterMonitorKeyIndex >= TWITTER_MONITOR_KEYS.length) {
            twitterMonitorKeyIndex = 0;
        }
    }
    const rules = await getAllRules();
    logger.debug("twitter rules: %s", JSON.stringify(rules));
    let addRules = []
    if (!rules || !rules.data) {
        addRules.push({ value: TWITTER_MONITOR_RULE, tag: "twitter with nutbox" })
        addRules.push({ value: TWITTER_POST_TAG, tag: "wormhole post" })
    } else {
        const rule1 = rules.data.find(e => (e.value === TWITTER_MONITOR_RULE));
        const rule2 = rules.data.find(e => e.value === TWITTER_POST_TAG);
        if (isUndefined(rule1) || isNull(rule1)) {
            addRules.push({ value: TWITTER_MONITOR_RULE, tag: "twitter with nutbox" })
        }
        if (isUndefined(rule2) || isNull(rule2)) {
            addRules.push({ value: TWITTER_POST_TAG, tag: "wormhole post" })
        }
    }
    if (addRules.length > 0) {
        logger.debug('Add new rule:' + JSON.stringify(addRules))
        const response = await needle('post', "https://api.twitter.com/2/tweets/search/stream/rules", {
            add: addRules
        }, {
            headers: {
                "content-type": "application/json",
                "authorization": `Bearer ${TWITTER_MONITOR_KEYS[twitterMonitorKeyIndex]}`
            }
        })

        if (response.statusCode !== 201) {
            throw new Error(response.body);
        }

        return (response.body);
    }
}

function streamConnect() {
    let token = TWITTER_MONITOR_KEYS[twitterMonitorKeyIndex];
    let params = TWITTER_LISTEN_FIELDS;
    searchStream = needle.request('get', "https://api.twitter.com/2/tweets/search/stream", params, {
        headers: {
            "User-Agent": "v2FilterStreamJS",
            "Authorization": `Bearer ${token}`
        },
        timeout: 20000
    });
    logger.debug('Listen Server start.');
    searchStream.on('data', (data) => {
        try {
            const tweet = JSON.parse(data);
            if (tweet.data && tweet.data.id) {
                logger.debug("New tweet: %s", tweet.data.id);
                rPush(REDIS_TWEET_KEY, data);
                writeTweetToDebugEnv(data)
                set(REDIS_LAST_READED_TWITTER_ID, tweet.data.id, false)
                fs.appendFile('logs/wormhole/twitter.txt', '[' + new Date().toISOString() + "]: " + data + '\n\n', 'utf8', err => {
                    if (err) {
                        logger.debug('Write new searched tweet to file fail: ' + err)
                    }
                })
            } else {
                logger.debug("streamConnect invalid data: %s", data);
            }
        } catch (e) {
            if (data.detail === "This stream is currently at the maximum allowed connection limit.") {
                logger.debug("streamConnect: %s", data);
                needChangeKey = true;
                searchStream.abort();
            } else if (data == "\r\n") {
                console.log(`[${new Date().toISOString()}] Keep alive signal received.`);
            } else {
                postMessage(`[Twitter stream] 🔴 🔴 🔴\nError occured: ${data}\n${e}`).catch((reason) => {
                    logger.error('Post message to DC fail: %s', reason);
                });
                logger.debug("streamConnect: %s\n%s", data, e);
            }
        }
    }).on('error', (error, b) => {
        postMessage("[Twitter stream] 🔴 🔴 🔴\nError occured: received error info").catch((reason) => {
            logger.error('Post message to DC fail: %s', reason);
        });
        if (error.code !== 'ECONNRESET') {
            logger.debug("streamConnect: %s Reconnect after changing the Bearer token", error.code);
            needChangeKey = true;
            searchStream.abort();
        } else {
            logger.warn("streamConnect: A connection error occurred. Reconnecting...", error, b);
            searchStream.abort();
        }
    });
    postMessage("[Twitter stream] 🟢 🟢 🟢\nStart stream").catch((reason) => {
        logger.error('Post message to DC fail: %s', reason);
    });
    return searchStream;
}

async function listen(toggle = false) {
    try {
        await setRules(toggle);
    } catch (e) {
        logger.error("setRules %s", e);
        logger.info('Listen Server stopped.')
        process.exit(1);
    }

    streamConnect();

    while (isRun && !(searchStream.request.aborted)) {
        await sleep2(30, () => !isRun || searchStream.request.aborted);
    }

    if (isRun) {
        logger.debug("Reconnect %s", needChangeKey ? "change key" : "not change key");
        let toggle;
        let timeToWait = 1000;
        if (needChangeKey) {
            needChangeKey = false;
            toggle = true;
        } else {
            if (searchStream.request.res) {
                const rateLimitReset = Number(searchStream.request.res.headers["x-rate-limit-reset"]);
                const rateLimitRemaining = Number(searchStream.request.res.headers["x-rate-limit-remaining"]);
                if (rateLimitRemaining === 0)
                    timeToWait = rateLimitReset * 1000 - Date.now();
            } else {
                timeToWait = 5000;
            }
            toggle = false;
        }
        setTimeout(() => { listen(toggle) }, timeToWait);
    }
}

async function writeTweetToDebugEnv(tweetStr) {
    try {
        const res = fs.readFileSync(TEST_TOGGLE_FILE, 'utf8');
        if (parseInt(res) === 1) {
            redisTest.rPush(REDIS_TWEET_KEY_TEST, tweetStr);
        }
    } catch (e) {
        logger.debug('Write tweet to debug env wrong', e)
    }
}

Promise.all([listen(), pollingSearchMissingTweet()]).then(() => {
    logger.info('Listen Server stopped.')
    process.exit();
}).catch(err => {
    postMessage(`[monitor] 🔴 Stopped.`).catch(reason => {
        logger.error("postMessage error %s", reason);
    });
    logger.error('Listen Server Error.');
    process.exit();
});
