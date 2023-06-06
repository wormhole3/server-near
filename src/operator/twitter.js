
const { TWITTER_POST_TAG, Curation_Url, Test_Curation_Url,
    Curation_Short_Url, TWITTER_POPUP_TAG,  TWITTER_LISTEN_FIELDS,
    MAX_VP, VP_CONSUME, RC_CONSUME, TEST_SERVER, REDIS_TWEET_KEY, REDIS_TWEET_KEY_TEST } = require("../../config");
const { sleep, format, u8arryToHex, sleep2 } = require("../utils/helper")
const { postMessage } = require("../utils/grpc/report");
const { ethers } = require("ethers");
const { getPageOg } = require('../utils/ogGetter')
const { lPop, get, set } = require('../db/redis');
const { pushNewTwitter } = require('../db/api/twitter')
const { getCurationById, getCurationByTweetId, updateTweetId } = require('../db/api/curation')
const { recordTipPosts, getAmountByEmoji } = require('../db/api/tip')
const rewardDB = require("../db/api/curation_reward");
const { addNewAccountWhoNotRegisterNow, updateUserProfile, getPendingRegisterByTwitterId, addNewPendingRecord } = require("../db/api/register");
const { getAccountByTwitterId, updateTwitterUsername, getAccountByPostId, getUserVP } = require("../db/api/user");
const { newPendingUser } = require('../db/api/reputation');
const HKDB = require('../db/api/hk2023')
const { addRC, reduceRC } = require('./rc-consume-queue')
const config = require("../../operator.config");

const { Operator } = require("../db/api/operator");
const { recordPostPosts, updateLongContentPost, hasPost, getPostById } = require("../db/api/post");
const { getAllCommunities, getActivityByCommunityId } = require('../db/api/community')
const { hasComment, recordComments } = require("../db/api/comment")
const { recordSendPosts } = require("../db/api/send")
const log4js = require("log4js");
const { client, getTweetByTweetId } = require('../utils/twitter/twitter')
const { checkCuration, newCuration, getAutoCurationByRetweet, saveCurationTags, saveIsCurated } = require("../db/api/curation");
const chainConfig = require("../../chain.config");

const regex_register = new RegExp("@wormhole_3 (\!|！)create wormhole account:(0x[0-9a-fA-F]{40})( [0-9]*)?");
const regex_sentToken = new RegExp("(\!|！)send (0|[1-9]+[0-9]*)(.[0-9]{1,6})? (eth|bnb|busd|usdt|usdc|weth|matic|ETH|BNB|BUSD|USDT|USDC|MATIC|WETH)(\\(BSC\\)|（BSC）|\\(MATIC\\)|（MATIC）)? to @?(0x[0-9a-fA-F]{40}|[0-9a-zA-Z\_]{1,30})")
const regex_sentSteem = new RegExp("@wormhole_3[ | ](\!|！)send (0|[1-9]+[0-9]*)(.[0-9]{1,6})? (STEEM|SBD|steem|sbd|Steem|Sbd)(steem)? to[ | ]@?([0-9a-zA-Z\-\.]{1,30})([ | ][\\s\\S]+)?")
const regex_tipSteem = new RegExp("@wormhole_3[ | ](\!|！)tip (0|[1-9]+[0-9]*)(.[0-9]{1,6})? (STEEM|SBD|steem|sbd|Steem|Sbd)(steem)? to[ | ]@?([0-9a-zA-Z\_]{1,30})([ | ][\\s\\S]+)?")
const regex_tipEmoji = new RegExp("@wormhole_3[ | ](\!|！)tip (✌|🎈|🍔|🍻|❤|🎃|🎄|🦃|🧧|🏮|🥮|🇨🇳|🚀|🎂|🌹|🛳) to[ | ]@?([0-9a-zA-Z\_]{1,30})([ | ][\\s\\S]+)?");
const regex_tweet_link = new RegExp("https://twitter.com/([a-zA-Z0-9\_]+)/status/([0-9]+)[/]?$")
const white_blank = /[ | ]+/g
const regex_hive_tag = /#hive-[0-9]{4,7}/
const long_content_tag = /^LC([\d]+|E)$/;
const redis_tweet_key = TEST_SERVER ? REDIS_TWEET_KEY_TEST : REDIS_TWEET_KEY;
const HK_TAG = 'hk2023';
const DEFAULT_HIVE_TAG = 'hive-1983477';  // peanut
const ANN_TAG = "ANN";    // Announcement tag

