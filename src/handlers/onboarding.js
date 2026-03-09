const db = require('../services/db');
const line = require('../services/line');

/**
 * Onboarding Flow v2.0 - Patient-First Design
 * 
 * NEW FLOW (Patient-First):
 * Step 0: Warm Welcome + Value Proposition
 * Step 1: Quick Health Check (Condition Selection)
 * Step 2: Medication Check (Yes/No)
 * Step 3: Simplified PDPA Consent
 * Step 4: Identity Verification
 * Step 5: Baseline Vitals Prompt (Optional)
 * → Activation
 * 
 * OLD FLOW (Legal-First):
 * Step 0: PDPA Consent → Step 1: Identity → Done
 */

const start = async (event) => {
    const userId = event.source.userId;

    // Step 0: Warm Welcome (Patient-First)
    const welcomeMessage = {
        type: 'flex',
        altText: '💚 สวัสดีค่ะ! ยินดีต้อนรับ',
        contents: {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: '💚 สวัสดีค่ะ!',
                        weight: 'bold',
                        size: 'xl',
                        color: '#06C755'
                    },
                    {
                        type: 'text',
                        text: 'ฮันนาเป็นพยาบาล AI ที่จะคอยดูแลสุขภาพคุณทุกวันค่ะ 😊',
                        margin: 'md',
                        wrap: true,
                        size: 'sm'
                    },
                    { type: 'separator', margin: 'lg' },
                    {
                        type: 'text',
                        text: 'ฮันนาจะช่วยคุณ:',
                        weight: 'bold',
                        margin: 'md',
                        size: 'sm'
                    },
                    { type: 'text', text: '✅ บันทึกน้ำตาล/ความดันง่ายๆ', size: 'sm', margin: 'sm' },
                    { type: 'text', text: '✅ เตือนกินยาทุกวัน', size: 'sm', margin: 'xs' },
                    { type: 'text', text: '✅ มีปัญหาบอกได้ตลอด 24 ชม.', size: 'sm', margin: 'xs' },
                    { type: 'text', text: '✅ พยาบาลจริงๆ คอยดูแลอยู่เบื้องหลัง', size: 'sm', margin: 'xs' },
                    { type: 'separator', margin: 'lg' },
                    {
                        type: 'text',
                        text: 'ใช้เวลาไม่ถึง 1 นาทีค่ะ ✨',
                        size: 'xs',
                        color: '#888888',
                        margin: 'sm',
                        align: 'center'
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: '#06C755',
                        action: {
                            type: 'postback',
                            label: 'เริ่มกันเลย! 🚀',
                            data: 'action=start_onboarding&value=yes'
                        }
                    }
                ]
            }
        }
    };

    await line.replyMessage(event.replyToken, welcomeMessage);
    await db.query('UPDATE chronic_patients SET onboarding_step = 0 WHERE line_user_id = $1', [userId]);
};

