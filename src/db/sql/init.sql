DROP TABLE IF EXISTS `user_info`;
CREATE TABLE `user_info` (
  `id` int NOT NULL AUTO_INCREMENT,
  `twitter_id` VARCHAR(64) NOT NULL COMMENT 'Twitter账号',
  `near_id` VARCHAR(64) NOT NULL COMMENT 'near 账号ID',
  `twitter_username` VARCHAR(64) DEFAULT NULL COMMENT 'Twitter username',
  `status` INT DEFAULT 0 COMMENT '状态: 0创建,1绑定上链,2链上绑定失败',
  `create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_del` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `twitter_id` (`twitter_id`),
  UNIQUE KEY `near_id` (`near_id`),
  KEY `username` (`twitter_username`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;


DROP TABLE IF EXISTS `tweets`;
CREATE TABLE `tweets` (
`tweet_id` varchar(32) NOT NULL COMMENT 'Twitter 帖子唯一ID,在Twitter中全局唯一',
`twitter_id` varchar(64) NOT NULL COMMENT '作者ID(Twitter 账号ID)',
`parent_id` varchar(32) DEFAULT NULL COMMENT '如果是评论,此值为被评论的id',
`content` text COLLATE utf8mb4_unicode_ci COMMENT 'Twitter 帖子完整内容',
`post_time` timestamp NOT NULL,
`status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '同步到Near状态: 0:未同步, 1:已同步, 2:同步失败, 3:重试失败',
`retweet_id` varchar(64) DEFAULT NULL COMMENT '转推的id',
`create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
`update_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
`is_del` tinyint(1) NOT NULL DEFAULT '0',
PRIMARY KEY (`tweet_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

DROP TABLE IF EXISTS `like_relation`;
CREATE TABLE `like_relation` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tweet_id` varchar(32) NOT NULL COMMENT 'Twitter 帖子唯一ID,在Twitter中全局唯一',
  `twitter_id` varchar(64) NOT NULL COMMENT 'Twitter 账号ID',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '同步状态: 0未同步, 1已同步, 2同步失败',
  `create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `tweet_id` (`tweet_id`,`twitter_id`) COMMENT '一个用户对一个帖子只有一个点赞记录'
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC COMMENT='点赞操作记录表'