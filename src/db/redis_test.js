const logger = require('../utils/logger');
const redis_test = require('redis');
require("dotenv").config();
const { KEY_SERVER_NAME, REDIS_EXPIRE_TIME, REDIS_TEST_PWD } = require("../../config");

const REDIS_TEST_HOST = process.env.REDIS_TEST_HOST || "localhost";
const REDIS_TEST_PORT = process.env.REDIS_TEST_PORT || "6379";
const REDIS_TEST_KEY = "RedisPrimaryKey";

var client_test = redis_test.createClient({
  url: `redis://:${REDIS_TEST_PWD}@${REDIS_TEST_HOST}:${REDIS_TEST_PORT}`
});
client_test.connect();

client_test.on("connect", function () {
  logger.info("Connected to the test Redis.");
}).on("error", function (err) { console.error("Connect to the test Redis failed.", err); });

/**
 * Get the primary key of redis.
 * @returns An integer number.
 */
async function getKey() {
  let key;
  try {
    key = await client_test.incr(`${KEY_SERVER_NAME}_${REDIS_TEST_KEY}`);
  } catch (error) {
    console.error("Get the primary key failed", error);
    throw error;
  }
  return key;
}

async function incrKey(key) {
  try {
    return await client_test.incr(`${KEY_SERVER_NAME}_${key}`)
  } catch (e) {
    console.error("Get the primary key failed", error);
    throw error;
  }
}

async function decrKey(key) {
  try {
    return await client_test.decr(`${KEY_SERVER_NAME}_${key}`)
  } catch (e) {
    console.error("Get the primary key failed", error);
    throw error;
  }
}

async function get(key) {
  return await client_test.get(`${KEY_SERVER_NAME}_${key}`)
}

/**
 * set user register pwd, will clear after a while
 * @param {*} _key 
 * @param {*} value 
 * @returns 
 */
async function set(_key, value, needExpire = true) {
  let key = `${KEY_SERVER_NAME}_${_key}`
  try {
    await client_test.set(key, value);
    if (needExpire) {
      await client_test.expire(key, REDIS_EXPIRE_TIME);
    }
  } catch (error) {
    console.error(`Set value into test Redis failed.Key: ${key}, Value: ${value}`);
    throw error;
  }
  return;
}

async function del(_key) {
  let key = `${KEY_SERVER_NAME}_${_key}`
  try {
    await client_test.del(key);
  } catch (error) {
    console.error(`Delete the key[${key}]from test Redis failed.`);
    throw error;
  }
  return;
}

function rPush(_key, value) {
  let key = `${KEY_SERVER_NAME}_${_key}`
  try {
    client_test.rPush(key, value);
  } catch (error) {
    console.error(`rPush the key[${key}]from test Redis failed.`);
    throw error;
  }
}

async function lPop(_key) {
  let key = `${KEY_SERVER_NAME}_${_key}`
  try {
    return await client_test.lPop(key);
  } catch (error) {
    console.error(`lPop the key[${key}]from test Redis failed.`);
    throw error;
  }
}
async function lTrim(_key) {
  let key = `${KEY_SERVER_NAME}_${_key}`
  try {
    return await client_test.lTrim(key, 1, 0)
  } catch (error) {
    console.error(`lTrim the key ${key} from test Redis failed`, error);
    throw error
  }
}

module.exports = {
  getKey,
  get,
  set,
  del,
  rPush,
  lPop,
  lTrim,
  incrKey,
  decrKey
};