const handleInput = async (event, user) => {
    const userId = user.line_user_id;
    const step = user.onboarding_step;
    let input = '';
    let action = '';

    if (event.type === 'message' && event.message.type === 'text') {
        input = event.message.text;
    } else if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        input = data.get('value');
        action = data.get('action');
    }

    console.log(`[Onboarding v2] User ${userId} at Step ${step}. Input: ${input}, Action: ${action}`);

    // ================================================================
    // STEP 0: Welcome → Move to Condition Selection
    // ================================================================
    if (step === 0) {
        if (action === 'start_onboarding' && input === 'yes') {
            console.log(`[Onboarding] User ${userId} started. Moving to Step 1 (Condition).`);
            await db.query('UPDATE chronic_patients SET onboarding_step = 1 WHERE line_user_id = $1', [userId]);

            await line.replyMessage(event.replyToken, {
                type: 'flex',
                altText: '🩺 เลือกโรคประจำตัว',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: '🩺 คุณมีโรคประจำตัวอะไรบ้างคะ?', weight: 'bold', size: 'lg', color: '#06C755' },
                            { type: 'text', text: 'เลือกได้มากกว่า 1 ข้อนะคะ', margin: 'sm', size: 'xs', color: '#888888' }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', color: '#4ECDC4', action: { type: 'postback', label: '🍬 เบาหวาน (Diabetes)', data: 'action=select_condition&value=diabetes' } },
                            { type: 'button', style: 'primary', color: '#FF6B6B', action: { type: 'postback', label: '❤️ ความดันโลหิตสูง', data: 'action=select_condition&value=hypertension' } },
                            { type: 'button', style: 'primary', color: '#9B59B6', action: { type: 'postback', label: '💊 ทั้งเบาหวาน + ความดัน', data: 'action=select_condition&value=both' } },
                            { type: 'button', style: 'link', color: '#888888', action: { type: 'postback', label: 'ไม่แน่ใจ / อื่นๆ', data: 'action=select_condition&value=other' } }
                        ]
                    }
                }
            });
        } else {
            // Re-show welcome
            await start(event);
        }

        // ================================================================
        // STEP 1: Condition Selection → Medication Check
        // ================================================================
    } else if (step === 1) {
        if (action === 'select_condition') {
            // Map condition to proper value
            const conditionMap = {
                'diabetes': 'Diabetes Type 2',
                'hypertension': 'Hypertension',
                'both': 'Diabetes Type 2, Hypertension',
                'other': 'To be confirmed'
            };
            const condition = conditionMap[input] || 'To be confirmed';

            console.log(`[Onboarding] User ${userId} selected condition: ${condition}`);
            await db.query('UPDATE chronic_patients SET condition = $1, onboarding_step = 2 WHERE line_user_id = $2', [condition, userId]);

            // Step 2: Medication Check
            await line.replyMessage(event.replyToken, {
                type: 'flex',
                altText: '💊 ยาที่กินประจำ',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: '💊 คุณกินยาประจำไหมคะ?', weight: 'bold', size: 'lg', color: '#06C755' },
                            { type: 'text', text: 'ฮันนาจะช่วยเตือนกินยาให้นะคะ 😊', margin: 'md', size: 'sm', wrap: true, color: '#666666' }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', color: '#06C755', action: { type: 'postback', label: 'กินยาประจำ ✅', data: 'action=has_medication&value=yes' } },
                            { type: 'button', style: 'link', action: { type: 'postback', label: 'ไม่ได้กินยา', data: 'action=has_medication&value=no' } }
                        ]
                    }
                }
            });
        }

        // ================================================================
        // STEP 2: Medication → Simplified PDPA Consent
        // ================================================================
    } else if (step === 2) {
        if (action === 'has_medication') {
            const hasMeds = input === 'yes';
            console.log(`[Onboarding] User ${userId} has medication: ${hasMeds}`);

            // Store medication preference
            await db.query('UPDATE chronic_patients SET onboarding_step = 3 WHERE line_user_id = $1', [userId]);

            // Step 3: Simplified PDPA (much shorter than before)
            await line.replyMessage(event.replyToken, {
                type: 'flex',
                altText: '🔒 ความเป็นส่วนตัว',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: '🔒 ความเป็นส่วนตัว', weight: 'bold', size: 'lg', color: '#06C755' },
                            { type: 'text', text: 'ข้อมูลสุขภาพของคุณจะถูกเก็บรักษาอย่างปลอดภัย และใช้เพื่อการดูแลสุขภาพเท่านั้นค่ะ', margin: 'md', wrap: true, size: 'sm' },
                            {
                                type: 'text',
                                text: 'อ่านนโยบายความเป็นส่วนตัว',
                                size: 'xs',
                                color: '#007AFF',
                                action: { type: 'uri', label: 'อ่านนโยบาย', uri: `https://${(process.env.BASE_URL || 'hanna-line-bot-production.up.railway.app').replace(/^https?:\/\//, '')}/privacy.html` },
                                margin: 'md',
                                align: 'center'
                            }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'button', style: 'primary', color: '#06C755', action: { type: 'postback', label: 'ตกลง ยอมรับ ✅', data: 'action=consent_pdpa&value=yes' } }
                        ]
                    }
                }
            });
        }

        // ================================================================
        // STEP 3: PDPA Consent → Identity Verification
        // ================================================================
    } else if (step === 3) {
        if (action === 'consent_pdpa' && input === 'yes') {
            console.log(`[Onboarding] User ${userId} accepted PDPA. Moving to identity verification.`);
            await db.query('UPDATE chronic_patients SET consent_pdpa = TRUE, consent_date = NOW(), onboarding_step = 4 WHERE line_user_id = $1', [userId]);

            // In production: Query insurer API using LINE User ID
            // For now: Show verification with mock data
            const mockName = "คุณสมดุล";

            await line.replyMessage(event.replyToken, {
                type: 'flex',
                altText: '✅ ยืนยันตัวตน',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: '✅ ยืนยันตัวตน', weight: 'bold', size: 'lg', color: '#06C755' },
                            { type: 'text', text: 'ฮันนาพบข้อมูลสิทธิ์ของคุณ:', margin: 'md', size: 'sm', color: '#666666' },
                            { type: 'separator', margin: 'sm' },
                            { type: 'text', text: mockName, weight: 'bold', size: 'lg', margin: 'md' },
                            { type: 'text', text: 'สิทธิ์: ผู้ดูแลโรคเรื้อรัง', size: 'sm', margin: 'xs', color: '#007AFF' },
                            { type: 'separator', margin: 'md' },
                            { type: 'text', text: 'ข้อมูลนี้ถูกต้องใช่ไหมคะ?', margin: 'md', weight: 'bold', align: 'center', size: 'sm' }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', color: '#06C755', action: { type: 'postback', label: 'ใช่ ถูกต้อง ✅', data: 'action=confirm_identity&value=yes' } },
                            { type: 'button', style: 'link', color: '#FF3333', action: { type: 'postback', label: 'ไม่ใช่ฉัน', data: 'action=confirm_identity&value=no' } }
                        ]
                    }
                }
            });
        }

        // ================================================================
        // STEP 4: Identity Confirmed → Time Selection
        // ================================================================
    } else if (step === 4) {
        if (action === 'confirm_identity' && input === 'yes') {
            console.log(`[Onboarding] User ${userId} confirmed identity. Moving to time selection.`);

            // Move to time selection step
            await db.query('UPDATE chronic_patients SET onboarding_step = 5 WHERE line_user_id = $1', [userId]);

            await line.replyMessage(event.replyToken, {
                type: 'flex',
                altText: '⏰ เลือกเวลาเช็คสุขภาพ',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: '⏰ เลือกเวลาที่เหมาะสมที่สุด', weight: 'bold', size: 'lg', color: '#06C755' },
                            { type: 'text', text: 'ฮันนาจะส่งคำถามสุขภาพในเวลานี้ทุกวันค่ะ', margin: 'md', size: 'sm', color: '#666666', wrap: true }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', color: '#06C755', action: { type: 'postback', label: '🌅 08:00 (เช้า)', data: 'action=select_time&value=08:00' } },
                            { type: 'button', style: 'secondary', action: { type: 'postback', label: '☀️ 12:00 (เที่ยง)', data: 'action=select_time&value=12:00' } },
                            { type: 'button', style: 'secondary', action: { type: 'postback', label: '🌆 17:00 (เย็น)', data: 'action=select_time&value=17:00' } },
                            { type: 'button', style: 'secondary', action: { type: 'postback', label: '🌙 20:00 (ค่ำ)', data: 'action=select_time&value=20:00' } }
                        ]
                    }
                }
            });

        } else if (action === 'confirm_identity' && input === 'no') {
            await line.replyMessage(event.replyToken, {
                type: 'text',
                text: 'ขออภัยในความไม่สะดวกค่ะ 🙏\n\nหากข้อมูลไม่ถูกต้อง กรุณาติดต่อฝ่ายบริการลูกค้าของบริษัทประกันของคุณเพื่อแก้ไขข้อมูลนะคะ\n\n(หรือพิมพ์ "เริ่มใหม่" เพื่อลองอีกครั้ง)'
            });
        }

        // ================================================================
        // STEP 5: Time Selected → Activation
        // ================================================================
    } else if (step === 5) {
        if (action === 'select_time') {
            console.log(`[Onboarding] User ${userId} selected time: ${input}. Activating account.`);

            // Activate the account with preferred time
            await db.query(`
                UPDATE chronic_patients 
                SET enrollment_status = 'active', 
                    onboarding_step = 6,
                    preferred_check_in_time = $2,
                    name = COALESCE(name, 'คุณสมาชิก'), 
                    age = COALESCE(age, '65')
                WHERE line_user_id = $1`, [userId, input]);

            const timeLabels = {
                '08:00': '08:00 (เช้า)',
                '12:00': '12:00 (เที่ยง)',
                '17:00': '17:00 (เย็น)',
                '20:00': '20:00 (ค่ำ)'
            };

            // Success: Show activation + first health check prompt
            await line.replyMessage(event.replyToken, [
                {
                    type: 'text',
                    text: `🎉 ยินดีต้อนรับสู่ครอบครัวค่ะ!\n\nฮันนาพร้อมดูแลคุณแล้ว 💚\n\n📅 คำถามแรกจะมาถึงเวลา ${timeLabels[input] || input} พรุ่งนี้ค่ะ`
                },
                {
                    type: 'flex',
                    altText: '✨ เริ่มใช้งาน',
                    contents: {
                        type: 'bubble',
                        body: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                { type: 'text', text: '✨ สิ่งที่ฮันนาจะทำให้คุณ', weight: 'bold', size: 'lg', color: '#06C755' },
                                { type: 'separator', margin: 'md' },
                                { type: 'text', text: `⏰ ทักทายทุกวันเวลา ${timeLabels[input] || input}`, size: 'sm', margin: 'md' },
                                { type: 'text', text: '💊 เตือนกินยา', size: 'sm', margin: 'sm' },
                                { type: 'text', text: '📊 บันทึกค่าสุขภาพให้', size: 'sm', margin: 'sm' },
                                { type: 'text', text: '👩‍⚕️ มีปัญหา? บอกได้ตลอด', size: 'sm', margin: 'sm' },
                                { type: 'separator', margin: 'md' },
                                { type: 'text', text: 'มาเริ่มดูแลสุขภาพกันเลยนะคะ! 🌟', size: 'sm', margin: 'md', weight: 'bold', color: '#06C755' }
                            ]
                        },
                        footer: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#06C755',
                                    action: { type: 'message', label: '🩺 เช็คสุขภาพครั้งแรก', text: 'เช็คสุขภาพ' }
                                }
                            ]
                        }
                    }
                }
            ]);
        }
    }
};

module.exports = { start, handleInput };
