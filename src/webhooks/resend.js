const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = {
    info: (...args) => console.log('[resend-webhook]', ...args),
    error: (...args) => console.error('[resend-webhook]', ...args),
    warn: (...args) => console.warn('[resend-webhook]', ...args)
};

// Handle Resend webhooks
router.post('/resend', async (req, res) => {
    try {
        const { type, data } = req.body;

        if (!type || !data) {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        logger.info(`📧 Received webhook: ${type} for ${data.to}`);

        const event = {
            id: require('crypto').randomUUID(),
            messageId: data.email_id,
            leadEmail: Array.isArray(data.to) ? data.to[0] : data.to,
            eventType: type.replace('email.', ''), // e.g. 'delivered', 'opened', 'clicked'
            timestamp: new Date().toISOString(),
            raw: data
        };

        // Persist to email_events.json
        const eventsPath = path.join(process.cwd(), 'data', 'email_events.json');
        let fileData = { events: [] };

        try {
            const content = await fs.readFile(eventsPath, 'utf8');
            fileData = JSON.parse(content);
        } catch (e) {
            // File might not exist
        }

        fileData.events.push(event);
        await fs.writeFile(eventsPath, JSON.stringify(fileData, null, 2));

        res.json({ success: true });

    } catch (error) {
        logger.error('Webhook error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
