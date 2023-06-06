// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var nutbox_bot_pb = require('./nutbox_bot_pb.js');
var google_api_annotations_pb = require('./google/api/annotations_pb.js');

function serialize_nutbox_bot_BaseReply(arg) {
  if (!(arg instanceof nutbox_bot_pb.BaseReply)) {
    throw new Error('Expected argument of type nutbox_bot.BaseReply');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_nutbox_bot_BaseReply(buffer_arg) {
  return nutbox_bot_pb.BaseReply.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_nutbox_bot_PushMessageRequest(arg) {
  if (!(arg instanceof nutbox_bot_pb.PushMessageRequest)) {
    throw new Error('Expected argument of type nutbox_bot.PushMessageRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_nutbox_bot_PushMessageRequest(buffer_arg) {
  return nutbox_bot_pb.PushMessageRequest.deserializeBinary(new Uint8Array(buffer_arg));
}


var NutboxBotService = exports.NutboxBotService = {
  pushMessage: {
    path: '/nutbox_bot.NutboxBot/PushMessage',
    requestStream: false,
    responseStream: false,
    requestType: nutbox_bot_pb.PushMessageRequest,
    responseType: nutbox_bot_pb.BaseReply,
    requestSerialize: serialize_nutbox_bot_PushMessageRequest,
    requestDeserialize: deserialize_nutbox_bot_PushMessageRequest,
    responseSerialize: serialize_nutbox_bot_BaseReply,
    responseDeserialize: deserialize_nutbox_bot_BaseReply,
  },
};

exports.NutboxBotClient = grpc.makeGenericClientConstructor(NutboxBotService);
