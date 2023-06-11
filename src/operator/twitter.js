
const { TWITTER_POST_TAG, REDIS_TWEET_KEY, BOT_MSG_INTERVAL } = require("../../config");
const { sleep, format, u8arryToHex, sleep2 } = require("../utils/helper")
const { postMessage } = require("../utils/grpc/report");
const near = require("../utils/near");
const { getPageOg } = require('../utils/ogGetter')
const { lPop, get, set } = require('../db/redis');
const tweetDB = require('../db/api/tweet')
const userDB = require("../db/api/user");
const { getTweetByTweetId } = require('../utils/twitter/twitter')
const regex_tweet_link = new RegExp("https://twitter.com/([a-zA-Z0-9\_]+)/status/([0-9]+)[/]?$")
const white_blank = /[ | ]+/g
const regex_hive_tag = /#hive-[0-9]{4,7}/

const logger = require("../utils/logger");

function getAuthor(tweet) {
    if ("includes" in tweet && "users" in tweet.includes) {
        return tweet.includes.users.find((user) => tweet.data.author_id == user.id);
    }
    return null;
}

function getTags(tweet) {
    // get hive tag
    const hive = tweet.data.text.match(regex_hive_tag);
    let hivetag = null;
    if (hive && hive.length > 0) {
        try {
            hivetag = hive[0].trim().substring(1)
        } catch (e) { }
    }
    if ("data" in tweet && "entities" in tweet.data && "hashtags" in tweet.data.entities) {
        let tags = [];
        for (let i in tweet.data.entities.hashtags) {
            if (tweet.data.entities.hashtags[i].tag === 'hive' && hivetag) {
                tags.push(hivetag)
                continue;
            }
            tags.push(tweet.data.entities.hashtags[i].tag);
        }
        if (tags.length > 0) return [...new Set(tags)];// JSON.stringify(tags);
        return null;
    }
    return null;
}

function getRetweetId(tweet) {
    if ("data" in tweet && "entities" in tweet.data && "urls" in tweet.data.entities) {
        for (let url of tweet.data.entities.urls.reverse()) {
            const group = url.expanded_url.match(regex_tweet_link)
            if (!!group) {
                return group[2]
            }
        }
    }
    return null;
}

function getLocation(tweet) {
    if ('data' in tweet && 'geo' in tweet.data && 'place_id' in tweet.data.geo) {
        if (tweet.includes && tweet.includes.places) {
            return tweet.includes.places.find(p => p.id === tweet.data.geo.place_id)
        }
    }
    return null;
}

async function fetchPageInfo(tweet, content) {
    if ("data" in tweet && "entities" in tweet.data && "urls" in tweet.data.entities) {
        const ret = tweet.data.entities.urls[tweet.data.entities.urls.length - 1]
        let info = {}
        const retweetId = getRetweetId(tweet);
        if (retweetId) {
            // fetch retweet info
            let retweet;
            try {
                retweet = await getTweetByTweetId(retweetId)
            } catch (e) {
                logger.debug('Get tweet fail:', e)
                return [{}, content]
            }
            if (!retweet.data) {
                // wrong quote tweet®
                return [{}, content]
            }
            retweet = delSelfUrl(retweet)
            retweet = showOriginalUrl(retweet)
            const author = getAuthor(retweet)
            let images = []
            if ("includes" in retweet && "media" in retweet.includes) {
                for (let index in retweet.includes.media) {
                    let media = retweet.includes.media[index];
                    images.push(media.preview_image_url ?? media.url)
                }
            }
            let retweetInfo = {
                id: retweet.data.id,
                text: retweet.data.text,
                createdAt: retweet.data.created_at,
                author,
                images
            }

            info['retweetInfo'] = JSON.stringify(retweetInfo)
            content = content.replace(ret.url, ret.expanded_url)
        } else {
            if (ret.media_key) {
                return [info, content]
            }
            // fetch page info
            let pageInfo = await getPageOg(ret.unwound_url ?? ret.expanded_url)
            pageInfo.title = ret.title ?? pageInfo.title;
            pageInfo.description = ret.description ?? pageInfo.description;
            info['pageInfo'] = JSON.stringify(pageInfo)
        }
        return [info, content]
    }
    return [{}, content];
}

/**
 * tweet content contains the url which is redirect url transformed by twitter, we change them back to original page
 * @param {*} tweet 
 */
function showOriginalUrl(tweet) {
    if ("data" in tweet && "entities" in tweet.data && "urls" in tweet.data.entities) {
        for (let url of tweet.data.entities.urls) {
            if (url.expanded_url.startsWith('https://twitter.com/') || (url.unwound_url && url.unwound_url.startsWith('https://twitter.com/'))) {

            } else {
                tweet.data.text = tweet.data.text.replace(url.url, url.unwound_url ?? url.expanded_url)
            }
        }
    }
    return tweet;
}

function delSelfUrl(tweet) {
    if (tweet.data && tweet.data.entities && tweet.data.entities.urls) {
        for (let u of tweet.data.entities.urls) {
            if (u.expanded_url.indexOf(tweet.data.id) !== -1) {
                tweet.data.text = tweet.data.text.replace(u.url, '')
                return tweet
            }
        }
    }
    return tweet
}

function replaceImageUrl(tweet, content) {
    let c = content;
    if ("includes" in tweet && "media" in tweet.includes) {
        for (let index in tweet.includes.media) {
            let media = tweet.includes.media[index];
            c += "\n" + (media.url ?? media.preview_image_url);
        }
    }
    return c;
}

