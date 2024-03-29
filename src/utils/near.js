const nearAPI = require("near-api-js");
const config = require("../../config");
const { getByteLength, isEmpty } = require("../utils/helper");
const lodash = require("lodash");
const tweetDB = require("../db/api/tweet");

const { keyStores, KeyPair, connect, Contract, providers } = nearAPI;
const myKeyStore = new keyStores.InMemoryKeyStore();

const Platform = Object.freeze({
    Twitter: "twitter",
    Facebook: "facebook",
    Reddit: "reddit",
    GitHub: "gitHub",
    Telegram: "telegram",
    Discord: "discord",
    Instagram: "instagram",
    Ethereum: "ethereum",
    Hive: "hive",
    Steem: "steem"
});

const connectionConfig = {
    networkId: config.NEAR_NET,
    keyStore: myKeyStore, // first create a key store 
    nodeUrl: config.NEAR_NODE_RPC,
    // walletUrl: "https://wallet.testnet.near.org",
    // helperUrl: "https://helper.testnet.near.org",
    // explorerUrl: "https://explorer.testnet.near.org",
};
var nearConnection = null;

async function nearInit() {
    nearConnection = await connect(connectionConfig);
    await myKeyStore.setKey(config.NEAR_NET, config.NEAR_SENDER_ACCOUNT, KeyPair.fromString(config.NEAR_SENDER_KEY));
    await myKeyStore.setKey(config.NEAR_NET, config.NEAR_VERIFIER_ACCOUNT, KeyPair.fromString(config.NEAR_VERIFIER_KEY));
}

async function getCocialContract(_account = config.NEAR_SENDER_ACCOUNT) {
    const account = await nearConnection.account(_account);
    const contract = new Contract(
        account,
        config.NEAR_SOCIAL_CONTRACT,
        {
            changeMethods: ["set"],
            viewMethods: ["get_account_storage", "is_write_permission_granted"]
        }
    );
    return contract;
}

async function getAccountStorage(nearId) {
    const contract = await getCocialContract();
    const response = await contract.get_account_storage({ account_id: nearId });
    console.log("getAccountStorage response:", response);
    return response;
}

async function socialSet0(data) {
    const contract = await getCocialContract();
    // let params = { args: { data }, amount: "1000000000000000000000000" };
    let params = { args: { data } };
    console.log("socialSet data:", data);
    const response = await contract.set(params);
    // console.log("response:", response == "");
    if (response === "") return 1;
    if (response.includes("The attached deposit is less than the minimum storage balance")) {
        return 3;
    }
    return 2;
}

async function socialSet(data) {
    const account = await nearConnection.account(config.NEAR_SENDER_ACCOUNT);
    let result = null;
    try {
        result = await account.functionCall({
            contractId: config.NEAR_SOCIAL_CONTRACT,
            methodName: 'set',
            args: { data }
        });
    } catch (e) {
        if ("kind" in e) {
            if (e.kind.ExecutionError.includes("The attached deposit is less than the minimum storage balance"))
                return 3;
        }
        return 2;
    }
    if (result && result.status && result.status.SuccessValue == "") {
        // console.log(1, result);
        let block_hash = result.receipts_outcome instanceof Array ? result.receipts_outcome[0].block_hash : result.receipts_outcome.block_hash;
        const provider = new providers.JsonRpcProvider({ url: connectionConfig.nodeUrl });
        const block = await provider.block({ blockId: block_hash });
        return [1, block.header.height]; // [status,block_height]
    } else {
        return 2;
    }
}

async function getBindingContract(_account = config.NEAR_VERIFIER_ACCOUNT) {
    const account = await nearConnection.account(_account);
    const contract = new Contract(
        account,
        config.NEAR_BINDING_CONTRACT,
        {
            changeMethods: ["accept_binding"],
            viewMethods: ["get_proposal", "get_handle"],
        }
    );
    return contract;
}

async function acceptBinding(nearId, createdAt, platform = Platform.Twitter) {
    const contract = await getBindingContract();
    let params = { args: { account_id: nearId, platform: platform, proposal_created_at: createdAt } };
    const response = await contract.accept_binding(params);
    if (response === "") return 0;
    return response;
}

async function getProposal(nearId, platform = Platform.Twitter) {
    const contract = await getBindingContract();
    try {
        const response = await contract.get_proposal({ account_id: nearId, platform: platform });
        if (!response) return "";
        return response;
    } catch (e) {
        return e.message;
    }
}

async function getHandle(nearId, platform = Platform.Twitter) {
    const contract = await getBindingContract();
    try {
        const response = await contract.get_handle({ account_id: nearId, platform: platform });
        if (!response) return null;
        return response;
    } catch (e) {
        return e.message;
    }
}

async function isWritePermissionGranted(key) {
    const contract = await getCocialContract();
    let params = { predecessor_id: config.NEAR_SENDER_ACCOUNT, key };
    try {
        const response = await contract.is_write_permission_granted(params);
        if (response === true || response === "true") return true;
        return false;
    } catch (e) {
        console.log("isWritePermissionGranted error:", e);
        return false;
    }
}

