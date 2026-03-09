/**
 * Test Hanna's Enhanced Personality
 * Run: node scripts/test_personality.js
 */

const { HANNA_SYSTEM_PROMPT } = require('../src/config/prompts');

console.log('🔍 Hanna Personality Test\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Test 1: Character Depth
console.log('✅ Character Depth Check:');
const hasBackstory = HANNA_SYSTEM_PROMPT.includes('Siriraj Hospital') &&
    HANNA_SYSTEM_PROMPT.includes('grandmother had diabetes');
console.log(`   Backstory present: ${hasBackstory ? '✓' : '✗'}`);

const hasPersonality = HANNA_SYSTEM_PROMPT.includes('caring younger sister') &&
    HANNA_SYSTEM_PROMPT.includes('Optimistic but realistic');
console.log(`   Personality defined: ${hasPersonality ? '✓' : '✗'}`);

// Test 2: Natural Language Patterns
console.log('\n✅ Natural Language Patterns:');
const hasFillers = HANNA_SYSTEM_PROMPT.includes('อืม') &&
    HANNA_SYSTEM_PROMPT.includes('หืม') &&
    HANNA_SYSTEM_PROMPT.includes('อ๋อ');
console.log(`   Thai conversational fillers: ${hasFillers ? '✓' : '✗'}`);

const hasMetaphors = HANNA_SYSTEM_PROMPT.includes('น้ำตาลเหมือนซอสในอาหาร');
console.log(`   Cultural metaphors: ${hasMetaphors ? '✓' : '✗'}`);

// Test 3: Emotional Range
console.log('\n✅ Emotional Intelligence:');
const hasEmotions = HANNA_SYSTEM_PROMPT.includes('FOR GOOD NEWS') &&
    HANNA_SYSTEM_PROMPT.includes('FOR BAD NEWS') &&
    HANNA_SYSTEM_PROMPT.includes('เก่งมาก!');
console.log(`   Emotional adaptation: ${hasEmotions ? '✓' : '✗'}`);

const hasVulnerability = HANNA_SYSTEM_PROMPT.includes('ฮันนาไม่แน่ใจ');
console.log(`   Admits uncertainty: ${hasVulnerability ? '✓' : '✗'}`);

// Test 4: Safety Protocols
console.log('\n✅ Medical Safety (Non-Negotiable):');
const hasSafety = HANNA_SYSTEM_PROMPT.includes('MEDICAL SAFETY') &&
    HANNA_SYSTEM_PROMPT.includes('Emergency Protocol') &&
    HANNA_SYSTEM_PROMPT.includes('1669');
console.log(`   Safety protocols intact: ${hasSafety ? '✓' : '✗'}`);

const hasDisclaimer = HANNA_SYSTEM_PROMPT.includes('พยาบาลเสมือน');
console.log(`   Medical disclaimer: ${hasDisclaimer ? '✓' : '✗'}`);

// Test 5: Examples
console.log('\n✅ Example Responses:');
const hasExamples = HANNA_SYSTEM_PROMPT.includes('EXAMPLE RESPONSES') &&
    HANNA_SYSTEM_PROMPT.includes('อ่าวว 210 เหรอคะ');
console.log(`   Conversational examples: ${hasExamples ? '✓' : '✗'}`);

// Test 6: Contextual Memory Instructions
console.log('\n✅ Contextual Awareness:');
const hasMemory = HANNA_SYSTEM_PROMPT.includes('CONTEXTUAL MEMORY') &&
    HANNA_SYSTEM_PROMPT.includes('Reference Past Conversations');
console.log(`   Memory integration: ${hasMemory ? '✓' : '✗'}`);

// Summary
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const allTests = [hasBackstory, hasPersonality, hasFillers, hasMetaphors,
    hasEmotions, hasVulnerability, hasSafety, hasDisclaimer,
    hasExamples, hasMemory];
const passedTests = allTests.filter(t => t).length;
const totalTests = allTests.length;

console.log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`);

if (passedTests === totalTests) {
    console.log('🎉 All personality enhancements verified!');
    console.log('\n✨ Hanna is now ready with:');
    console.log('   • Authentic Thai character (32yo nurse from Ratchaburi)');
    console.log('   • Natural conversation patterns (อืม, หืม, อ๋อ)');
    console.log('   • Emotional intelligence (joy, concern, empathy)');
    console.log('   • Cultural depth (food metaphors, Thai idioms)');
    console.log('   • Safety protocols (emergency detection, disclaimers)');
    console.log('   • Contextual memory (references past conversations)\n');
} else {
    console.log('⚠️  Some enhancements missing. Review prompts.js\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Show a sample of the new prompt
console.log('📝 System Prompt Preview (first 500 chars):\n');
console.log(HANNA_SYSTEM_PROMPT.substring(0, 500) + '...\n');
