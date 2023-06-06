const config = require("../../operator.config.js")
const { SteemOps, steem } = require("./steemapi")
const { newPostOnChain, getPostsWithin7Days, updatePostsValue, getUnpostedPosts, updatePostPostStatus, updateClaimRewardsTime, getNotVotedPosts,
    updateWh3VoteStatus, getTagMaps, getUnpostRetweets, updateRetweetStatus, updatePostsTrendingScore, getPostsScore } = require("../db/api/post");
const { getPostValue } = require('../utils/steem/post')
const { sleep, sleep2, getTitle } = require('../utils/helper');
const { getAccount } = require('../register/account')
const log4js = require("log4js");
const _ = require("lodash");
const { getUserReputation } = require("../db/api/reputation");
const { getCurationLikeScore } = require("../db/api/curation_record");
const Synchronizer = require("./steem_interval_sync");

steem.api.setOptions({ url: config.STEEM_RPC[0] });

log4js.configure({
    appenders: {
        post: {
            type: "dateFile", filename: "logs/post.log", pattern: ".yy-MM-dd"
        },
        consoleout: {
            type: "console",
            layout: { type: "colored" }
        }
    },
    categories: {
        default: { appenders: ["post", "consoleout"], level: config.LOG_LEVEL }
    }
});

var isRun = true;
var retries = 0;
var logger = log4js.getLogger("post");

var TagMap = {
    'womeninweb3': 'hive-188206',
    'wwu': 'hive-188206',
    'wbf': 'hive-188206',
    'womenbuidl': 'hive-188206',
    'nomadverse': 'hive-167382',
    'dalifornia': 'hive-185568',
    'wherein': 'hive-193186',
    'nutbox': 'hive-155234',
    'onchaintwiiter': 'hive-167047',
    'tela': 'hive-157355',
    'hiiidao': 'hive-109727',
    'workface ': 'hive-106981',
    'token2049': 'hive-112333',
    'solowin': 'hive-148405',
    'damoon': 'hive-196374',
    'tigervcdao': 'hive-132599',
    'tigervc': 'hive-132599',
    'solowin': 'hive-148405',
    'boylikegirlclub': 'hive-150487'
}
var lastUpdateTagMapTime = 0;

process.on('SIGINT', async function () {
    logger.debug("Post server stop...");
    isRun = false;
});

async function postOnchain() {
    logger.debug("Post server start...");
    while (isRun) {
        try {
            if (parseInt(new Date().getTime() / 1000) - lastUpdateTagMapTime >= 3600) {
                TagMap = await getTagMaps();
                lastUpdateTagMapTime = parseInt(new Date().getTime() / 1000);
            }
            // let records = await Operator.getComments(config.DATA_PAGE_SIZE);
            let sus = await Synchronizer.getUsers();
            let records = await getUnpostedPosts(sus, config.DATA_PAGE_SIZE)
            if (records && records.length > 0) {
                await Promise.all(records.map(handlePost))
                sus = records.map((r) => r.steemUserName);
                await Synchronizer.addUsers(sus);
            }

            await sleep(1)

            // if (!records || records.length < config.DATA_PAGE_SIZE) {
            //     await sleep(10);
            // } else {
            //     await sleep(1);
            // }
        } catch (e) {
            logger.error("post error: ", e);
            if (retries < config.MAX_RETRIES) {
                retries += 1;
                if (!isRun) return;
                await sleep(10);
                continue;
            }
        }
    }
}

