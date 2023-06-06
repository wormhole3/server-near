var grpc = require("@grpc/grpc-js");
var services = require("./nutbox_bot_grpc_pb");
var message = require("./nutbox_bot_pb");
const config = require("../../../operator.config.js")

var bot_client = new services.NutboxBotClient(config.BOT_SERVER, grpc.credentials.createInsecure());

async function postMessage(msg, channel = config.BOT_CHANNEL) {
    // let request = new message.PushMessageRequest();
    // request.setChannel(channel);
    // request.setMessage(msg);
    // return new Promise((resolve, reject) => {
    //     try {
    //         bot_client.pushMessage(request, (err, response) => {
    //             if (err) {
    //                 reject(err);
    //             } else {
    //                 resolve(response);
    //             }
    //         });
    //     } catch (e) {
    //         reject(e);
    //     }
    // });
}

module.exports = {
    postMessage
}