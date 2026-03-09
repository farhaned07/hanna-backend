/**
 * 🏥 Hanna Medical Terminology Database
 * Comprehensive multilingual medical knowledge base
 * 
 * Supported Languages:
 * - Thai (th) 🇹🇭
 * - Bangla/Bengali (bn) 🇧🇩
 * - English (en) 🇬🇧
 * - Hindi (hi) 🇮🇳
 * - Urdu (ur) 🇵🇰
 * - Spanish (es) 🇪🇸
 * - French (fr) 🇫🇷
 * - Arabic (ar) 🇸🇦
 * 
 * Categories:
 * - Conditions (diseases, disorders)
 * - Symptoms (complaints, signs)
 * - Medications (drugs, treatments)
 * - Anatomy (body parts, organs)
 * - Procedures (tests, operations)
 * - Vitals (measurements, ranges)
 */

// ═══════════════════════════════════════════════════════════
// MEDICAL TERMINOLOGY BY CATEGORY
// ═══════════════════════════════════════════════════════════

const medicalTerms = {
    // ─────────────────────────────────────────────────────────
    // CONDITIONS (Diseases & Disorders)
    // ─────────────────────────────────────────────────────────
    conditions: {
        th: [
            'เบาหวาน', 'ความดันโลหิตสูง', 'โรคหัวใจ', 'โรคไต',
            'โรคตับ', 'โรคมะเร็ง', 'โรคปอด', 'โรคหอบหืด',
            'โรคภูมิแพ้', 'โรคเกาต์', 'โรคไขมันในเลือดสูง',
            'โรคไทรอยด์', 'โรคกระเพาะ', 'โรคลำไส้', 'โรคอ้วน',
            'โรคซึมเศร้า', 'โรควิตกกังวล', 'โรคอัลไซเมอร์',
            'โรคพาร์กินสัน', 'โรคหลอดเลือดสมอง', 'โรคไขข้อ',
            'โรคกระดูกพรุน', 'โรคเกาต์', 'โรคโลหิตจาง'
        ],
        bn: [
            'ডায়াবেটিস', 'উচ্চ রক্তচাপ', 'হৃদরোগ', 'কিডনি রোগ',
            'লিভার রোগ', 'ক্যান্সার', 'ফুসফুস রোগ', 'হাঁপানি',
            'অ্যালার্জি', 'বাত', 'উচ্চ কোলেস্টেরল',
            'থাইরয়েড', 'গ্যাস্ট্রিক', 'পেটের রোগ', 'স্থূলতা',
            'বিষণ্নতা', 'উদ্বেগ', 'আলঝেইমার',
            'পারকিনসন', 'স্ট্রোক', 'আর্থ্রাইটিস',
            'অস্টিওপোরোসিস', 'রক্তাল্পতা', 'ম্যালেরিয়া',
            'যক্ষ্মা', 'টাইফয়েড', 'ডেঙ্গু', 'কলেরা'
        ],
        en: [
            'diabetes', 'hypertension', 'heart disease', 'kidney disease',
            'liver disease', 'cancer', 'lung disease', 'asthma',
            'allergy', 'arthritis', 'high cholesterol',
            'thyroid', 'gastritis', 'IBS', 'obesity',
            'depression', 'anxiety', 'Alzheimer',
            'Parkinson', 'stroke', 'osteoporosis',
            'anemia', 'malaria', 'tuberculosis',
            'typhoid', 'dengue', 'cholera', 'hepatitis'
        ],
        hi: [
            'मधुमेह', 'उच्च रक्तचाप', 'हृदय रोग', 'किडनी रोग',
            'लिवर रोग', 'कैंसर', 'फेफड़े का रोग', 'अस्थमा',
            'एलर्जी', 'गठिया', 'उच्च कोलेस्ट्रॉल',
            'थायराइड', 'गैस्ट्रिक', 'मोटापा',
            'अवसाद', 'चिंता', 'अल्जाइमर'
        ],
        ur: [
            'شوگر', 'ہائی بلڈ پریشر', 'دل کی بیماری', 'گردے کی بیماری',
            'جگر کی بیماری', 'کینسر', 'پھیپھڑے کی بیماری', 'دمہ',
            ' الرجی', 'گٹھیا', 'کولیسٹرول',
            'تھائیرائیڈ', 'موتاپا',
            'ڈپریشن', 'بے چینی'
        ],
        es: [
            'diabetes', 'hipertensión', 'enfermedad cardíaca', 'cáncer',
            'asma', 'artritis', 'obesidad', 'depresión'
        ],
        fr: [
            'diabète', 'hypertension', 'maladie cardiaque', 'cancer',
            'asthme', 'arthrite', 'obésité', 'dépression'
        ],
        ar: [
            'السكري', 'ارتفاع ضغط الدم', 'أمراض القلب', 'السرطان',
            'الربو', 'التهاب المفاصل', 'السمنة', 'الاكتئاب'
        ]
    },

    // ─────────────────────────────────────────────────────────
    // SYMPTOMS
    // ─────────────────────────────────────────────────────────
    symptoms: {
        th: [
            'ปวดหัว', 'ปวดท้อง', 'ปวดหลัง', 'ปวดข้อ',
            'ไข้', 'ไอ', 'จาม', 'น้ำมูก',
            'คลื่นไส้', 'อาเจียน', 'ท้องเสีย', 'ท้องผูก',
            'เวียนหัว', 'หน้ามืด', 'เหนื่อย', 'อ่อนเพลีย',
            'หายใจลำบาก', 'เจ็บหน้าอก', 'บวม', 'แดง',
            'คัน', '皮疹', 'นอนไม่หลับ', 'เบื่ออาหาร',
            'น้ำหนักลด', 'น้ำหนักเพิ่ม', 'กระหายน้ำ', 'ปัสสาวะบ่อย'
        ],
        bn: [
            'মাথাব্যথা', 'পেটব্যথা', 'পিঠব্যথা', 'জয়েন্টব্যথা',
            'জ্বর', 'কাশি', 'সর্দি', 'গলাব্যথা',
            'বমিভাব', 'বমি', 'পেট খারাপ', 'কোষ্ঠকাঠিন্য',
            'মাথাঘোরা', 'দুর্বলতা', 'ক্লান্তি',
            'শ্বাসকষ্ট', 'বুকব্যথা', 'ফোলা',
            'চুলকানি', 'ঘুমের সমস্যা', 'ক্ষুধামন্দা',
            'ওজন কমা', 'ওজন বাড়', 'ঘনঘন প্রস্রাব'
        ],
        en: [
            'headache', 'stomach pain', 'back pain', 'joint pain',
            'fever', 'cough', 'sneeze', 'runny nose',
            'nausea', 'vomiting', 'diarrhea', 'constipation',
            'dizziness', 'fatigue', 'weakness',
            'shortness of breath', 'chest pain', 'swelling',
            'itching', 'rash', 'insomnia', 'loss of appetite',
            'weight loss', 'weight gain', 'thirst', 'frequent urination'
        ],
        hi: [
            'सिरदर्द', 'पेटदर्द', 'पीठदर्द', 'जोड़दर्द',
            'बुखार', 'खांसी', 'छींक', 'गलादर्द',
            'मतली', 'उल्टी', 'दस्त', 'कब्ज',
            'चक्कर', 'थकान', 'कमजोरी',
            'सांस लेने में तकलीफ', 'सीने में दर्द'
        ],
        ur: [
            'سر درد', 'پیٹ درد', 'پیٹھ درد', 'جوڑوں کا درد',
            'بخار', 'کھانسی', 'نزلہ', 'گلے کی خراش',
            'متلی', 'الٹی', 'دست', 'قبض',
            'چکر', 'تھکاوٹ', 'کمزوری',
            'سانس لینے میں تکلیف', 'سینے میں درد'
        ]
    },

    // ─────────────────────────────────────────────────────────
    // MEDICATIONS
    // ─────────────────────────────────────────────────────────
    medications: {
        th: [
            'พาราเซตามอล', 'ไอบูโพรเฟน', 'แอสไพริน',
            'อินซูลิน', 'เมตฟอร์มิน', 'กลิเบนคลาไมด์',
            'ยาลดความดัน', 'ยาขับปัสสาวะ', 'ยาขยายหลอดเลือด',
            'ยาปฏิชีวนะ', 'อะม็อกซีซิลลิน', 'azitromycin',
            'ยาแก้แพ้', 'loratadine', 'cetirizine',
            'ยาแก้ไอ', 'ยาแก้คลื่นไส้', 'omeprazole',
            'วิตามิน', 'แร่ธาตุ', 'อาหารเสริม'
        ],
        bn: [
            'প্যারাসিটামল', 'আইবুপ্রোফেন', 'অ্যাসপিরিন',
            'ইনসুলিন', 'মেটফরমিন', 'গ্লিবেনক্লামাইড',
            'রক্তচাপের ঔষধ', 'ডাইইউরেটিক্স',
            'অ্যান্টিবায়োটিক', 'অ্যামোক্সিসিলিন', 'অ্যাজিথ্রোমাইসিন',
            'অ্যালার্জির ঔষধ', 'লোরাটাদিন', 'সেটিরিজিন',
            'কাশির ঔষধ', 'বমির ঔষধ', 'ওমেপ্রাজল',
            'ভিটামিন', 'মিনারেলস', 'সাপ্লিমেন্ট'
        ],
        en: [
            'paracetamol', 'ibuprofen', 'aspirin',
            'insulin', 'metformin', 'glibenclamide',
            'antihypertensive', 'diuretics', 'vasodilator',
            'antibiotic', 'amoxicillin', 'azithromycin',
            'antihistamine', 'loratadine', 'cetirizine',
            'cough syrup', 'antiemetic', 'omeprazole',
            'vitamins', 'minerals', 'supplements',
            'statins', 'beta blockers', 'ACE inhibitors'
        ],
        hi: [
            'पैरासिटामोल', 'इबुप्रोफेन', 'एस्पिरिन',
            'इंसुलिन', 'मेटफॉर्मिन',
            'एंटीबायोटिक', 'विटामिन'
        ],
        ur: [
            'پیراسیٹامول', 'آئیبوپروفین', 'ایسپرین',
            'انسولین', 'میٹفارمن',
            'اینٹی بائیوٹک', 'وٹامن'
        ]
    },

    // ─────────────────────────────────────────────────────────
    // ANATOMY (Body Parts & Organs)
    // ─────────────────────────────────────────────────────────
    anatomy: {
        th: [
            'หัวใจ', 'ปอด', 'ตับ', 'ไต',
            'กระเพาะ', 'ลำไส้', 'สมอง', 'กระดูก',
            'กล้ามเนื้อ', 'เลือด', 'หลอดเลือด', 'เส้นประสาท',
            'ตา', 'หู', 'จมูก', 'ปาก',
            'คอ', 'อก', 'ท้อง', 'หลัง',
            'แขน', 'ขา', 'มือ', 'เท้า',
            'ผิวหนัง', 'ผม', 'เล็บ'
        ],
        bn: [
            'হৃদপিণ্ড', 'ফুসফুস', 'লিভার', 'কিডনি',
            'পাকস্থলী', 'অন্ত্র', 'মস্তিষ্ক', 'হাড়',
            'পেশী', 'রক্ত', 'রক্তনালী', 'স্নায়ু',
            'চোখ', 'কান', 'নাক', 'মুখ',
            'গলা', 'বুক', 'পেট', 'পিঠ',
            'হাত', 'পা', 'চামড়া', 'চুল'
        ],
        en: [
            'heart', 'lungs', 'liver', 'kidneys',
            'stomach', 'intestines', 'brain', 'bones',
            'muscles', 'blood', 'blood vessels', 'nerves',
            'eyes', 'ears', 'nose', 'mouth',
            'throat', 'chest', 'abdomen', 'back',
            'arms', 'legs', 'hands', 'feet',
            'skin', 'hair', 'nails'
        ],
        hi: [
            'दिल', 'फेफड़े', 'लिवर', 'किडनी',
            'पेट', 'आंत', 'दिमाग', 'हड्डी',
            'मांसपेशी', 'खून', 'नस',
            'आंख', 'कान', 'नाक', 'मुंह'
        ],
        ur: [
            'دل', 'پھیپھڑے', 'جگر', 'گردے',
            'پیٹ', 'آنت', 'دماغ', 'ہڈی',
            'پٹھے', 'خون', 'نس',
            'آنکھ', 'کان', 'ناک', 'منہ'
        ]
    },

    // ─────────────────────────────────────────────────────────
    // VITALS & MEASUREMENTS
    // ─────────────────────────────────────────────────────────
    vitals: {
        th: [
            'ความดันโลหิต', 'ชีพจร', 'อุณหภูมิ',
            'น้ำตาลในเลือด', 'ออกซิเจนในเลือด',
            'mmHg', 'mg/dL', 'เปอร์เซ็นต์',
            'สูง', 'ต่ำ', 'ปกติ', 'อันตราย'
        ],
        bn: [
            'রক্তচাপ', 'হৃদস্পন্দন', 'তাপমাত্রা',
            'রক্তে শর্করা', 'রক্তে অক্সিজেন',
            'মিমিএইচজি', 'মিগ্রা/ডেএল', 'শতাংশ',
            'উচ্চ', 'নিম্ন', 'স্বাভাবিক', 'বিপজ্জনক'
        ],
        en: [
            'blood pressure', 'pulse', 'temperature',
            'blood sugar', 'blood glucose', 'oxygen saturation',
            'mmHg', 'mg/dL', 'percent',
            'high', 'low', 'normal', 'critical',
            'systolic', 'diastolic', 'bpm', 'celsius', 'fahrenheit'
        ],
        hi: [
            'रक्तचाप', 'नब्ज', 'तापमान',
            'रक्त शर्करा', 'ऑक्सीजन',
            'उच्च', 'निम्न', 'सामान्य'
        ],
        ur: [
            'بلڈ پریشر', 'نبض', 'درجہ حرارت',
            'بلڈ شوگر', 'آکسیجن',
            'زیادہ', 'کم', 'عام'
        ]
    },

    // ─────────────────────────────────────────────────────────
    // PROCEDURES & TESTS
    // ─────────────────────────────────────────────────────────
    procedures: {
        th: [
            'ตรวจเลือด', 'ตรวจปัสสาวะ', 'เอกซเรย์',
            'อัลตราซาวด์', 'CT scan', 'MRI',
            'ผ่าตัด', 'ฉีดยา', 'ให้ยา',
            'นัดหมาย', 'ติดตาม', 'ส่งต่อ'
        ],
        bn: [
            'রক্ত পরীক্ষা', 'প্রস্রাব পরীক্ষা', 'এক্সরে',
            'আল্ট্রাসাউন্ড', 'সিটি স্ক্যান', 'এমআরআই',
            'অস্ত্রোপচার', 'ইনজেকশন', 'ঔষধ',
            'অ্যাপয়েন্টমেন্ট', 'ফলোআপ', 'রেফার'
        ],
        en: [
            'blood test', 'urine test', 'X-ray',
            'ultrasound', 'CT scan', 'MRI', 'ECG', 'EKG',
            'surgery', 'operation', 'injection', 'prescription',
            'appointment', 'follow-up', 'referral', 'admission'
        ],
        hi: [
            'खून की जांच', 'यूरिन टेस्ट', 'एक्सरे',
            'अल्ट्रासाउंड', 'सीटी स्कैन', 'एमआरआई',
            'सर्जरी', 'इंजेक्शन', 'दवा'
        ],
        ur: [
            'خون کا ٹیسٹ', 'پیشاب کا ٹیسٹ', 'ایکس رے',
            'الٹراساؤنڈ', 'سی ٹی اسکین', 'ایم آر آئی',
            'سرجری', 'انجکشن', 'دوا'
        ]
    }
};

