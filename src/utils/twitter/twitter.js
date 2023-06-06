const { FOLLOWER_THRESHOLD, MAX_REP, MIN_REP, TWITTER_SEARCH_TOKEN } = require('../../../config')
const { Client } = require("twitter-api-sdk");
let client;

function setUpClient() {
  client = new Client(TWITTER_SEARCH_TOKEN);
  return client;
}

setUpClient()

async function getTwitterAccountByUsername(username) {
  return new Promise(async (resolve, reject) => {
    if (username){
      try {
        const user = await client.users.findUserByUsername(username)
        if (user.data) {
          resolve({twitterId: user.data.id, twitterUsername: user.data.username, twitterName: user.data.name})
        }else {
          resolve(user)
        }
      }catch(e) {
        reject(e)
      }
    }else {
      reject('Invalid username')
    }
  })
}

async function getTweetByTweetId(tweetId) {
  return new Promise(async (resolve, reject) => {
    if (tweetId) {
      try {
        const tweet = await client.tweets.findTweetById(tweetId, {
          "tweet.fields": ["id", "author_id", "text", "created_at", "conversation_id", "entities", "geo"],
            "expansions": ["author_id", "attachments.media_keys"],
            "user.fields": ["id", "name", "username", "profile_image_url"],
            "media.fields": ["media_key", "url", "preview_image_url", "width", "height", "duration_ms"]
        })
        resolve(tweet)
      }catch(e) {
        reject(e)
      }
    }else {
      reject('Invalid tweet id')
    }
  })
}

async function getSpacesByIds(spaceIds) {
  return new Promise(async (resolve, reject) => {
    try {
      const spaces = await client.spaces.findSpacesByIds({
        ids: spaceIds,
        "space.fields": ['scheduled_start','host_ids', 'speaker_ids', 'creator_id', 'participant_count','started_at','state','title','ended_at'],
        "expansions": ['invited_user_ids','speaker_ids','creator_id','host_ids'],
        "user.fields": ['profile_image_url','public_metrics','verified']
      });
      resolve(spaces);
    } catch (error) {
      console.log(53, error);
      reject(error)
    }
  })
}

async function getSpaceById(spaceId) {
  return new Promise(async (resolve, reject) => {
    try {
      const space = await client.spaces.findSpaceById(spaceId, {
        "space.fields": ['scheduled_start','host_ids', 'speaker_ids', 'creator_id', 'participant_count','started_at','state','title','ended_at'],
        "expansions": ['invited_user_ids','speaker_ids','creator_id','host_ids'],
        "user.fields": ['profile_image_url','public_metrics','verified']
      })
      resolve(space)
    } catch (error) {
      console.log(99, error);
      reject(error)
    }
  })
}

async function getUserInfo(twitterId) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!twitterId) {
        reject();
        return;
      }
      const user = await client.users.findUserById(twitterId, {
        "user.fields": ["id", "name", "username", "profile_image_url", "verified", "public_metrics", "created_at"]
      });
      resolve(user);
    } catch (error) {
      console.log('Get user info from twitter fail', twitterId, error);
      reject(error)
    }
  })
}

async function getUsersInfo(twitterIds) {
  if (!twitterIds || twitterIds.length === 0) {
    return [];
  }
  return new Promise(async (resolve, reject) => {
    try {
      const users = await client.users.findUsersById({
        ids: twitterIds,
        "user.fields": ['profile_image_url', "public_metrics", "verified"]
      });
      resolve(users);
    } catch (error) {
      reject(e)
    }
  })
}

async function getUserTimeline(userId) {
  return new Promise(async (resolve, reject) => {
    const datas = await client.tweets.usersIdMentions(userId)
    console.log(34 ,datas);
  })
}

/**
 * Only call 15 times per 15mins through twitter's api
 */
let TwitterFollowerApiEnalbe = true;

/**
 * Get user's all followers
 * @param {*} twitterId 
 * @returns 
 */