async function handlePost(record) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!record.postId) {
                await updatePostPostStatus(record.id, 4);
                resolve();
                return;
            }
            const tags = record.tags ? JSON.parse(record.tags) : [config.DEFAULT_TAG]
            // let parentPermlink = (tags && tags.length > 1) ? (tags[0] === config.PARENTPERMLINK ? tags[1] : tags[0]) : config.PARENTPERMLINK
            let parentPermlink = config.PARENTPERMLINK

            for (let tag of tags) {
                const h = TagMap[tag.toLowerCase()]
                if (h) {
                    parentPermlink = h
                    break;
                }

                if (tag.startsWith('hive-')) {
                    parentPermlink = tag
                    break;
                }
            }
            let body = record.content;
            // add quote tweet content
            if (record.retweetInfo && record.retweetInfo.length > 6) {
                try {
                    let quoteTweet = JSON.parse(record.retweetInfo)
                    let quoteContent = `
                        Quote tweet info below:
                        Original tweet link: https://twitter.com/${quoteTweet.author.username}/status/${quoteTweet.id}
                        Author: @${quoteTweet.author.username}(${quoteTweet.author.id})
                        Tweet at: ${quoteTweet.createdAt}
                        ${quoteTweet.text}`;
                    const imgs = quoteTweet.images;
                    if (imgs && imgs.length > 0) {
                        for (let img of imgs) {
                            quoteContent += `
                                ${img}
                            `
                        }
                    }
                    body += quoteContent;
                } catch (e) {
                    logger.debug('[Post]Analyzing retweet info fail:', e)
                }
            }
            const noUserKey = !record.postingWif || record.postingWif.length < 10;
            let comment = {
                postingWif: noUserKey ? config.WH3_POSTING_KEY : record.postingWif,
                parentAuthor: "",
                parentPermlink: parentPermlink.toLowerCase(),
                author: noUserKey ? config.WH3_POSTING_ACCOUNT : record.steemUserName,
                permlink: record.postId,
                title: getTitle(record.content, config.STEEM_TITLE_LENGHT).slice(0, config.STEEM_TITLE_LENGHT),
                body,
                tags
            };
            // logger.debug('Post to steem:' + JSON.stringify({ ...comment, postingWif: '' }, null, 4))
            // let result = await SteemOps.comment(comment);
            // logger.debug("post: %s %s %s %s", record.id, comment.title, result.block_num, result.id);

            // let status = (!!result && !!result.id) ? 1 : (record.postStatus === 0 ? 2 : 3); // not posted: 0, posted: 1, fail: 2, retry-fail: 3， canceled: 4.
            let status = 1;
            if (status === 1) {
                // update post time/post state/tag relation to db
                await newPostOnChain(record.id, record.twitterId, record.postId, tags, noUserKey)
                process.send({ message: 'updateTag' });
                const lastRewardTime = new Date(record.lastClaimTime).getTime();
                const now = new Date().getTime();
                if (now - lastRewardTime > 86400000) { // cliamed more than 1 days
                    getAccount(record.steemUserName).then(async (acc) => {
                        const rewardVest = parseFloat(acc.reward_vesting_steem.replace(' STEEM', ''))
                        if (rewardVest > 1) { // more than 1 sp
                            const param = {
                                postingWif: record.postingWif,
                                username: record.steemUserName,
                                reward_steem: acc.reward_steem_balance,
                                reward_sbd: acc.reward_sbd_balance,
                                reward_vests: acc.reward_vesting_balance
                            }

                            try {
                                // await SteemOps.claimReward(param);
                                logger.debug(`Claim ${record.steemUserName} reward`)
                                await updateClaimRewardsTime(record.twitterId);
                            } catch (e) {
                                console.log('Claim account reward fail:', e);
                            }
                        }
                    }).catch(async (e) => {
                        console.log('get steem account info fail:', e);
                    })
                }
            } else {
                await updatePostPostStatus(record.id, status);
            }
            resolve();
        } catch (e) {
            logger.debug('Post to steem error:' + record.postId + e)
            try {
                if (record.postStatus === 0) {
                    await updatePostPostStatus(record.id, 2);
                } else if (record.postStatus === 2) {
                    await updatePostPostStatus(record.id, 3);
                }
            } catch (e) {
                logger.debug('[Post post]Update op status fail:' + record.postId)
            }
            resolve();
        }
    })
}

async function handleRetweet(record) {
    try {
        let reblog = { retweeter: record.retweeter, permlink: record.permlink, author: record.author, postingWif: record.post_key };
        // logger.debug('Retweet to steem:' + JSON.stringify(reblog, null, 4))
        // let result = await SteemOps.reblog(reblog);
        // logger.debug("retweet: %s %s %s %s %s", record.id, record.retweeter, record.permlink, record.author, result.id);

        // let status = (!!result && !!result.id) ? 1 : (record.retweet_status === 0 ? 2 : 3); // not posted: 0, posted: 1, fail: 2, retry-fail: 3， canceled: 4.
        let status = 1;
        await updateRetweetStatus(record.id, status);
    } catch (e) {
        logger.debug('Retweet to steem error:' + record.id + e)
        try {
            await updateRetweetStatus(record.id, record.retweet_status === 0 ? 2 : 3);
        } catch (e) {
            logger.debug(`[Post retweet]Update op status fail: ${record.id} ${record.permlink}`);
        }
    }
}

async function retweetOnchain() {
    logger.debug("Retweet server start...");
    while (isRun) {
        try {
            let records = await getUnpostRetweets(config.DATA_PAGE_SIZE);
            if (records && records.length > 0) {
                await Promise.all(records.map(handleRetweet));
            }
            await sleep(1);
        } catch (e) {
            logger.error("retweet error: ", e);
        }
    }
    logger.debug("Retweet server stopped.");
}

Promise.all([
    postOnchain(),
    retweetOnchain()
]).then(() => {
    // logger.debug("Post server stopped.");
    process.exit();
});