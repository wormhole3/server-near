const { ArgumentParser } = require('argparse');

const Near = require("./src/utils/near");
const Tweets = require("./src/db/api/tweet");


const parser = new ArgumentParser();

const subparsers = parser.add_subparsers({ help: 'sub-command help' })
const parser_search = subparsers.add_parser('search', { help: 'search binding.wormhole3.near data' });
parser_search.set_defaults({ command: "search" });
parser_search.add_argument('tweetId', { help: 'The tweet id to query' });

const parser_status = subparsers.add_parser('status', { help: 'manage tweets status' });
parser_status.set_defaults({ command: "status" });
parser_status.add_argument('tweetId', { help: 'The tweet id to query' });
parser_status.add_argument('-S', '--status', { type: "int", help: 'status value' });

const args = parser.parse_args();

async function searchPermission() {
    if (args.command === 'search' && args.tweetId) {
        let tweet = await Tweets.getTweetByTweetId(args.tweetId);
        if (tweet) {
            await Near.nearInit();
            let post = await Near.isWritePermissionPost(tweet.near_id);
            let comment = await Near.isWritePermissionComment(tweet.near_id);
            if (post && comment) {
                console.log(`${tweet.near_id} 已授权！`);
            } else {
                console.log(`${tweet.near_id} 未授权！`);
            }
        } else {
            console.log(`${args.tweetId} 不存在库中！`);
        }
    }
}

async function procStatus() {
    if (args.command === 'status' && args.tweetId) {
        let tweet = await Tweets.getTweetByTweetId(args.tweetId);
        if (tweet) {
            if (args.status) {
                await Tweets.updateStatus(args.tweetId, args.status);
            }
        } else {
            console.log(`${args.tweetId} 不存在库中！`);
        }
    }
}

async function main() {
    await searchPermission();
    await procStatus();
}
console.log(args);
main()
    .catch(console.error)
    .finally(() => process.exit());