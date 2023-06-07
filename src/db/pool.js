var mysql = require("mysql");
var { format } = require("../utils/helper");
const { DB_PASSWORD } = require('../../config')
require("dotenv").config();

// 数据库配置信息
var config = {
  host: process.env.DB_HOST,
  port: 3306,
  user: process.env.DB_USER,
  password: DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
  charset: "utf8mb4",
  timezone: 'utc'
};

var pool = mysql.createPool(config);

pool.on("acquire", function (connection) {
  // console.log(format(Date.now()), `获取数据库连接 [${connection.threadId}]`);
});

pool.on("connection", function (connection) {
  // console.log(format(Date.now()), `创建数据库连接 [${connection.threadId}]`);
});

pool.on("enqueue", function () {
  // console.log(format(Date.now()), `正在等待可用数据库连接`);
});

pool.on("release", function (connection) {
  // console.log(format(Date.now()), `数据库连接 [${connection.threadId}] 已释放`);
});

function getConnection() {
  return new Promise((resolve, reject) => {
    pool.getConnection((e, connection) => {
      if (e) {
        console.error(format(Date.now()), "获取数据库连接失败！", e);
        reject(e);
      } else {
        resolve(connection);
      }
    });
  });
}

// 开始数据库事务
function beginTransaction(connection) {
  return new Promise((resolve, reject) => {
    connection.beginTransaction((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// 提交数据库操作
function commit(connection) {
  return new Promise((resolve, reject) => {
    connection.commit((e) => {
      if (e) {
        reject(e);
      } else {
        resolve();
      }
    });
  });
}

// 回滚数据库操作
function rollback(connection) {
  return new Promise((resolve, reject) => {
    connection.rollback((e) => {
      if (e) {
        reject(e);
      } else {
        resolve();
      }
    });
  });
}

/**
 * 执行数据库操作【适用于不需要事务的查询以及单条的增、删、改操作】
 * 示例：
 * let func = async function(conn, projectId, memberId) { ... };
 * await execute( func, projectId, memberId);
 * @param func 具体的数据库操作异步方法（第一个参数必须为数据库连接对象connection）
 * @param params func方法的参数（不包含第一个参数 connection）
 * @returns {Promise.<*>} func方法执行后的返回值
 */
async function execute(sql, params = []) {
  let connection = null;
  try {
    connection = await getConnection();
    let result = await query(connection, sql, params);
    return result;
  } finally {
    connection && connection.release && connection.release();
  }
}

function query(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (e, res) => {
      if (e) {
        console.error("SQL执行失败：", sql, "\n", params, "\n", e);
        reject(e);
      } else {
        resolve(res);
      }
    });
  })
}

/**
 * 执行数据库事务操作【适用于增、删、改多个操作的执行，如果中间数据操作出现异常则之前的数据库操作全部回滚】
 * 示例：
 * await executeTransaction(sql,values);
 * @param sql 
 * @param values
 * @returns {Promise.<*>} func方法执行后的返回值
 */
async function executeTransaction(...params) {
  const connection = await getConnection();
  await beginTransaction(connection);

  let result = null;
  try {
    result = await query(connection, ...params);
    await commit(connection);
  } catch (err) {
    console.error("Transaction fail, roll back");
    await rollback(connection);
    throw err;
  } finally {
    connection && connection.release && connection.release();
    return result;
  }
}

module.exports = {
  query,
  getConnection,
  execute,
  beginTransaction,
  commit,
  rollback,
  executeTransaction
};
