const logger = require('../utils/logger');
const redis = require('redis');
require("dotenv").config();
const { REDIS_EXPIRE_TIME, REDIS_PWD } = require("../../config");

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || "6379";
const REDIS_KEY = "RedisPrimaryKey";

var client = redis.createClient({
  url: `redis://:${REDIS_PWD}@${REDIS_HOST}:${REDIS_PORT}`
});
client.connect();

client.on("connect", function () {
  logger.info("Connected to the Redis.");
}).on("error", function (err) { console.error("Connect to the Redis failed.", err); });

/**
 * Get the primary key of redis.
 * @returns An integer number.
 */
async function getKey() {
  let key;
  try {
    key = await client.incr(REDIS_KEY);
  } catch (error) {
    console.error("Get the primary key failed", error);
    throw error;
  }
  return key;
}

async function incrKey(key) {
  try {
    return await client.incr(key)
  } catch (e) {
    console.error("Get the primary key failed", error);
    throw error;
  }
}

async function decrKey(key) {
  try {
    return await client.decr(key)
  } catch (e) {
    console.error("Get the primary key failed", error);
    throw error;
  }
}

async function get(key) {
  return await client.get(key)
}

/**
 * set user register pwd, will clear after a while
 * @param {*} key 
 * @param {*} value 
 * @returns 
 */
async function set(key, value, needExpire = true) {
  try {
    await client.set(key, value);
    if (needExpire) {
      if (typeof (needExpire) === 'number') {
        await client.expire(key, needExpire);
      } else {
        await client.expire(key, REDIS_EXPIRE_TIME);
      }
    }
  } catch (error) {
    console.error(`Set value into Redis failed. Key: ${key}, Value: ${value}`);
    throw error;
  }
  return;
}

async function del(key) {
  try {
    await client.del(key);
  } catch (error) {
    console.error(`Delete the key[${key}] from Redis failed.`);
    throw error;
  }
  return;
}

function rPush(key, value) {
  try {
    client.rPush(key, value);
  } catch (error) {
    console.error(`rPush the key[${key}] from Redis failed.`);
    throw error;
  }
}

async function lPop(key) {
  try {
    return await client.lPop(key);
  } catch (error) {
    console.error(`lPop the key[${key}] from Redis failed.`);
    throw error;
  }
}

module.exports = {
  getKey,
  get,
  set,
  del,
  rPush,
  lPop,
  incrKey,
  decrKey
};
