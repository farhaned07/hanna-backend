const db = require('../services/db');
const line = require('../services/line');
const OneBrain = require('../services/OneBrain');
const engagement = require('../services/engagement');

/**
 * Daily Check-In Handler
 * 
 * Implements the structured button-based check-in flow:
 * 1. Greeting: [ดี] [ปกติ] [ไม่ดี]
 * 2. Medication: [ได้ ครบ] [บางส่วน] [ไม่ได้เลย]
 * 3. Symptoms: [ไม่ มีแต่เรื่องดี] [มีอาการบ้าง]
 * 4. (If symptoms) Symptom Picker
 * 5. Completion
 * 
 * States:
 * - null: Not in check-in
 * - 'greeting': Waiting for mood response
 * - 'medication': Waiting for medication response
 * - 'symptoms': Waiting for symptom response
 * - 'symptom_picker': Waiting for specific symptoms
 */

// Message variations to prevent fatigue
const GREETINGS = {
    morning: [
        'ดีเช้า {name}! 🌅 วันนี้เป็นยังไง?',
        'สวัสดีตอนเช้าค่ะ {name}! ☀️ วันนี้รู้สึกดีไหม?',
        'เช้านี้เป็นไง {name}? 😊',
        'สวัสดี! 👋 วันนี้คุณรู้สึกยังไง?'
    ],
    afternoon: [
        'สวัสดีค่ะ {name}! วันนี้เป็นยังไงบ้าง?',
        'สวัสดีตอนบ่าย {name}! 🌤️ รู้สึกดีไหม?',
        'บ่ายนี้เป็นไง {name}? 😊'
    ],
    evening: [
        'สวัสดีตอนเย็น {name}! 🌆 วันนี้เป็นยังไง?',
        'เย็นนี้เป็นไง {name}? วันนี้โอเคไหม?',
        'สวัสดีค่ะ {name}! 🌙 วันนี้รู้สึกดีไหม?'
    ]
};

const MEDICATION_MESSAGES = [
    'วันนี้คุณกินยาครบไหม?',
    'กินยาครบแล้วไหมวันนี้?',
    'ยาวันนี้เรียบร้อยไหม?',
    'ทุกอย่างเกี่ยวกับยาเรียบร้อยไหม?'
];

const SYMPTOM_MESSAGES = [
    'มีอาการผิดปกติไหม?',
    'มีอาการต่างไปไหม?',
    'รู้สึกปกติดีไหม?'
];

/**
 * Get time-based greeting period
 */
const getGreetingPeriod = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    return 'evening';
};

/**
 * Get random message from array
 */
const getRandomMessage = (messages, name = '') => {
    const msg = messages[Math.floor(Math.random() * messages.length)];
    return msg.replace('{name}', name);
};

/**
 * Start daily check-in flow
 * Called by scheduler or manually
 */
// ... (Top of file remains same) ...

/**
 * START CHECK-IN (Premium Design)
 */
const startCheckIn = async (userId, userName) => {
    const period = getGreetingPeriod();
    const greeting = getRandomMessage(GREETINGS[period], userName);

    await db.query(
        `UPDATE chronic_patients 
         SET current_checkin_state = 'greeting' 
         WHERE line_user_id = $1`,
        [userId]
    );

    const message = {
        type: 'flex',
        altText: greeting,
        contents: {
            type: 'bubble',
            size: 'giga', // Max width
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '20px',
                contents: [
                    {
                        type: 'text',
                        text: 'Daily Check-in',
                        weight: 'bold',
                        color: '#06C755', // Emerald
                        size: 'xs',
                        align: 'start'
                    },
                    {
                        type: 'text',
                        text: greeting,
                        weight: 'bold',
                        size: 'xxl', // Big Hero Text
                        margin: 'md',
                        wrap: true,
                        color: '#1e293b' // Dark Slate
                    },
                    {
                        type: 'text',
                        text: 'How are you feeling right now?',
                        size: 'md',
                        color: '#64748b', // Muted text
                        margin: 'sm'
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                paddingAll: '20px',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: '#06C755',
                        height: 'md',
                        action: { type: 'postback', label: 'Great 😊', data: 'action=checkin_mood&value=good' }
                    },
                    {
                        type: 'button',
                        style: 'secondary',
                        height: 'md',
                        action: { type: 'postback', label: 'Normal 😐', data: 'action=checkin_mood&value=ok' }
                    },
                    {
                        type: 'button',
                        style: 'linked', // Looks like danger link
                        color: '#ef4444',
                        height: 'md',
                        action: { type: 'postback', label: 'Not Good 😟', data: 'action=checkin_mood&value=bad' }
                    }
                ]
            }
        }
    };

    return line.pushMessage(userId, message);
};


/**
 * HANDLE POSTBACK (Premium Design)
 */
