const line = require('../services/line');
const config = require('../config');
const fs = require('fs');
const path = require('path');

/**
 * Create and upload Rich Menu for Hanna AI Nurse
 * Rich Menu provides quick access buttons for users
 */
const createRichMenu = async () => {
    // Updated to 6-button 3x2 grid layout
    const richMenuObject = {
        size: {
            width: 2500,
            height: 1686
        },
        selected: true,
        name: 'Hanna Main Menu v2',
        chatBarText: 'เมนู',
        areas: [
            // --- ROW 1 (Large Buttons: 1250x843) ---
            { // Button 1: Daily Vitals (Left)
                bounds: { x: 0, y: 0, width: 1250, height: 843 },
                action: { type: 'message', text: 'บันทึกค่าสุขภาพ' } // checkin keyword
            },
            { // Button 2: Voice AI Nurse (Right)
                bounds: { x: 1250, y: 0, width: 1250, height: 843 },
                action: { type: 'uri', uri: `https://liff.line.me/${process.env.LIFF_ID}` } // call.html
            },

            // --- ROW 2 (Small Buttons: 625x843) ---
            { // Slot 1: Meds
                bounds: { x: 0, y: 843, width: 625, height: 843 },
                action: { type: 'message', text: 'ยาของฉัน' }
            },
            { // Slot 2: History
                bounds: { x: 625, y: 843, width: 625, height: 843 },
                action: { type: 'message', text: 'ประวัติ' }
            },
            { // Slot 3: Profile
                bounds: { x: 1250, y: 843, width: 625, height: 843 },
                action: { type: 'message', text: 'ข้อมูลส่วนตัว' }
            },
            { // Slot 4: SOS (Rightmost)
                bounds: { x: 1875, y: 843, width: 625, height: 843 },
                action: { type: 'message', text: 'SOS' } // Triggers SOS flow
            }
        ]
    };

    try {
        // Create Rich Menu
        const response = await fetch('https://api.line.me/v2/bot/richmenu', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.config.line.channelAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(richMenuObject)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Failed to create rich menu: ${JSON.stringify(data)}`);
        }

        const richMenuId = data.richMenuId;
        console.log('✅ Rich Menu created:', richMenuId);

        // Note: Image upload would be done separately
        // For now, return the richMenuId
        return richMenuId;

    } catch (error) {
        console.error('❌ Error creating rich menu:', error);
        throw error;
    }
};

/**
 * Set Rich Menu as default for all users
 */
const setDefaultRichMenu = async (richMenuId) => {
    try {
        const response = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.config.line.channelAccessToken}`
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to set default rich menu: ${error}`);
        }

        console.log('✅ Rich Menu set as default');
    } catch (error) {
        console.error('❌ Error setting default rich menu:', error);
        throw error;
    }
};

/**
 * Get list of all rich menus
 */
const listRichMenus = async () => {
    try {
        const response = await fetch('https://api.line.me/v2/bot/richmenu/list', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.config.line.channelAccessToken}`
            }
        });

        const data = await response.json();
        return data.richmenus || [];
    } catch (error) {
        console.error('❌ Error listing rich menus:', error);
        return [];
    }
};

/**
 * Unlink default rich menu from all users
 */
const unlinkDefaultRichMenu = async () => {
    try {
        const response = await fetch('https://api.line.me/v2/bot/user/all/richmenu', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${config.config.line.channelAccessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to unlink default rich menu');
        }

        console.log('✅ Default Rich Menu unlinked');
    } catch (error) {
        console.error('❌ Error unlinking default rich menu:', error);
        throw error;
    }
};

/**
 * Upload image to Rich Menu
 */
const uploadRichMenuImage = async (richMenuId, imagePath) => {
    const fs = require('fs');

    try {
        const imageBuffer = fs.readFileSync(imagePath);

        const response = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.config.line.channelAccessToken}`,
                'Content-Type': 'image/jpeg'
            },
            body: imageBuffer
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to upload rich menu image: ${error}`);
        }

        console.log('✅ Rich Menu image uploaded');
    } catch (error) {
        console.error('❌ Error uploading rich menu image:', error);
        throw error;
    }
};

/**
 * Delete a rich menu
 */
const deleteRichMenu = async (richMenuId) => {
    try {
        const response = await fetch(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${config.config.line.channelAccessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete rich menu');
        }

        console.log('✅ Rich Menu deleted:', richMenuId);
    } catch (error) {
        console.error('❌ Error deleting rich menu:', error);
    }
};

module.exports = {
    createRichMenu,
    setDefaultRichMenu,
    listRichMenus,
    deleteRichMenu,
    uploadRichMenuImage,
    unlinkDefaultRichMenu
};
