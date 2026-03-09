const line = require('@line/bot-sdk');
const { config } = require('../config');

let client;
try {
    client = new line.Client(config.line);
} catch (err) {
    console.warn(`⚠️ LINE Client disabled: ${err.message}`);
    // Stub client so other modules don't crash when calling line methods
    const stub = () => Promise.reject(new Error('LINE Client not configured'));
    client = {
        replyMessage: stub,
        pushMessage: stub,
        getProfile: stub,
        getMessageContent: stub,
    };
}

module.exports = {
    client,
    replyMessage: (token, messages) => client.replyMessage(token, messages),
    pushMessage: (to, messages) => client.pushMessage(to, messages),
    getProfile: (userId) => client.getProfile(userId),
    getMessageContent: (messageId) => client.getMessageContent(messageId),
};
