const nearAPI = require("near-api-js");
const config = require("../../config");
const { getByteLength } = require("../utils/helper");

const { keyStores, KeyPair, connect, Contract } = nearAPI;
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
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
    explorerUrl: "https://explorer.testnet.near.org",
};
var nearConnection = null;

async function nearInit() {
    nearConnection = await connect(connectionConfig);
    await myKeyStore.setKey(config.NEAR_NET, config.NEAR_SERVICE_ACCOUNT, KeyPair.fromString(config.NEAR_SERVICE_KEY));
}

async function getCocialContract() {
    const account = await nearConnection.account(config.NEAR_SERVICE_ACCOUNT);
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

async function socialSet(data) {
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

async function getBindingContract() {
    const account = await nearConnection.account(config.NEAR_SERVICE_ACCOUNT);
    const contract = new Contract(
        account,
        config.NEAR_BINDING_CONTRACT,
        {
            changeMethods: ["accept_binding"],
            viewMethods: ["get_proposal"],
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

async function isWritePermissionGranted(key) {
    const contract = await getCocialContract();
    let params = { predecessor_id: config.NEAR_SERVICE_ACCOUNT, key };
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
    if (tweet.images) {
        let imgs = JSON.parse(tweet.images);
        if (imgs instanceof Array && imgs.length > 0) {
            main.image = { url: imgs[0] };
        }
    }
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
    isWritePermissionPost
};
