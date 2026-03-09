const onboarding = require('./onboarding');
const dailyCheckin = require('./dailyCheckin');
const OneBrain = require('../services/OneBrain');
// Payment handler removed for B2B model
const db = require('../services/db');
const line = require('../services/line');

const groq = require('../services/groq');
const tts = require('../services/edgeTtsAdapter');
const storage = require('../services/storage');
const livekitService = require('../services/livekitService');
const conversationHistory = require('../services/conversationHistory');

const healthData = require('./healthData');


// Helper to convert stream to buffer
const streamToBuffer = (stream) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
};

const handleAudio = async (event) => {
    const userId = event.source.userId;
    const messageId = event.message.id;

    try {
        // 1. Get Audio Content (Line Stream)
        const stream = await line.getMessageContent(messageId);
        const audioBuffer = await streamToBuffer(stream);

        // 2. STT (Groq Whisper)
        const userText = await groq.transcribeAudio(audioBuffer);

        if (!userText) {
            return line.replyMessage(event.replyToken, { type: 'text', text: 'ขออภัยค่ะ ไม่ได้ยินเสียง กรุณาพูดใหม่อีกครั้งนะคะ' });
        }

        // 3. ONE BRAIN: Analyze (Risk + Context)
        const userResult = await db.query('SELECT * FROM chronic_patients WHERE line_user_id = $1', [userId]);
        const user = userResult.rows[0]; // Assume user exists if sending audio

        // Pass specialized trigger to Brain
        const riskAnalysis = await OneBrain.analyzePatient(user.id, `voice_input:${userText}`);

        // Save user voice message to conversation history
        const conversationHistory = require('../services/conversationHistory');
        await conversationHistory.saveMessage({
            patientId: user.id,
            role: 'user',
            content: userText,
            messageType: 'audio',
            metadata: { source: 'line_audio' }
        });

        // 4. CHAT LAYER (Groq Llama 3): Generate Response (with history)
        const recentMessages = await conversationHistory.getRecentMessages(user.id, 20);
        const replyText = await groq.generateChatResponse(userText, riskAnalysis, user.id, recentMessages);

        // Save assistant response to conversation history
        await conversationHistory.saveMessage({
            patientId: user.id,
            role: 'assistant',
            content: replyText,
            messageType: 'audio',
            metadata: { source: 'line_audio', risk_level: riskAnalysis.level }
        });

        // 5. TTS: Generate Audio Reply
        const speechBuffer = await tts.generateSpeech(replyText);

        let messages = [
            { type: 'text', text: `🗣️ ${userText}\n\n💬 ${replyText}` } // Show what was heard + replay text
        ];

        // 6. Upload & Attach Audio
        if (speechBuffer) {
            const filename = `reply-${userId}-${Date.now()}.mp3`;
            const publicUrl = await storage.uploadAudio(speechBuffer, filename);
            if (publicUrl) {
                messages.unshift({
                    type: 'audio',
                    originalContentUrl: publicUrl,
                    duration: 5000 // Placeholder duration
                });
            }
        }

        return line.replyMessage(event.replyToken, messages);

    } catch (error) {
        console.error('❌ Error handling audio:', error);
        return line.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ขออภัยค่ะ ฮันนาไม่สามารถประมวลผลเสียงได้ในขณะนี้ 😓'
        });
    }
};

const handleFollow = async (event) => {
    const userId = event.source.userId;
    try {
        // 1. BRIDGE: Get Default Tenant (Hanna HQ) to prevent orphans
        // In a real multi-tenant app, we'd ask for a Hospital Code first.
        const tenantRes = await db.query("SELECT id FROM tenants WHERE code = 'HANNA_HQ'");
        const defaultTenantId = tenantRes.rows[0]?.id;

        const progRes = await db.query("SELECT id FROM programs WHERE tenant_id = $1 AND name = 'General Care'", [defaultTenantId]);
        const defaultProgramId = progRes.rows[0]?.id;

        // 2. Create user with Tenant Context
        await db.query(
            `INSERT INTO chronic_patients(line_user_id, enrollment_status, onboarding_step, tenant_id, program_id)
             VALUES($1, 'onboarding', 0, $2, $3) 
             ON CONFLICT(line_user_id) DO UPDATE SET 
                enrollment_status = 'onboarding', 
                onboarding_step = 0,
                tenant_id = COALESCE(chronic_patients.tenant_id, $2), -- Preserve existing if any
                program_id = COALESCE(chronic_patients.program_id, $3)`,
            [userId, defaultTenantId, defaultProgramId]
        );
        return onboarding.start(event);
    } catch (error) {
        console.error('❌ Database Error in handleFollow:', error);
        return line.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ขออภัยค่ะ ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลังนะคะ 😓'
        });
    }
};

