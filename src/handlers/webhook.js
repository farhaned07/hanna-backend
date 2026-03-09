const { handleFollow, handleMessage, handlePostback } = require('./router');

const handleEvent = async (event) => {
    switch (event.type) {
        case 'follow':
            return handleFollow(event);
        case 'message':
            return handleMessage(event);
        case 'postback':
            return handlePostback(event);
        default:
            return Promise.resolve(null);
    }
};

module.exports = { handleEvent };