// ═══════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Get all medical terms for a specific language
 * @param {string} lang - Language code (th, bn, en, hi, ur, es, fr, ar)
 * @returns {string[]} Array of medical terms
 */
function getMedicalTerms(lang) {
    const terms = [];
    Object.values(medicalTerms).forEach(category => {
        if (category[lang]) {
            terms.push(...category[lang]);
        }
    });
    return terms;
}

/**
 * Get all medical terms across all languages (for Deepgram keywords)
 * @returns {string[]} Array of all medical terms
 */
function getAllMedicalTerms() {
    const terms = [];
    Object.values(medicalTerms).forEach(category => {
        Object.values(category).forEach(langTerms => {
            terms.push(...langTerms);
        });
    });
    return [...new Set(terms)]; // Remove duplicates
}

/**
 * Get terms for specific category and language
 * @param {string} category - Category name (conditions, symptoms, medications, etc.)
 * @param {string} lang - Language code
 * @returns {string[]} Array of terms
 */
function getTermsByCategory(category, lang) {
    return medicalTerms[category]?.[lang] || [];
}

/**
 * Get boosted terms (most common medical terms for priority recognition)
 * @returns {string[]} Array of high-priority terms
 */
function getBoostedTerms() {
    return [
        // English
        'diabetes', 'hypertension', 'insulin', 'metformin', 'glucose',
        'paracetamol', 'antibiotic', 'blood pressure', 'heart', 'kidney',
        
        // Thai
        'เบาหวาน', 'ความดัน', 'อินซูลิน', 'เมตฟอร์มิน', 'น้ำตาล',
        'พาราเซตามอล', 'หัวใจ', 'ไต', 'ตับ',
        
        // Bangla
        'ডায়াবেটিস', 'রক্তচাপ', 'ইনসুলিন', 'মেটফরমিন', 'চিনি',
        'প্যারাসিটামল', 'হৃদপিণ্ড', 'কিডনি', 'লিভার',
        
        // Hindi
        'मधुमेह', 'रक्तचाप', 'इंसुलिन', 'पैरासिटामोल',
        
        // Urdu
        'شوگر', 'بلڈ پریشر', 'انسولین', 'پیراسیٹامول'
    ];
}

module.exports = {
    medicalTerms,
    getMedicalTerms,
    getAllMedicalTerms,
    getTermsByCategory,
    getBoostedTerms
};
