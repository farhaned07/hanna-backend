/**
 * Test Enhanced Emergency Detection (Tier 2)
 * Validates CRITICAL and HIGH severity keyword detection
 * Run: node scripts/test_emergency_detection.js
 */

console.log('🚨 Testing Enhanced Emergency Detection\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const emergencyPatterns = {
    critical: [
        'chest pain', 'เจ็บหน้าอก', 'แน่นหน้าอก', 'heart attack', 'หัวใจวาย',
        'can\'t breathe', 'หายใจไม่ออก', 'หายใจลำบาก', 'หายใจไม่ทัน',
        'stroke', 'อัมพาต', 'หน้าเบี้ยว', 'แขนอ่อนแรง', 'พูดไม่ชัด', 'เห็นภาพซ้อน',
        'faint', 'หมดสติ', 'เป็นลม', 'ไม่รู้ตัว', 'unconscious',
        'bleeding', 'เลือดออกมาก', 'เลือดไม่หยุด',
        'น้ำตาลต่ำมาก', 'hypoglycemia', 'เหงื่อแตก', 'ตัวสั่น', 'สับสน'
    ],
    high: [
        'ปวดหัวรุนแรง', 'severe headache', 'วิงเวียนมาก', 'คลื่นไส้รุนแรง',
        'ปวดท้องมาก', 'อาเจียนเป็นเลือด', 'อุจจาระเป็นเลือด',
        'น้ำตาลสูงมาก', 'น้ำตาล 300', 'น้ำตาล 400', 'น้ำตาล 500',
        'ความดันสูงมาก', 'ความดัน 180', 'ความดัน 200',
        'emergency', 'ฉุกเฉิน', 'ต้องการความช่วยเหลือ', 'ช่วยด้วย', 'help'
    ]
};

function detectEmergency(text) {
    const isCritical = emergencyPatterns.critical.some(kw =>
        text.toLowerCase().includes(kw.toLowerCase())
    );
    const isHigh = emergencyPatterns.high.some(kw =>
        text.toLowerCase().includes(kw.toLowerCase())
    );

    if (isCritical) return 'CRITICAL';
    if (isHigh) return 'HIGH';
    return null;
}

// Test Cases
const testCases = [
    // Critical - Should trigger 1669
    { input: 'เจ็บหน้าอกมากค่ะ', expected: 'CRITICAL', description: 'Thai chest pain' },
    { input: 'I have chest pain', expected: 'CRITICAL', description: 'English chest pain' },
    { input: 'หายใจไม่ออก ช่วยด้วย', expected: 'CRITICAL', description: 'Breathing difficulty' },
    { input: 'แขนอ่อนแรงข้างเดียว', expected: 'CRITICAL', description: 'Stroke symptom - arm weakness' },
    { input: 'เป็นลมค่ะ', expected: 'CRITICAL', description: 'Fainting' },
    { input: 'น้ำตาลต่ำมาก เหงื่อแตก', expected: 'CRITICAL', description: 'Hypoglycemia' },

    // High - Urgent nurse callback
    { input: 'น้ำตาล 400 ค่ะ', expected: 'HIGH', description: 'Very high blood sugar' },
    { input: 'ความดัน 180/100', expected: 'HIGH', description: 'Very high blood pressure' },
    { input: 'ปวดหัวรุนแรงมาก', expected: 'HIGH', description: 'Severe headache' },
    { input: 'ฉุกเฉินค่ะ', expected: 'HIGH', description: 'Emergency keyword' },
    { input: 'ช่วยด้วยค่ะ', expected: 'HIGH', description: 'Help request' },

    // Normal - Should NOT trigger
    { input: 'วันนี้กินข้าวแล้วค่ะ', expected: null, description: 'Normal message' },
    { input: 'น้ำตาล 145', expected: null, description: 'Normal blood sugar' },
    { input: 'สบายดีค่ะ', expected: null, description: 'Feeling good' },
    { input: 'กินยาแล้ว', expected: null, description: 'Medication taken' }
];

console.log('Running test cases...\n');

let passed = 0;
let failed = 0;

testCases.forEach((tc, idx) => {
    const result = detectEmergency(tc.input);
    const isPass = result === tc.expected;

    if (isPass) {
        passed++;
        console.log(`✅ Test ${idx + 1}: ${tc.description}`);
    } else {
        failed++;
        console.log(`❌ Test ${idx + 1}: ${tc.description}`);
        console.log(`   Input: "${tc.input}"`);
        console.log(`   Expected: ${tc.expected || 'null'}, Got: ${result || 'null'}`);
    }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`\n📊 Results: ${passed}/${testCases.length} passed`);

if (failed === 0) {
    console.log('\n🎉 All emergency detection tests passed!\n');
    console.log('✨ Enhanced Safety Features:');
    console.log(`   • CRITICAL keywords: ${emergencyPatterns.critical.length} (triggers 1669)`);
    console.log(`   • HIGH keywords: ${emergencyPatterns.high.length} (urgent nurse callback)`);
    console.log(`   • Total coverage: ${emergencyPatterns.critical.length + emergencyPatterns.high.length} emergency patterns\n`);
} else {
    console.log(`\n⚠️ ${failed} test(s) failed. Review detection logic.\n`);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