const handleMessage = async (event) => {
    // Handle Audio Messages
    if (event.message.type === 'audio') {
        return handleAudio(event);
    }

    const userId = event.source.userId;
    let user;
    try {
        const userResult = await db.query('SELECT * FROM chronic_patients WHERE line_user_id = $1', [userId]);
        user = userResult.rows[0];
    } catch (error) {
        console.error('❌ Database Error in handleMessage:', error);
        return line.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ขออภัยค่ะ ระบบฐานข้อมูลขัดข้องชั่วคราว กรุณาลองใหม่ภายหลังนะคะ 😓'
        });
    }

    if (!user) {
        return handleFollow(event);
    }

    if (user.enrollment_status === 'onboarding') {
        return onboarding.handleInput(event, user);
    }

    // Handle expired status - Redirect to Admin/Nurse
    if (user.enrollment_status === 'expired') {
        return line.replyMessage(event.replyToken, {
            type: 'text',
            text: `สวัสดีค่ะคุณ${user.name} ! 💚\n\nสถานะบัญชีของคุณต้องได้รับการตรวจสอบ กรุณาติดต่อเจ้าหน้าที่ดูแลของคุณนะคะ`
        });
    }

    // Handle Rich Menu commands
    if (event.message.type === 'text') {
        const text = event.message.text.trim();

        // ================================================================
        // 🚨 ENHANCED EMERGENCY DETECTION (Tier 2 Upgrade)
        // ================================================================
        // Severity Levels: CRITICAL (immediate 1669), HIGH (urgent nurse callback)

        const emergencyPatterns = {
            // CRITICAL - Life-Threatening (Immediate 1669)
            critical: [
                // Cardiac
                'chest pain', 'เจ็บหน้าอก', 'แน่นหน้าอก', 'heart attack', 'หัวใจวาย',
                // Breathing
                'can\'t breathe', 'หายใจไม่ออก', 'หายใจลำบาก', 'หายใจไม่ทัน',
                // Stroke (FAST: Face, Arms, Speech, Time)
                'stroke', 'อัมพาต', 'หน้าเบี้ยว', 'แขนอ่อนแรง', 'พูดไม่ชัด', 'เห็นภาพซ้อน',
                // Loss of consciousness
                'faint', 'หมดสติ', 'เป็นลม', 'ไม่รู้ตัว', 'unconscious',
                // Severe bleeding
                'bleeding', 'เลือดออกมาก', 'เลือดไม่หยุด',
                // Diabetic emergency
                'น้ำตาลต่ำมาก', 'hypoglycemia', 'เหงื่อแตก', 'ตัวสั่น', 'สับสน'
            ],
            // HIGH - Urgent but not immediately life-threatening
            high: [
                // Concerning symptoms
                'ปวดหัวรุนแรง', 'severe headache', 'วิงเวียนมาก', 'คลื่นไส้รุนแรง',
                'ปวดท้องมาก', 'อาเจียนเป็นเลือด', 'อุจจาระเป็นเลือด',
                // Diabetes-related
                'น้ำตาลสูงมาก', 'น้ำตาล 300', 'น้ำตาล 400', 'น้ำตาล 500',
                // Hypertension-related
                'ความดันสูงมาก', 'ความดัน 180', 'ความดัน 200',
                // General emergency
                'emergency', 'ฉุกเฉิน', 'ต้องการความช่วยเหลือ', 'ช่วยด้วย', 'help'
            ]
        };

        // Check for CRITICAL emergencies
        const isCritical = emergencyPatterns.critical.some(kw =>
            text.toLowerCase().includes(kw.toLowerCase())
        );

        // Check for HIGH emergencies
        const isHigh = emergencyPatterns.high.some(kw =>
            text.toLowerCase().includes(kw.toLowerCase())
        );

        if (isCritical) {
            console.log(`🚨🚨 [Router] CRITICAL Emergency Detected: ${text}`);

            // 1. Trigger OneBrain IMMEDIATELY with critical flag
            OneBrain.analyzePatient(user.id, `CRITICAL_EMERGENCY:${text}`);

            // 2. Immediate response with 1669
            return line.replyMessage(event.replyToken, [
                {
                    type: 'text',
                    text: '🚨 ฟังฮันนานะคะ อาการนี้อันตราย!\n\n⚠️ โทร 1669 เดี๋ยวนี้เลย\nหรือให้คนใกล้ชิดพาไปโรงพยาบาลทันที\n\n✅ ฮันนาแจ้งพยาบาลแล้ว เขาจะโทรหาคุณโดยด่วนที่สุด'
                },
                {
                    type: 'flex',
                    altText: '📞 โทรฉุกเฉิน',
                    contents: {
                        type: 'bubble',
                        body: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                { type: 'text', text: '📞 กดโทรฉุกเฉินด้านล่าง', weight: 'bold', color: '#FF0000', align: 'center' }
                            ]
                        },
                        footer: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#FF0000',
                                    action: { type: 'uri', label: '📞 โทร 1669 ฉุกเฉิน', uri: 'tel:1669' }
                                }
                            ]
                        }
                    }
                }
            ]);
        }

        if (isHigh) {
            console.log(`🚨 [Router] HIGH PRIORITY Alert: ${text}`);

            // 1. Trigger OneBrain with high priority
            OneBrain.analyzePatient(user.id, `HIGH_PRIORITY:${text}`);

            // 2. Urgent but not 1669-level response
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: '⚠️ ฮันนารับทราบอาการแล้วค่ะ\n\nแจ้งพยาบาลให้รีบติดต่อกลับด่วนนะคะ\n\n💡 หากอาการแย่ลง โทร 1669 ได้เลยค่ะ'
            });
        }

        // Health Check
        if (text === 'เช็คสุขภาพ' || text === 'ตรวจสุขภาพ') {
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: `สวัสดีค่ะคุณ${user.name} ! 💚\n\nวันนี้รู้สึกอย่างไรบ้างคะ ? `,
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'message', label: 'สบายดี 😊', text: 'สบายดี' } },
                        { type: 'action', action: { type: 'message', label: 'ไม่ค่อยสบาย 😔', text: 'ไม่สบาย' } }
                    ]
                }
            });
        }

        // Log health responses
        if (text === 'สบายดี' || text === 'good') {
            await logCheckIn(userId, 'good');
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: 'ดีใจด้วยนะคะ! ขอให้วันนี้เป็นวันที่ดีต่อไปนะคะ 💚'
            });
        }

        if (text === 'ไม่สบาย' || text === 'bad') {
            await logCheckIn(userId, 'bad', 'ไม่สบาย');
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: 'เสียใจด้วยนะคะ ดูแลสุขภาพให้ดีๆ นะคะ หากอาการไม่ดีขึ้น ควรพบแพทย์ค่ะ 🩺'
            });
        }

        // Medication Log
        if (text === 'บันทึกกินยา' || text === 'บันทึกยา') {
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: `💊 บันทึกการกินยา\n\nวันนี้กินยาครบแล้วหรือยังคะ ? `,
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'message', label: 'กินแล้ว ✅', text: 'กินยาแล้ว' } },
                        { type: 'action', action: { type: 'message', label: 'ยังไม่กิน', text: 'ยังไม่ได้กินยา' } }
                    ]
                }
            });
        }

        // Log medication responses
        if (text === 'กินยาแล้ว') {
            await logMedication(userId, true);
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: 'เก่งมากค่ะ! ✅ บันทึกเรียบร้อยแล้ว การกินยาสม่ำเสมอช่วยให้สุขภาพดีขึ้นนะคะ 💊'
            });
        }

        if (text === 'ยังไม่ได้กินยา') {
            await logMedication(userId, false, 'ยังไม่กิน');
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: 'อย่าลืมกินยาให้ตรงเวลานะคะ 💊 หากมีปัญหาเรื่องยา สามารถปรึกษาฮันนาได้เสมอค่ะ'
            });
        }

        // Vitals Input Handler
        if (text === 'บันทึกค่า' || text === 'บันทึกค่าสุขภาพ') {
            return line.replyMessage(event.replyToken, {
                type: 'flex',
                altText: '📊 บันทึกค่าสุขภาพ',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: '📊 บันทึกค่าสุขภาพ', weight: 'bold', size: 'lg', color: '#06C755' },
                            { type: 'text', text: 'เลือกค่าที่ต้องการบันทึกค่ะ', margin: 'md', size: 'sm', color: '#666666' },
                            { type: 'separator', margin: 'lg' }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', color: '#FF6B6B', action: { type: 'message', label: '🩸 ความดันโลหิต', text: 'บันทึกความดัน' } },
                            { type: 'button', style: 'primary', color: '#4ECDC4', action: { type: 'message', label: '🍬 น้ำตาลในเลือด', text: 'บันทึกน้ำตาล' } },
                            { type: 'button', style: 'link', action: { type: 'message', label: 'ยกเลิก', text: 'ยกเลิก' } }
                        ]
                    }
                }
            });
        }

        // Blood Pressure Input
        if (text === 'บันทึกความดัน') {
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: '🩸 กรุณาพิมพ์ค่าความดันในรูปแบบ:\n\n**ความดัน 120/80**\n\nหรือ **BP 120/80**\n\nตัวอย่าง: ความดัน 135/85'
            });
        }

        // Glucose Input
        if (text === 'บันทึกน้ำตาล') {
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: '🍬 กรุณาพิมพ์ค่าน้ำตาลในรูปแบบ:\n\n**น้ำตาล 120**\n\nหรือ **Sugar 120**\n\nตัวอย่าง: น้ำตาล 135'
            });
        }

        // Profile with health summary
        if (text === 'โปรไฟล์ของฉัน' || text === 'ข้อมูลส่วนตัว') {
            const status = user.enrollment_status === 'trial' ? 'ทดลองใช้ฟรี' :
                user.enrollment_status === 'active' ? 'สมาชิกปกติ' : 'หมดอายุ';

            // Get 7-day summary
            const summary = await getHealthSummary(userId, 7);

            let summaryText = '';
            if (summary && summary.totalCheckIns > 0) {
                summaryText = `\n\n📊 สรุป 7 วันที่ผ่านมา: \n` +
                    `✅ เช็คอิน: ${summary.totalCheckIns} ครั้ง\n` +
                    `💊 กินยา: ${summary.medicationsTaken}/${summary.medicationsTaken + summary.medicationsMissed} ครั้ง (${summary.adherencePercent}%)\n` +
                    `😊 รู้สึกดี: ${summary.goodMoodDays} วัน`;
            }

            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: `👤 โปรไฟล์ของคุณ${user.name}\n\n` +
                    `อายุ: ${user.age} ปี\n` +
                    `ประเภท: ${user.condition || 'ไม่ระบุ'}\n` +
                    `สถานะ: ${status}` +
                    summaryText +
                    `\n\nหากต้องการแก้ไขข้อมูล กรุณาติดต่อฮันนาค่ะ`
            });
        }

        // Help
        if (text === 'ช่วยเหลือ' || text === 'help') {
            return line.replyMessage(event.replyToken, {
                type: 'flex',
                altText: '❓ ศูนย์ช่วยเหลือ',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: '❓ ศูนย์ช่วยเหลือ', weight: 'bold', size: 'xl', color: '#06C755' },
                            { type: 'text', text: 'มีอะไรให้ฮันนาช่วยไหมคะ?', margin: 'md', weight: 'bold' },
                            { type: 'separator', margin: 'md' },
                            { type: 'text', text: 'คำสั่งที่ใช้ได้:', margin: 'md', weight: 'bold', size: 'sm' },
                            { type: 'text', text: '• "เช็คสุขภาพ" - บันทึกอาการประจำวัน', size: 'sm', margin: 'sm', color: '#666666' },
                            { type: 'text', text: '• "บันทึกกินยา" - บันทึกการกินยา', size: 'sm', margin: 'sm', color: '#666666' },
                            { type: 'text', text: '• "โปรไฟล์ของฉัน" - ดูสรุปสุขภาพ', size: 'sm', margin: 'sm', color: '#666666' },
                            { type: 'text', text: '• "เริ่มใหม่" - เริ่มต้นการใช้งานใหม่', size: 'sm', margin: 'sm', color: '#666666' }
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
                                action: { type: 'uri', label: '📞 ติดต่อเจ้าหน้าที่', uri: 'https://lin.ee/519fiets' }
                            }
                        ]
                    }
                }
            });
        }

        // Admin Command: Clear Rich Menu (Protected)
        // Usage: admin:clear-richmenu:YOUR_ADMIN_SECRET
        if (text.startsWith('admin:clear-richmenu')) {
            const secret = text.split(':')[2];
            const expectedSecret = process.env.ADMIN_SECRET || 'CHANGE_ME_IN_PRODUCTION';
            if (secret !== expectedSecret) {
                return Promise.resolve(null);
            }

            const { listRichMenus, deleteRichMenu, unlinkDefaultRichMenu } = require('../services/richMenu');

            await line.replyMessage(event.replyToken, { type: 'text', text: '🧹 Clearing all Rich Menus...' });

            try {
                // 1. Unlink default menu first
                await unlinkDefaultRichMenu();

                // 2. Delete all menus
                const existing = await listRichMenus();
                for (const menu of existing) {
                    await deleteRichMenu(menu.richMenuId);
                }

                return line.pushMessage(userId, { type: 'text', text: '✅ All Rich Menus removed.' });
            } catch (error) {
                return line.pushMessage(userId, { type: 'text', text: `❌ Setup failed: ${error.message}` });
            }
        }

        // Admin Command: Setup Rich Menu (Protected)
        // Usage: admin:setup-richmenu:YOUR_ADMIN_SECRET
        if (text.startsWith('admin:setup-richmenu')) {
            const secret = text.split(':')[2];
            const expectedSecret = process.env.ADMIN_SECRET || 'CHANGE_ME_IN_PRODUCTION';
            if (secret !== expectedSecret) {
                console.warn(`[Security] Unauthorized admin attempt by ${userId}`);
                return Promise.resolve(null); // Ignore silently
            }

            console.log(`[Admin] Rich Menu setup triggered by user ${userId}`);

            // Import Rich Menu functions
            const { createRichMenu, setDefaultRichMenu, listRichMenus, deleteRichMenu, uploadRichMenuImage } = require('../services/richMenu');
            const { generateRichMenuImage } = require('../utils/imageGenerator');

            // Send initial acknowledgement
            await line.replyMessage(event.replyToken, {
                type: 'text',
                text: '🔧 Starting Rich Menu setup...\nThis may take 10-15 seconds.'
            });

            try {
                // Generate image
                console.log('[Admin] Generating Rich Menu image...');
                const imagePath = generateRichMenuImage();

                // List and delete existing menus
                console.log('[Admin] Checking existing rich menus...');
                const existing = await listRichMenus();

                if (existing.length > 0) {
                    console.log(`[Admin] Deleting ${existing.length} old rich menus...`);
                    for (const menu of existing) {
                        await deleteRichMenu(menu.richMenuId);
                    }
                }

                // Create new rich menu
                console.log('[Admin] Creating new rich menu...');
                const richMenuId = await createRichMenu();

                // Upload image
                console.log('[Admin] Uploading Rich Menu image...');
                await uploadRichMenuImage(richMenuId, imagePath);

                // Set as default
                console.log('[Admin] Setting as default rich menu...');
                await setDefaultRichMenu(richMenuId);

                console.log('[Admin] Rich Menu setup complete!');

                // Send success message
                return line.pushMessage(userId, {
                    type: 'text',
                    text: '✅ Rich Menu updated successfully!\n\nPlease close and reopen the chat to see the new menu.'
                });

            } catch (error) {
                console.error('[Admin] Rich Menu setup failed:', error);
                return line.pushMessage(userId, {
                    type: 'text',
                    text: `❌ Rich Menu setup failed:\n${error.message}`
                });
            }
        }

        // ============================================================
        // PERSISTENT CONVERSATION MEMORY (Tier 1, Task 1.2)
        // ============================================================
        // Save user message to database
        await conversationHistory.saveMessage({
            patientId: user.id,
            role: 'user',
            content: text,
            messageType: 'text',
            metadata: { source: 'line' }
        });

        // Smart Routing: Detect complex medical questions
        const complexKeywords = ['ทำไม', 'อย่างไร', 'อาการ', 'สาเหตุ', 'รักษา', 'why', 'how', 'symptom', 'cause'];
        const isComplex = complexKeywords.some(kw => text.includes(kw)) && text.length > 20;

        if (isComplex) {
            return line.replyMessage(event.replyToken, {
                type: 'flex',
                altText: '💡 คำถามนี้น่าสนใจค่ะ',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: '💡 คำถามนี้น่าสนใจค่ะ', weight: 'bold', color: '#06C755' },
                            { type: 'text', text: 'เพื่อให้ฮันนาตอบได้ละเอียดและชัดเจนกว่านี้ ลองคุยด้วยเสียงไหมคะ? ฮันนาจะอธิบายให้ฟังยาวๆ เลยค่ะ 😊', margin: 'md', wrap: true, size: 'sm' }
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
                                action: { type: 'uri', label: '📞 คุยกับฮันนา (Hanna Voice)', uri: `https://liff.line.me/${process.env.LIFF_ID}` }
                            }
                        ]
                    }
                }
            });
        }

        // Default: AI-Powered Conversation
        // Route all non-command messages through Hanna AI
        try {
            console.log(`🧠 [Router] Generating AI response for: "${text}"`);

            // Get risk context from OneBrain for safety-aware responses
            let riskProfile = { level: 'low', reasons: [] };
            try {
                riskProfile = await OneBrain.analyzePatient(user.id, `chat:${text}`);
            } catch (e) {
                console.warn('⚠️ OneBrain analysis failed, using default risk profile');
            }

            // ============================================================
            // RETRIEVE CONVERSATION HISTORY (Last 20 messages = 10 exchanges)
            // ============================================================
            const recentMessages = await conversationHistory.getRecentMessages(user.id, 20);
            console.log(`📜 [Router] Retrieved ${recentMessages.length} messages from history`);

            // ============================================================
            // GENERATE AI RESPONSE (with context + history)
            // ============================================================
            const aiReply = await groq.generateChatResponse(
                text,
                riskProfile,
                user.id,  // For patient context injection
                recentMessages  // For conversation continuity
            );

            // ============================================================
            // SAVE ASSISTANT RESPONSE TO DATABASE
            // ============================================================
            await conversationHistory.saveMessage({
                patientId: user.id,
                role: 'assistant',
                content: aiReply,
                messageType: 'text',
                metadata: {
                    source: 'line',
                    risk_level: riskProfile.level,
                    model: 'llama-3.3-70b-versatile'
                }
            });

            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: aiReply
            });
        } catch (aiError) {
            console.error('❌ AI response failed:', aiError.message);
            // Fallback to friendly acknowledgment
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: 'ขอบคุณที่ส่งข้อความมาค่ะ 💚 ขณะนี้ฮันนากำลังประมวลผล หากต้องการพูดคุยด่วน ลองกดโทรได้เลยนะคะ'
            });
        }
    }

    return Promise.resolve(null);
};