function getImages(tweet) {
    let images = [];
    if ("includes" in tweet && "media" in tweet.includes) {
        for (let index in tweet.includes.media) {
            let media = tweet.includes.media[index];
            images.push(media.url ?? media.preview_image_url);
        }
    }
    return images;
}

// @nutbox !create worm hole account with pub key:publickey
async function processTweet(tweet) {
    // logger.debug("processing: ", JSON.stringify(tweet));
    if (tweet.errors && tweet.errors.length > 0) {
        await postMessage("[Twitter stream] 🔴 🔴 🔴\nError occured: disconnect to twitter.");
        throw new Error('Catch error twitter message');
        return;
    }

    // void rehandle single twitter
    if ((await get(tweet.data.id)) > 0) {
        logger.debug(`Have handeld this twitter:(${await get(tweet.data.id)}) ` + tweet.data.id)
        return;
    }
    await set(tweet.data.id, 1);

    const twitterId = tweet.data.author_id;

    // check twitter user
    let registeredAccount = await tweetDB.getUserByTwitterId(twitterId);
    if (registeredAccount === null) return;
    let user = getAuthor(tweet);
    if (registeredAccount.twitter_username.toLowerCase() !== user.username.toLowerCase()) {
        await tweetDB.updateTwitterUsername(user);
    }

    // comment or post
    if (tweet.data.text.indexOf(TWITTER_POST_TAG) !== -1) {
        if (await tweetDB.existTweet(tweet.data.id)) return;

        tweet = delSelfUrl(tweet)
        tweet = showOriginalUrl(tweet)
        let text = tweet.data.text.trim();
        let user = getAuthor(tweet);
        let tags = getTags(tweet);

        let [pageInfo, content] = await fetchPageInfo(tweet, text)
        // get retweet id
        const retweetId = getRetweetId(tweet);
        const place = getLocation(tweet);
        const images = getImages(tweet);
        let post = {
            tweet_id: tweet.data.id,
            twitter_id: tweet.data.author_id,
            content,
            images,
            post_time: format(tweet.data.created_at),
            retweet_id: retweetId,
            parent_id: tweet.data.conversation_id
        };
        // content = replaceImageUrl(tweet, post.content);
        content = content.replace(TWITTER_POST_TAG, '').replace(white_blank, ' ');
        post.content = content

        await tweetDB.saveTweet(post);
    } else {
        logger.debug('Wrong tweet tag', tweet)
    }
}

var isRun = true;

process.on('SIGINT', async function () {
    logger.info("twitter server stop...");
    isRun = false;
});

async function processing() {
    logger.info('Twitter server start...')
    while (isRun) {
        tStr = await lPop(REDIS_TWEET_KEY);
        if (tStr) {
            let tweet = JSON.parse(tStr);
            try {
                await processTweet(tweet);
            } catch (e) {
                logger.debug('Process tweet fail: [%s]', e);
                postMessage(`[Twitter Handler] 🔴 🔴 🔴\nError occured: Process tweet fail.\n - ${e}`).catch();
            }
        } else {
            if (!isRun) break;
            await sleep(3);
        }
    }
}

/**
 * Monitor service to send server status to DC
 */
async function monitor() {
    while (isRun) {
        try {
            msg = `Wormhole twitter handler Status:
            -----------------------------------
            twitter server:   🟢
            -----------------------------------
            `;
            await postMessage(msg);
            await sleep2(BOT_MSG_INTERVAL, () => !isRun);
        } catch (e) {
            logger.error("monitor error: ", e);
        }
    }
}

async function sendPost() {
    while (isRun) {
        try {
            let tweets = await tweetDB.getUnPostTweets();
            for (let tweet of tweets) {
                let status = await near.post(tweet);
                await tweetDB.updateStatus(tweet.tweet_id, status);
            }
            await sleep(3);
        } catch (e) {
            logger.error("sendPost error: ", e);
        }
    }
}

async function acceptBinding() {
    const maxQuest = 180;
    let cacheUsers = {};
    while (isRun) {
        try {
            let users = await userDB.getUnbindingUsers();
            for (let user of users) {
                let proposal = await near.getProposal(user.near_id)
                if (!proposal)
                    continue;
                if (typeof proposal == "string" || proposal instanceof String)
                    if (proposal == "" || proposal.includes(`Account has no proposals for ${near.Platform.Twitter}`)) {
                        if (user.twitter_id in cacheUsers) {
                            cacheUsers[user.twitter_id] += 1;
                            if (cacheUsers[user.twitter_id] > maxQuest) {
                                delete cacheUsers[user.twitter_id];
                                await userDB.updateStatus(user.twitter_id, 2);
                            }
                        } else {
                            cacheUsers[user.twitter_id] = 1;
                        }
                        await sleep(1);
                        continue;
                    }
                if (user.twitter_id != proposal.handle)
                    continue;
                let res = await near.acceptBinding(user.near_id, proposal.created_at);
                if (res) {
                    await userDB.updateStatus(user.twitter_id, 1);
                }
            }
            await sleep(3);
        } catch (e) {
            logger.error("acceptBinding error: ", e);
        }
    }
}

async function postOnChain() {
    await near.nearInit();
    Promise.all([
        sendPost(),
        acceptBinding()
    ]).catch(reason => {
        logger.error("postOnChain:", reason);
    });
}

Promise.all([
    processing(),
    monitor(),
    postOnChain()
]).then(async res => {
    logger.info("twitter server stopped.");
    await postMessage(`Near twitter handler stopped: 🔴 🔴 🔴`);
}).catch().finally(() => {
    process.exit();
})