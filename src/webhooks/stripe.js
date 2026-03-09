let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
    console.warn('⚠️ STRIPE_SECRET_KEY not set — Stripe webhook disabled');
}
const db = require('../services/db');

async function handleStripeWebhook(req, res) {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = req.headers['stripe-signature'];

    let event;
    try {
        if (!endpointSecret) {
            // For local testing without a signature
            event = JSON.parse(req.body.toString('utf8'));
        } else {
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        }
    } catch (err) {
        console.error(`⚠️  Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        // Retrieve the clinician ID we passed in the metadata
        const clinicianId = session.client_reference_id;
        const planType = session.metadata?.planType || 'pro'; // Default to pro fallback

        if (clinicianId) {
            console.log(`💰 Payment successful for clinician ${clinicianId}. Upgrading to ${planType.toUpperCase()} plan...`);
            try {
                await db.query(`
                    UPDATE clinicians 
                    SET plan = $1, 
                        notes_count_this_month = 0,
                        billing_cycle_reset = NOW() + INTERVAL '30 days'
                    WHERE id = $2
                `, [planType, clinicianId]);
                console.log(`✅ Clinician ${clinicianId} upgraded to ${planType}.`);
            } catch (dbErr) {
                console.error(`❌ DB Error upgrading clinician:`, dbErr);
            }
        }
    }

    // Return a 200 response to acknowledge receipt of the event
    res.send({ received: true });
}

module.exports = handleStripeWebhook;