const handleCheckInPostback = async (event, user) => {
    const userId = user.line_user_id;
    const data = new URLSearchParams(event.postback.data);
    const action = data.get('action');
    const value = data.get('value');

    console.log(`[DailyCheckIn] User ${userId}, Action: ${action}, Value: ${value}`);

    // --- STEP 1: MOOD -> MEDS ---
    if (action === 'checkin_mood') {
        // ... (DB Logic Same) ...
        await db.query(`INSERT INTO check_ins (patient_id, mood, check_in_time) VALUES ((SELECT id FROM chronic_patients WHERE line_user_id = $1), $2, NOW()) ON CONFLICT DO NOTHING`, [userId, value]);
        await db.query(`UPDATE chronic_patients SET current_checkin_state = 'medication', last_response_date = CURRENT_DATE WHERE line_user_id = $1`, [userId]);
        if (value === 'bad') {
            const p = await db.query('SELECT id FROM chronic_patients WHERE line_user_id = $1', [userId]);
            if (p.rows[0]) OneBrain.analyzePatient(p.rows[0].id, 'mood_bad');
        }

        const medQuestion = getRandomMessage(MEDICATION_MESSAGES);

        return line.replyMessage(event.replyToken, {
            type: 'flex',
            altText: medQuestion,
            contents: {
                type: 'bubble',
                size: 'giga',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '20px',
                    contents: [
                        { type: 'text', text: 'Step 2 of 3', weight: 'bold', color: '#06C755', size: 'xs' },
                        { type: 'text', text: medQuestion, weight: 'bold', size: 'xl', margin: 'md', wrap: true, color: '#1e293b' },
                        { type: 'text', text: 'Did you take your prescribed pills?', size: 'md', color: '#64748b', margin: 'sm' }
                    ]
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'md',
                    paddingAll: '20px',
                    contents: [
                        { type: 'button', style: 'primary', color: '#06C755', height: 'md', action: { type: 'postback', label: 'Yes, All ✅', data: 'action=checkin_med&value=full' } },
                        {
                            type: 'box',
                            layout: 'horizontal',
                            spacing: 'md',
                            contents: [
                                { type: 'button', style: 'secondary', height: 'md', action: { type: 'postback', label: 'Some', data: 'action=checkin_med&value=partial' } },
                                { type: 'button', style: 'secondary', height: 'md', action: { type: 'postback', label: 'None', data: 'action=checkin_med&value=none' } }
                            ]
                        },
                        { type: 'button', style: 'link', height: 'sm', color: '#94a3b8', action: { type: 'postback', label: 'I Forgot', data: 'action=checkin_med&value=forgot' } }
                    ]
                }
            }
        });
    }

    // --- STEP 2: MEDS -> SYMPTOMS ---
    if (action === 'checkin_med') {
        // ... (DB Logic Same) ...
        const taken = value === 'full';
        await db.query(`UPDATE check_ins SET medication_taken = $2, medication_notes = $3 WHERE patient_id = (SELECT id FROM chronic_patients WHERE line_user_id = $1) AND DATE(check_in_time) = CURRENT_DATE`, [userId, taken, value]);
        await db.query(`UPDATE chronic_patients SET current_checkin_state = 'symptoms' WHERE line_user_id = $1`, [userId]);
        if (value === 'none') {
            const p = await db.query('SELECT id FROM chronic_patients WHERE line_user_id = $1', [userId]);
            if (p.rows[0]) OneBrain.analyzePatient(p.rows[0].id, 'missed_medication');
        }

        const symptomQuestion = getRandomMessage(SYMPTOM_MESSAGES);

        return line.replyMessage(event.replyToken, {
            type: 'flex',
            altText: symptomQuestion,
            contents: {
                type: 'bubble',
                size: 'giga',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '20px',
                    contents: [
                        { type: 'text', text: 'Final Step', weight: 'bold', color: '#06C755', size: 'xs' },
                        { type: 'text', text: symptomQuestion, weight: 'bold', size: 'xl', margin: 'md', wrap: true, color: '#1e293b' },
                        { type: 'text', text: 'Any discomfort or pain today?', size: 'md', color: '#64748b', margin: 'sm' }
                    ]
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'md',
                    paddingAll: '20px',
                    contents: [
                        { type: 'button', style: 'primary', color: '#06C755', height: 'md', action: { type: 'postback', label: 'No, I feel good 👍', data: 'action=checkin_symptom&value=none' } },
                        { type: 'button', style: 'secondary', color: '#ef4444', height: 'md', action: { type: 'postback', label: 'Yes, I have symptoms', data: 'action=checkin_symptom&value=has' } }
                    ]
                }
            }
        });
    }

    // --- STEP 3: SYMPTOMS -> PICKER ---
    if (action === 'checkin_symptom') {
        if (value === 'none') {
            // COMPLETE
            await db.query(`UPDATE chronic_patients SET current_checkin_state = NULL WHERE line_user_id = $1`, [userId]);
            const streakMsg = await getStreakMessage(userId);

            return line.replyMessage(event.replyToken, {
                type: 'flex',
                altText: 'Check-in Complete',
                contents: {
                    type: 'bubble',
                    size: 'kilo',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        paddingAll: '20px',
                        contents: [
                            { type: 'text', text: 'All Done! 🌟', weight: 'bold', size: 'xl', color: '#06C755', align: 'center' },
                            { type: 'text', text: 'Thanks for updating your health status.', margin: 'md', align: 'center', color: '#64748b', size: 'sm', wrap: true },
                            ...(streakMsg ? [{ type: 'text', text: streakMsg, margin: 'lg', align: 'center', weight: 'bold', color: '#f59e0b' }] : [])
                        ]
                    }
                }
            });
        } else {
            // PICKER
            await db.query(`UPDATE chronic_patients SET current_checkin_state = 'symptom_picker' WHERE line_user_id = $1`, [userId]);

            // Helper for symptom button
            const symBtn = (label, val) => ({
                type: 'button', style: 'secondary', height: 'sm',
                action: { type: 'postback', label: label, data: `action=checkin_symptom_select&value=${val}` },
                flex: 1, margin: 'xs'
            });

            return line.replyMessage(event.replyToken, {
                type: 'flex',
                altText: 'Select Symptoms',
                contents: {
                    type: 'bubble',
                    size: 'giga',
                    header: {
                        type: 'box', layout: 'vertical', backgroundColor: '#fef2f2', paddingAll: '20px', // Light Red BG
                        contents: [
                            { type: 'text', text: 'Tell us more', weight: 'bold', color: '#ef4444', size: 'lg' },
                            { type: 'text', text: 'Select all that apply', size: 'xs', color: '#ef4444' }
                        ]
                    },
                    body: {
                        type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
                        contents: [
                            { type: 'box', layout: 'horizontal', contents: [symBtn('Fever 🌡️', 'fever'), symBtn('Headache', 'headache')] },
                            { type: 'box', layout: 'horizontal', contents: [symBtn('Nausea', 'nausea'), symBtn('Breathless', 'sob')] },
                            { type: 'box', layout: 'horizontal', contents: [symBtn('Pain/Swelling', 'pain'), symBtn('Fatigue', 'fatigue')] },
                            { type: 'button', style: 'link', action: { type: 'postback', label: 'Other...', data: 'action=checkin_symptom_select&value=other' } }
                        ]
                    }
                }
            });
        }
    }

    // --- STEP 4: SELECTION -> ALERT ---
    if (action === 'checkin_symptom_select') {
        const symptomLabels = { 'fever': 'Fever', 'headache': 'Headache', 'nausea': 'Nausea', 'sob': 'Short of Breath', 'pain': 'Pain', 'fatigue': 'Fatigue', 'other': 'Other' };
        const symptom = symptomLabels[value] || value;

        await db.query(`UPDATE check_ins SET symptoms = $2 WHERE patient_id = (SELECT id FROM chronic_patients WHERE line_user_id = $1) AND DATE(check_in_time) = CURRENT_DATE`, [userId, symptom]);
        await db.query(`UPDATE chronic_patients SET current_checkin_state = NULL WHERE line_user_id = $1`, [userId]);

        const p = await db.query('SELECT id FROM chronic_patients WHERE line_user_id = $1', [userId]);
        if (p.rows[0]) {
            OneBrain.analyzePatient(p.rows[0].id, `symptom:${symptom}`);
            engagement.trackRecurringSymptom(p.rows[0].id, symptom);
        }

        return line.replyMessage(event.replyToken, {
            type: 'flex',
            altText: 'Recorded',
            contents: {
                type: 'bubble',
                size: 'kilo',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '20px',
                    contents: [
                        { type: 'text', text: 'Recorded 📝', weight: 'bold', size: 'lg', color: '#1e293b' },
                        { type: 'text', text: `Symptom: ${symptom}`, margin: 'md', color: '#ef4444', weight: 'bold' },
                        { type: 'separator', margin: 'lg' },
                        { type: 'text', text: 'Nurse notified.', margin: 'md', size: 'xs', color: '#94a3b8' },
                        { type: 'button', style: 'primary', color: '#1e293b', margin: 'lg', action: { type: 'message', label: 'Request Help', text: 'HELP' } }
                    ]
                }
            }
        });
    }

    return null;
};