const handlePostback = async (event) => {
    const userId = event.source.userId;
    const data = new URLSearchParams(event.postback.data);
    const action = data.get('action');

    try {
        const userResult = await db.query('SELECT * FROM chronic_patients WHERE line_user_id = $1', [userId]);
        const user = userResult.rows[0];

        if (user && user.enrollment_status === 'onboarding') {
            return onboarding.handleInput(event, user);
        }

        // Route daily check-in postbacks
        if (user && ['checkin_mood', 'checkin_med', 'checkin_symptom', 'checkin_symptom_select'].includes(action)) {
            return dailyCheckin.handleCheckInPostback(event, user);
        }

        // Route follow-up postbacks (Day 1/3/7/14 responses)
        if (action && action.startsWith('day') && action.includes('_response')) {
            const followupScheduler = require('../services/followupScheduler');
            const responseText = event.postback.data;
            
            await followupScheduler.processPatientResponse(userId, responseText, responseText);
            
            // Acknowledge response
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: '✓ ขอบคุณสำหรับข้อมูลค่ะ ฮันนาบันทึกข้อมูลเรียบร้อยแล้ว 🙏'
            });
        }

        // Handle follow-up welcome acknowledgment
        if (action === 'followup_welcome') {
            const followupScheduler = require('../services/followupScheduler');
            await followupScheduler.processPatientResponse(userId, 'Acknowledged welcome message', event.postback.data);
            
            return line.replyMessage(event.replyToken, {
                type: 'text',
                text: '✓ ยินดีต้อนรับสู่โปรแกรมติดตามอาการของฮันนานะคะ 😊'
            });
        }

        return Promise.resolve(null);
    } catch (error) {
        console.error('❌ Error in handlePostback:', error);
        return line.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ขออภัยค่ะ ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลังนะคะ 😓'
        });
    }
};

module.exports = { handleFollow, handleMessage, handlePostback };
