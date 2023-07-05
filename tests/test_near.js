const { sleep } = require("../src/utils/helper");
const Near = require("../src/utils/near");

let main = {
    type: "md",
    text: "hello"
};

let data = {};
data["necklace.testnet"] = {
    post: { main: JSON.stringify(main) },
    index: { post: "{\"key\":\"main\",\"value\":{\"type\":\"md\"}}" }
};

async function post() {
    await Near.nearInit();
    return await Near.socialSet2(data);
}

post().then(console.log).catch(console.log).finally(() => {
    process.exit();
})