/**
 * Get streak celebration message (if applicable)
 */
const getStreakMessage = async (userId) => {
    try {
        // Get consecutive check-in days
        const result = await db.query(`
            SELECT COUNT(DISTINCT DATE(check_in_time)) as streak
            FROM check_ins
            WHERE patient_id = (SELECT id FROM chronic_patients WHERE line_user_id = $1)
            AND check_in_time >= CURRENT_DATE - INTERVAL '30 days'
        `, [userId]);

        const streak = parseInt(result.rows[0]?.streak || 0);

        if (streak === 7) return '🔥 7 วันติดต่อกัน! สุดยอด!';
        if (streak === 14) return '🏆 2 อาทิตย์แล้ว! เก่งมาก!';
        if (streak === 30) return '⭐ 1 เดือนเต็ม! ยอดเยี่ยม!';

        return null;
    } catch (e) {
        console.error('Error getting streak:', e);
        return null;
    }
};

/**
 * Check if user is in check-in flow
 */
const isInCheckInFlow = (user) => {
    return user.current_checkin_state &&
        ['greeting', 'medication', 'symptoms', 'symptom_picker'].includes(user.current_checkin_state);
};

module.exports = {
    startCheckIn,
    handleCheckInPostback,
    isInCheckInFlow,
    getStreakMessage
};