async function isWritePermissionPost(nearId) {
    return await Promise.all([
        isWritePermissionGranted(`${nearId}/post`),
        isWritePermissionGranted(`${nearId}/index/post`),
    ]).then(res => {
        // console.log("res:", res)
        if ((res[0] === true || res[0] === "true") && (res[1] === true || res[1] === "true")) return true;
        return false;
    }).catch(e => {
        console.log("isWritePermissionPost error:", e);
        return false;
    });
}

async function isWritePermissionComment(nearId) {
    return await Promise.all([
        isWritePermissionGranted(`${nearId}/post`),
        isWritePermissionGranted(`${nearId}/index/comment`),
    ]).then(res => {
        if ((res[0] === true || res[0] === "true") && (res[1] === true || res[1] === "true")) return true;
        return false;
    }).catch(e => {
        console.log("isWritePermissionComment error:", e);
        return false;
    });
}

async function comment(tweet, parent) {
    /**
     {
        "necklace.testnet": {
            "post": {
                "comment": "{\"type\":\"md\",\"text\":\"Go, go, go! Allez, Allez, Allez!\",\"item\":{\"type\":\"social\",\"path\":\"necklace.testnet/post/main\",\"blockHeight\":130931868}}"
            },
            "index": {
                "comment": "{\"key\":{\"type\":\"social\",\"path\":\"necklace.testnet/post/main\",\"blockHeight\":130931868},\"value\":{\"type\":\"md\"}}"
            }
        }
    }
    **/
    let comment = {
        type: "md",
        text: tweet.content.replace(/^(@\S+\s+)+/, ""),
        item: { type: "social", path: `${parent.near_id}/post/main`, blockHeight: parent.block }
    };
    if (tweet.images) {
        let imgs = JSON.parse(tweet.images);
        if (imgs instanceof Array && imgs.length > 0) {
            if (imgs.length == 1) {
                comment.image = { url: imgs[0] };
            } else {
                for (let img of imgs) {
                    comment.text += `  \n![](${img})`;
                }
            }
        }
    }
    let data = {};
    data[tweet.near_id] = {
        post: { comment: JSON.stringify(comment) },
        index: { comment: `{"key":{"type":"social","path":"${parent.near_id}/post/main","blockHeight":${parent.block}},"value":{"type":"md"}}` }
    };
    // check storage
    let len = getByteLength(JSON.stringify(data));
    let storage = await getAccountStorage(tweet.near_id);
    if (!storage || storage == "null" || storage.available_bytes < len)
        return 3;

    return await socialSet(data);
}

function mergeImages(tweet) {
    let txt = "";
    if (tweet.images) {
        let imgs = JSON.parse(tweet.images);
        if (imgs instanceof Array && imgs.length > 0) {
            for (let img of imgs) {
                txt += `  \n![](${img})`;
            }
        }
    }
    return txt;
}

async function mergeRetweet(tweet) {
    let txt = "";
    if (!isEmpty(tweet.retweet_id)) {
        let retweet = await tweetDB.getTweetByTweetId(tweet.retweet_id);
        if (retweet) {
            if (!isEmpty(retweet.near_id)) {
                txt += `  \n>![](${retweet.profile_img})  @${retweet.near_id}`;
            }
            txt += `  \n>${retweet.content.replace("\n", "\n>")}`;
            let imgTxt = mergeImages(retweet);
            if (imgTxt) {
                txt += imgTxt.replace("\n", "\n>");
            }
        }
    }
    return txt;
}

async function post(tweet) {
    // `{
    //   "x-bit.near": {
    //     "post": {
    //       "main": "{\"type\":\"md\",\"image\":{\"ipfs_cid\":\"bafkreifcwihl7ejkywuqcy5tmeurnd4paagqi4v7l2wb5km4sphoi6qp6m\"},\"text\":\"this is a test msg\"}"
    //     },
    //     "index": {
    //       "post": "{\"key\":\"main\",\"value\":{\"type\":\"md\"}}"
    //     }
    //   }
    // }`

    let main = {
        type: "md",
        text: tweet.content
    };

    main.text += mergeImages(tweet);
    main.text += await mergeRetweet(tweet);

    let data = {};
    data[tweet.near_id] = {
        post: { main: JSON.stringify(main) },
        index: { post: "{\"key\":\"main\",\"value\":{\"type\":\"md\"}}" }
    };
    // check storage
    let len = getByteLength(JSON.stringify(data));
    let storage = await getAccountStorage(tweet.near_id);
    if (!storage || storage == "null" || storage.available_bytes < len)
        return 3;

    return await socialSet(data);
}

module.exports = {
    nearInit,
    socialSet,
    post,
    acceptBinding,
    Platform,
    getProposal,
    getAccountStorage,
    isWritePermissionComment,
    isWritePermissionPost,
    getHandle,
    comment
};