async function getFollowersById(twitterId) {
  if (TwitterFollowerApiEnalbe) {
    return new Promise(async (resolve, reject) => {
      if (twitterId) {
        try{
          let pagination_token;
          let followers = [];
          const follower = await client.users.usersIdFollowers(twitterId, {
            "user.fields": ["verified", "public_metrics"],
            max_results: 1000
          })
          if (follower.data) {
            followers = follower.data
            pagination_token = follower.meta.next_token
            while(pagination_token) {
              const follower = await client.users.usersIdFollowers(twitterId, {
                "user.fields": ["verified", "public_metrics"],
                max_results: 1000,
                pagination_token
              })
              pagination_token = null
              if (follower.data) {
                followers.concat(follower.data)
                pagination_token = follower.meta.next_token
              }
            }
            resolve(followers)
          }else if (follower.errors && follower.errors.length > 0) {
            if (follower.errors[0].detail.startsWith('Sorry, you are not authorized to see the user with id')) {
              // user hide his follower data, we calculate his reputation directly by this followers count
              resolve(-2)
            }else {
              resolve(-1)
            }
          }
        }catch(e) {
          console.log('get follower fail', e);
          if (e.toString() === 'Error: 429, Too Many Requests') {
            TwitterFollowerApiEnalbe = false
            // wait for 15mins
            setTimeout(() => TwitterFollowerApiEnalbe = true, 15 * 60 * 1000)
          }
          resolve(-1)
        }
      }else {
        resolve(-1)
      }
    })
  }else {
    return -1
  }
}

/**
 * calculate reputation of user's followers matrics
 * @param {*} userFollowers 
 * @returns 
 */
function calculateReputation(userFollowers, verified) {
  let ua = 0;
  for (let u of userFollowers) {
    const s = Math.pow(u.followers, 1.25) / (u.verified ? 1 : u.following + 1)
    ua += Math.sqrt(s)
  }
  return parseInt(verified > 0 ? (1.5 * ua) : ua)
}

/**
 * Calculate directly by user's follower number if the user hide his followers data
 * @param {*} userInfo 
 */
function calculateReputationDirect(userInfo) {
  const {followers, following, verified} = userInfo
  const flows = Object.keys(ReputationConfig).map(parseInt)
  let lower = flows[0]
  for (let flow of flows){
    if (followers < flow) {
      break;
    }
    lower = flow
  }
  const s1 = ReputationConfig[lower]
  return parseInt((verified ? 1.5 : 1) * s1 / Math.sqrt(following))
}

/**
 * Calculate user's reputation by his followers
 * @param {*} userFoluserInfolowers 
 */
async function calculatUsersReputation(userInfo) {
  const twitterId = userInfo.twitterId;
  if (userInfo.followers > FOLLOWER_THRESHOLD) {
    return MAX_REP
  }
  const userFollowers = await getFollowersById(twitterId)
  if (userFollowers === -1) {
    // api limited
    return -1
  }else if (userFollowers === -2) {
    return calculateReputationDirect(userInfo)
  }
  
  return calculateReputation(userFollowers.map(u => ({
    followers: u.public_metrics.followers_count,
    following: u.public_metrics.following_count,
    verified: u.verified
  })), userInfo.verified)
}

/**
 * Calculate user's reputation by botometer score from botometer
 * https://botometer.osome.iu.edu/
 * The score is between 0-5, more higher is more like a robot
 * We calculate the reputation that score is lower than 2 or higher than 4
 * @param {*} userInfo 
 */
function calculateUserReputationByBotometer(userInfo) {
  const botometer = userInfo.botometer;
  if (3 < botometer && botometer <= 4) {
    // handle by manual
    return 0;
  }
  const {followers, verified, following} = userInfo
  let scale = 1;
  if (following > 600 && followers > 100 && following > followers) {
    scale = followers / following;
  }
  if (followers === 0) return MIN_REP
  const F = Math.sqrt(followers, 2)
  let score = 0;
  if (botometer <= 1.8) {
    score = F * (5 - botometer) * 5
  }else if (botometer <= 3) {
    score = F * (4 - botometer) * 4
  }else if (botometer > 4) {
    score = F / (botometer - 4) / 10
  }
  const result = score * (verified ? 1.5 : 1) * scale;
  return result >= MIN_REP ? parseInt(result) : MIN_REP
}

module.exports = {
    setUpClient,
    getTwitterAccountByUsername,
    getFollowersById,
    calculateReputation,
    calculatUsersReputation,
    calculateReputationDirect,
    calculateUserReputationByBotometer,
    getTweetByTweetId,
    getUserTimeline,
    client,
    getSpaceById,
    getSpacesByIds,
    getUserInfo,
    getUsersInfo
}