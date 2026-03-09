require('dotenv').config();
const { createRichMenu, setDefaultRichMenu, listRichMenus, deleteRichMenu, uploadRichMenuImage } = require('../src/services/richMenu');
const { generateRichMenuImage } = require('../src/utils/imageGenerator');

const main = async () => {
    console.log('🚀 Hanna Rich Menu Setup\n');

    try {
        // Generate image
        console.log('🎨 Generating Rich Menu image...');
        const imagePath = generateRichMenuImage();
        console.log('');

        // List existing rich menus
        console.log('📋 Checking existing rich menus...');
        const existing = await listRichMenus();
        console.log(`Found ${existing.length} existing rich menus\n`);

        // Delete old menus
        if (existing.length > 0) {
            console.log('🗑️  Deleting old rich menus...');
            for (const menu of existing) {
                await deleteRichMenu(menu.richMenuId);
            }
            console.log('');
        }

        // Create new rich menu
        console.log('📝 Creating new rich menu...');
        const richMenuId = await createRichMenu();
        console.log(`Rich Menu ID: ${richMenuId}\n`);

        // Upload image
        console.log('📤 Uploading Rich Menu image...');
        await uploadRichMenuImage(richMenuId, imagePath);
        console.log('');

        // Set as default
        console.log('⚙️  Setting as default rich menu...');
        await setDefaultRichMenu(richMenuId);

        console.log('\n✅ Rich Menu setup complete!');
        console.log('🎉 Users will see the Rich Menu at the bottom of the chat!\n');

    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        process.exit(1);
    }
};

main();
