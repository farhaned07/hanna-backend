const axios = require('axios');

/**
 * LINE Notify Service
 * Sends alerts to the Clinic Staff Group
 */
const sendAlert = async (message) => {
    const token = process.env.LINE_NOTIFY_TOKEN;

    if (!token) {
        console.warn('⚠️ LINE_NOTIFY_TOKEN not set. Skipping alert.');
        return;
    }

    try {
        await axios.post(
            'https://notify-api.line.me/api/notify',
            new URLSearchParams({ message }),
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        console.log('🚨 Alert sent to LINE Notify');
    } catch (error) {
        console.error('❌ Error sending LINE Notify:', error.message);
    }
};

module.exports = { sendAlert };