const { getChain, waitForTx, checkReputation } = require("../utils/ethers");

const SpaceRex = /https:\/\/twitter\.com\/i\/spaces\/([0-9a-z-A-Z]+)/;

log4js.configure({
    appenders: {
        handleTweet: {
            type: "dateFile", filename: "logs/handleTweet.log", pattern: "yy-MM-dd"
        },
        consoleout: {
            type: "console",
            layout: { type: "colored" }
        }
    },
    categories: { default: { appenders: ["handleTweet", "consoleout"], level: "debug" } }
});

const logger = log4js.getLogger("handleTweet");

function randomCurationId() {
    let id = ethers.utils.randomBytes(6)
    id = u8arryToHex(id);
    return id;
}

function getAuthor(tweet) {
    if ("includes" in tweet && "users" in tweet.includes) {
        return tweet.includes.users.find((user) => tweet.data.author_id == user.id);
    }
    return null;
}

function getTipToUser(tweet, to) {
    if ("includes" in tweet && "users" in tweet.includes) {
        const user = tweet.includes.users.find(user => to.toLowerCase() == user.username.toLowerCase());
        if (user) {
            return {
                twitterId: user.id, profileImg: user.profile_image_url, twitterName: user.name, twitterUsername: to, verified: user.verified,
                followers: user.public_metrics.followers_count, following: user.public_metrics.following_count
            }
        }
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
                const u = url.unwound_url ?? url.expanded_url;
                if (u.startsWith(Curation_Url) || u.startsWith(Test_Curation_Url) || u.startsWith(Curation_Short_Url)) {
                    const t = u.split('/')
                    const curationId = t[t.length - 1];
                    tweet.curationId = curationId
                }
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

function getSpaceIdFromUrls(urls) {
    if (!urls || urls.length === 0) return null;
    for (let url of urls) {
        if (url.expanded_url === url.unwound_url) {
            const group = url.expanded_url.match(SpaceRex);
            if (group) {
                const spaceId = group[1]
                return spaceId;
            }
        }
    }
    return null;
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

// @nutbox !create worm hole account with pub key:publickey
async function processTweet(tweet) {
    logger.debug("processing: ", JSON.stringify(tweet));
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

    // ditch the retweets
    if (tweet.data.id == tweet.data.conversation_id && tweet.data.text && tweet.data.text.startsWith("RT")) {
        logger.debug(`ditch the retweets: ${tweet.data.id}`);
        return;
    }

    pushNewTwitter(tweet).catch(e => logger.debug('Restore twitter fail:' + e))
    const twitterId = tweet.data.author_id

    let registeredAccount = await getAccountByTwitterId(twitterId);
    // tweet.data.text = tweet.data.text.replace(white_blank, ' ');
    // register
    let group = tweet.data.text.match(regex_register);
    let user = getAuthor(tweet);
    const profileImg = user.profile_image_url
    if (!!group) {
        logger.debug('Ignore expired register tweet.')
        return;
    }
    // check register
    if (!registeredAccount || registeredAccount.isRegistry != 1) {
        logger.error("Account not registered: %s", JSON.stringify(tweet));
    } else {
        // udpate profile_img
        if (profileImg !== registeredAccount.profileImg) {
            await updateUserProfile(registeredAccount.twitterId, profileImg)
        }

        // udpate twitter username
        if (registeredAccount.twitterUsername.toLowerCase() !== user.username.toLowerCase()) {
            updateTwitterUsername(user).catch()
        }
    }

    // transfer
    /**
     * 1: !
     * 2: int
     * 3: float
     * 4: symbol
     * 5: chainname: include '()'
     * 6: to
     */
    group = tweet.data.text.replace(white_blank, ' ').match(regex_sentSteem);
    console.log('Match transfer', group);
    // only registered user can send
    if (!!group && registeredAccount && registeredAccount.isRegistry === 1) {
        let [text, s, i, f, symbol, chain, to] = group;
        console.log(text, s, i, f, symbol, chain, to);
        symbol = symbol.toUpperCase();
        if (symbol === 'STEEM' || symbol === 'SBD') {
            if (registeredAccount.bindSteem) {
                logger.debug('Binded steem account cant transfer steem')
                return;
            }
            await handleSteemTransfer(tweet, group)
        } else {
            // handleEVMTransfer(tweet, group)
        }
        return;
    }

    // tips
    let isEmoji = false;
    group = tweet.data.text.replace(white_blank, ' ').match(regex_tipSteem);
    if (!group) {
        group = tweet.data.text.replace(white_blank, ' ').match(regex_tipEmoji);
        if (!!group) isEmoji = true;
    }
    console.log('Match tip', group);
    // only registered account can tip
    if (!!group && registeredAccount && registeredAccount.isRegistry === 1) {
        let [text, s, i, f, symbol, chain, to] = group;
        console.log(text, s, i, f, symbol, chain, to);
        symbol = symbol ? symbol.toUpperCase() : '';
        if (symbol === 'STEEM' || symbol === 'SBD' || isEmoji) {
            if (registeredAccount.bindSteem) {
                logger.debug('Binded steem account cant tip steem')
                return;
            }
            try {
                await handleTipSteem(tweet, group, registeredAccount, isEmoji)
            } catch (e) { }
        } else {
            // handleEVMTransfer(tweet, group)
        }
        return;
    }

    // comment or post
    // group = tweet.data.text.match(regex_post);
    if (tweet.data.text.indexOf(TWITTER_POST_TAG) !== -1 || tweet.data.text.indexOf(TWITTER_POPUP_TAG) !== -1 || tweet.data.text.indexOf(HK_TAG) !== -1) {
        const exists = false;
        let [postExist, commentExist] = await Promise.all([hasPost(tweet.data.id), hasComment(tweet.data.id)]);
        if (commentExist) {
            logger.debug('Comment has exists:', tweet.data.id);
            return;
        }
        // User who not registered can not comment
        if ((!registeredAccount || !registeredAccount.isRegistry) && (tweet.data.id !== tweet.data.conversation_id)) {
            return;
        }
        tweet = delSelfUrl(tweet)
        tweet = showOriginalUrl(tweet)
        let text = tweet.data.text.trim();
        let user = getAuthor(tweet);
        let tags = getTags(tweet);

        // check community
        let community = null;
        const communities = await getAllCommunities();
        if (tags) {
            for (let tag of tags) {
                community = communities.find(c => c.display_tag === tag || c.hive_tag === tag);
                if (community) {
                    break;
                }
            }
        }

        if (!community) {
            community = communities.find(c => c.hive_tag === DEFAULT_HIVE_TAG)
        }

        let [pageInfo, content] = await fetchPageInfo(tweet, text)
        // get retweet id
        const retweetId = getRetweetId(tweet)
        const place = getLocation(tweet)
        let post = {
            postId: tweet.data.id,
            twitterId: tweet.data.author_id,
            twitterName: user.name,
            twitterUsername: user.username,
            profileImg: user.profile_image_url,
            content,
            steemId: registeredAccount ? registeredAccount.steemId : '',
            postTime: format(tweet.data.created_at),
            tags: JSON.stringify(tags),
            pageInfo: pageInfo.pageInfo,
            retweetInfo: pageInfo.retweetInfo,
            retweetId,
            location: JSON.stringify(place),
            communtiyId: community.community_id
        };
        const isComment = tweet.data.id !== tweet.data.conversation_id;
        if (isComment) { // is comment
            let _hasPost = await hasPost(tweet.data.conversation_id)
            if (!_hasPost) return;
            let pTweet = await client.tweets.findTweetById(tweet.data.conversation_id, { expansions: "author_id" })
            let pUser = getAuthor(pTweet)
            post = {
                commentId: tweet.data.id,
                parentId: tweet.data.conversation_id,
                parentTwitterId: pTweet.data.author_id,
                twitterId: tweet.data.author_id,
                twitterName: user.name,
                twitterUsername: user.username,
                steemId: registeredAccount ? registeredAccount.steemId : '',
                content: content.replace('@' + pUser.username, '').trim(),
                commentTime: format(tweet.data.created_at),
                commentStatus: 0,
                tags: JSON.stringify(tags.filter(t => !t.match(long_content_tag))),
                location: JSON.stringify(place)
            };
        }
        content = replaceImageUrl(tweet, post.content);

        content = content.replace(/#LC([\d]+|E)/, '').replace(TWITTER_POST_TAG, '').replace(white_blank, ' ');

        // check long content
        let LCStatus = 0;
        for (let tag of tags) {
            const r = tag.match(long_content_tag);
            if (!!r) {
                LCStatus = r[1]
                if (LCStatus !== 'E') {
                    LCStatus = parseInt(LCStatus)
                }
                break;
            }
        }
        let originalPost = await getPostById(tweet.data.conversation_id);
        let originalLC = originalPost ? originalPost.longContentStauts : 0;
        const isAuthor = originalPost?.twitterId === post.twitterId
        if (!originalPost && LCStatus === 1 && !isComment && !retweetId) {
            // start long content
            content = [content];
            content = JSON.stringify(content);
            post.longContentStauts = 1;
        } else if (originalLC === 1 && isComment && isAuthor) {
            if (LCStatus === 'E') {
                // end long content
                let temp = '';
                let cs = JSON.parse(originalPost.content);
                for (let c of cs) {
                    if (c && c !== 'null' && c !== 'undefined')
                        temp += c + '\n';
                }
                content = temp + content;
                await updateLongContentPost(originalPost.postId, content, 2);
                return;
            } else if (LCStatus > 0) {
                // pending long content
                let cs = JSON.parse(originalPost.content);
                cs[LCStatus] = content;
                await updateLongContentPost(originalPost.postId, JSON.stringify(cs), 1);
                return;
            }
        } else {
            // nomorl content

        }
        post.content = content

        // add new user
        if (!registeredAccount) {
            const added = await addNewAccountWhoNotRegisterNow({
                twitterId: tweet.data.author_id,
                twitterName: user.name,
                twitterUsername: user.username,
                source: 3, profileImg: user.profile_image_url, verified: user.verified, followers: user.public_metrics.followers_count, following: user.public_metrics.following_count
            });
            if (!added) return;
            registeredAccount = await getAccountByTwitterId(twitterId);
        }

        // logger.debug("post info: %s", JSON.stringify(post));
        let result = null;

        if (tweet.data.id !== tweet.data.conversation_id) {
            try {
                const isOK = await reduceRC(post.twitterId, RC_CONSUME.COMMENT)
                if (isOK != 1) return;
                result = await recordComments(post);
                if (!result) {
                    await addRC(post.twitterId, RC_CONSUME.COMMENT)
                    return;
                }
            } catch (e) { }
        } else {
            // update hk2023 event
            handleTweetToHK2023(post, registeredAccount.reputation).catch(e => {
                logger.error('Sync hk stamp fail:', e)
            });
            if (!postExist) {
                let rcCost = 0;
                if (!!post.retweetId) {
                    rcCost = RC_CONSUME.QUOTE
                } else {
                    rcCost = RC_CONSUME.POST
                }
                const isOK = await reduceRC(post.twitterId, rcCost);
                if (isOK !== 1) return;
                result = await recordPostPosts(post);
                if (!result) {
                    await addRC(post.twitterId, rcCost)
                    return;
                }
            }
            // handle curation
            if (tweet.curationId) {
                const curation = await getCurationById(tweet.curationId);
                if (curation && !curation.tweetId) {
                    // add tweet to db
                    let contentCn = post.content;
                    await updateTweetId(tweet.curationId, tweet.data.author_id, user.public_metrics.followers_count, tweet.data.id, contentCn);
                }
            } else {
                let spaceId = getSpaceIdFromUrls(tweet.data.entities.urls);
                // handle auto curation
                if (!spaceId) {
                    await handleAutoCuration(post, user, community);
                }
            }
        }

        if (!result) {
            logger.error("save tweet error: %s", JSON.stringify(post));
        } else {
            logger.debug("save tweet: %s", JSON.stringify(post));
        }

    } else {
        logger.debug('Wrong tweet tag', tweet)
    }
}

async function handleTweetToHK2023(post, reputaion) {
    // const isComment = !!post.commentId;
    // const isRetweet = !!post.retweetId;
    if (post.tags.indexOf(HK_TAG) === -1) return;
    let tags = JSON.parse(post.tags);
    tags = tags.filter(t => t !== HK_TAG && t !== 'iweb3' && t !== 'wormhole3')
    const twitterId = post.twitterId;
    if (tags.length === 0) return;

    const originalTags = await HKDB.tagExistes(tags);
    const searchStr = originalTags.reduce((s, t) => s + t.tag.toLowerCase() + ',', '');
    logger.debug('searchStr', searchStr)
    if (originalTags.length > 0) {
        for (let tag of tags) {
            if (searchStr.indexOf(tag.toLowerCase()) !== -1) {
                HKDB.syncStamp(twitterId, tag, post.postId, 3, Math.sqrt(reputaion > 0 ? reputaion : 0)).catch(logger.error);
                return;
            }
        }
    }
}

async function handleSteemTransfer(tweet, regGroup) {
    let [text, s, i, f, symbol, chain, to, memo] = regGroup;
    symbol = symbol.toUpperCase();
    to = to.replace('@', '')

    let user = getAuthor(tweet);
    const amount = parseFloat(i + (f ? f : ""))
    let transfer = {
        postId: tweet.data.id,
        twitterId: tweet.data.author_id,
        twitterName: user.name,
        twitterUsername: user.username,
        content: tweet.data.text,
        postTime: format(tweet.data.created_at),
        targetId: null,
        targetUsername: to,
        amount: amount,
        chainName: 'STEEM',
        asset: symbol,
        targetAddress: to,
        contract: symbol,
        memo: memo ? memo.trim() : ''
    };
    logger.debug("[STEEM]transfer info: %s", JSON.stringify(transfer, null, 4));
    const isOK = await reduceRC(tweet.data.author_id, RC_CONSUME.TIP);
    if (isOK != 1) return;
    let result = await recordSendPosts(transfer);
    if (!result) {
        logger.error("save transfer error: %s", JSON.stringify(transfer));
        await addRC(tweet.data.author_id, RC_CONSUME.TIP);
    } else {
        logger.debug("save transfer: %s", JSON.stringify(transfer));
    }
    return;
}

async function handleTipSteem(tweet, regGroup, registeredAccount, isEmoji) {
    let [text, s, i, f, symbol, chain, to, memo] = regGroup;
    let emoji = null;
    if (isEmoji) {
        memo = symbol;
        symbol = "STEEM";
        emoji = i;
        to = f;
        f = null;
        i = getAmountByEmoji(emoji);
        if (!i || i <= 0) {
            logger.debug(`Invalid tip emoji: from ${tweet.data.author_id} ${emoji} to ${to}`)
            return;
        }
    }
    symbol = symbol.toUpperCase();

    // check user
    let toUser;
    let tipToUser = getTipToUser(tweet, to);
    if (!tipToUser) {
        logger.debug('Tip to a none twitter user: %s', to)
        return;
    }
    // check from db
    toUser = await getAccountByTwitterId(tipToUser.twitterId);

    if (!toUser) {
        toUser = tipToUser;
    } else {
        toUser = { ...toUser, ...tipToUser }
    }

    let parentTweetId = null;
    if (tweet.data.id !== tweet.data.conversation_id) {
        parentTweetId = tweet.data.conversation_id
    }

    let user = getAuthor(tweet);
    const amount = parseFloat(i + (f ? f : ""))
    const targetTwitterId = toUser ? toUser.twitterId : null;
    let tip = {
        tweetId: tweet.data.id,
        twitterId: tweet.data.author_id,
        twitterUsername: user.username,
        steemId: registeredAccount.steemId,
        content: tweet.data.text,
        postTime: format(tweet.data.created_at),
        targetTwitterId,
        targetUsername: to,
        targetAddress: toUser ? toUser.steemId : null,
        amount: amount,
        chainName: 'STEEM',
        symbol,
        memo: memo ? memo.trim() : '',
        transferDirect: (toUser && toUser.steemId) ? 1 : 0,
        parentTweetId,
        emoji
    };
    logger.debug("[STEEM]Tip info: %s", JSON.stringify(tip, null, 4));
    const isOK = await reduceRC(tip.twitterId, RC_CONSUME.TIP)
    if (isOK != 1) return;
    let result = await recordTipPosts(tip);
    if (!result) {
        logger.error("save tip error: %s", JSON.stringify(tip));
        await addRC(tip.twitterId, RC_CONSUME.TIP)
    } else {
        logger.debug("save tip: %s", JSON.stringify(tip));
    }
    if (targetTwitterId && tip.transferDirect === 0) {
        const userInfo = await getPendingRegisterByTwitterId(targetTwitterId);
        // if the table contain the uer, do not insert new one
        await addNewPendingRecord({ twitterId: targetTwitterId, profileImg: toUser.profileImg, username: to });
        if (!userInfo) {
            logger.debug('Tip to a new twitter user:', targetTwitterId)
            await addNewAccountWhoNotRegisterNow({ ...toUser, source: 2 });
        }
    }
    return;
}

async function checkAutoCurationPermission(twitterId) {
    let curator = await getAccountByTwitterId(twitterId);
    if (!curator) return false;
    let address = curator.ethAddress;
    let balance = await checkReputation(address, 2);// NFT id 2,Can initiate automatic curation
    return balance > 0;
}

async function handleAutoCuration(curationPost, user, community) {
    // check vp
    let userVp = await getUserVP(user.id);
    if (userVp && userVp.length > 0) {
        userVp = userVp[0];
    } else {
        return;
    }
    userVp = parseInt(userVp.vp > MAX_VP ? MAX_VP : userVp.vp);

    const HIVE = community.display_tag;
    // check retweet
    let retweetId = curationPost.retweetId;
    let post = curationPost;
    let author = null;
    let auser = user;
    let curationTags = [];
    if (!!retweetId) {
        if (userVp < VP_CONSUME.QUOTE) {
            // do nothing if user has insufficient vp
            return;
        }
        // check curation exists
        const curations = await getCurationByTweetId(retweetId);
        if (curations && curations.length > 0) {
            // do nothing if the curation has been created (include created promotions)
            return;
        }
        let tweet = await client.tweets.findTweetById(retweetId, TWITTER_LISTEN_FIELDS);
        auser = getAuthor(tweet);
        if (!auser || auser.id === user.id) {
            // can't create by this way
            return;
        }
        if (tweet.data.id !== tweet.data.conversation_id) {
            // can't create curation from a comment
            return;
        }
        // check tweet is retweet
        const subRetweetId = getRetweetId(tweet);
        if (subRetweetId) {
            // Do not allow creating automatic curation with quoted tweets
            return;
        }
        if (await hasPost(retweetId) === false) {
            // create post record
            try {

                tweet = delSelfUrl(tweet)
                tweet = showOriginalUrl(tweet)
                let text = tweet.data.text.trim();
                author = await getAccountByTwitterId(tweet.data.author_id);
                // if (author && author.isRegistry === 1 && author.steemId) { } else {
                if (!author) {
                    // author = getAccountByTwitterId('1550046181283483648');    // https://twitter.com/wormhole_3
                    await addNewAccountWhoNotRegisterNow({
                        twitterId: tweet.data.author_id,
                        twitterName: auser.name,
                        twitterUsername: auser.username,
                        source: 4, profileImg: auser.profile_image_url, verified: auser.verified, followers: auser.public_metrics.followers_count, following: auser.public_metrics.following_count
                    });
                    author = await getAccountByTwitterId(tweet.data.author_id);
                }

                let tags = getTags(tweet);
                if (tags) {
                    if (tags[0] !== HIVE) {
                        tags = [HIVE].concat(tags);
                    }
                } else {
                    tags = [HIVE];
                }
                tags = tags.concat(JSON.parse(curationPost.tags))
                tags = [...new Set(tags)]
                curationTags = tags;

                let [pageInfo, content] = await fetchPageInfo(tweet, text)
                const place = getLocation(tweet)
                post = {
                    postId: tweet.data.id,
                    twitterId: author.twitterId,                  // tweet.data.author_id,
                    twitterName: author.twitterName,              // author.name,
                    twitterUsername: author.twitterUsername,      // author.username,
                    profileImg: author.profileImg,                // author.profile_image_url,
                    content,
                    steemId: author.steemId,
                    postTime: format(tweet.data.created_at),
                    tags: JSON.stringify(tags),
                    pageInfo: pageInfo.pageInfo,
                    retweetInfo: pageInfo.retweetInfo,
                    retweetId: getRetweetId(tweet),
                    location: JSON.stringify(place)
                };
                post.content = replaceImageUrl(tweet, post.content);

                const isOK = await reduceRC(user.id, RC_CONSUME.POST)
                if (isOK !== 1) return;
                let result = false;
                result = await recordPostPosts(post);
                if (!result) {
                    await addRC(user.id, RC_CONSUME.POST)
                    return;
                }

                // save tags
                await saveCurationTags(tags, retweetId);
                if (!result) {
                    logger.error("save original tweet error: %s", JSON.stringify(post));
                    return;
                } else {
                    logger.debug("save original tweet: %s", JSON.stringify(post));
                }
            } catch (e) {
                logger.error("handleAutoCuration error: ", e);
                return;
            }
        } else {
            author = await getAccountByPostId(retweetId);
        }
    } else {
        // do nothing if the auto curation has been created
        let oldCuration = await getAutoCurationByRetweet(curationPost.postId);
        if (oldCuration) return;
        curationTags = JSON.parse(curationPost.tags)
        author = await getAccountByTwitterId(curationPost.twitterId);
    }

    if (author) {
        let curationType = 1;
        // check activity
        let activities = await getActivityByCommunityId(community.community_id, true);
        console.log(1, activities, community, curationTags);
        let activitiy = null;
        for (let tag of curationTags) {
            activitiy = activities.find(a => a.tag.toLowerCase() === tag.toLowerCase());
            if (activitiy) {
                curationType = 4;
                break;
            }
        }
        console.log(2, activitiy);

        // check announcement
        for (let tag of curationTags) {
            if (tag === ANN_TAG) {
                curationType = 3;
                break;
            }
        }

        // check community owner
        if (curationType == 3) {
            if (community.owner_twitter_id != curationPost.twitterId) return;
        }

        // set endtime
        let day = new Date();
        if (activitiy) {
            day = new Date(activitiy.end_time);
        } else {
            day.setUTCDate(day.getUTCDate() + community.settle_day);
            day.setUTCHours(0, 0, 0, 0);
        }

        // create curation
        let curation = {
            twitterId: curationPost.twitterId,
            curationId: randomCurationId(),
            creatorETH: "0x36F18e8B735592dE9A32A417e482e106eAa0C77A",
            content: curationPost.content,
            token: community.reward_token,
            amount: "0",
            maxCount: 999999,
            endtime: parseInt(day.getTime() / 1000),
            transHash: null,
            tweetId: !!retweetId ? retweetId : curationPost.postId,
            authorId: author.twitterId,
            chainId: community.chain_id,
            curationType,
            tasks: 31,
            spaceId: null,
            contract: community.curation_contract,
            name: community.reward_token_name,
            symbol: community.reward_token_symbol,
            decimals: community.reward_token_decimals,
            tags: curationTags,
            beforeFollowers: auser.public_metrics.followers_count,
            communtiyId: community.community_id,
            activityId: activitiy ? activitiy.activity_id : ""
        };
        await newCuration(curation, curationPost.postId);
        await saveIsCurated(retweetId ?? curationPost.postId);
        // add first curator
        if (!!retweetId) {
            await rewardDB.createCurationRecord(curation.curationId, curation.tweetId, user.id, 1, userVp - VP_CONSUME.QUOTE);
        }
    } else {
        logger.debug(`Create auto curation failed, author does not exist. tweet id: ${curationPost.postId}`);
    }
}

var isRun = true;

process.on('SIGINT', async function () {
    logger.debug("twitter server stop...");
    isRun = false;
});

async function processing() {
    logger.debug('Twitter server start...')
    while (isRun) {
        tStr = await lPop(redis_tweet_key);
        if (tStr) {
            tweet = JSON.parse(tStr);
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
            await sleep2(config.BOT_MSG_INTERVAL, () => !isRun);
        } catch (e) {
            logger.error("curation error: ", e);
        }
    }
}

Promise.all([processing(), monitor()]).then(async res => {
    logger.debug("twitter server stopped.");
    await postMessage(`Wormhole twitter handler stopped: 🔴 🔴 🔴`);
}).catch().finally(() => {
    process.exit();
})
