module.exports = {
    config: {
        line: {
            channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
            channelSecret: process.env.LINE_CHANNEL_SECRET,
        },
        db: {
            connectionString: process.env.DATABASE_URL,
        },
        app: {
            baseUrl: process.env.BASE_URL,
        }
    }
};
