const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('⚠️ Supabase Storage credentials missing. Audio upload disabled.');
}

const BUCKET_NAME = 'audio-messages';

/**
 * Upload audio buffer to Supabase Storage
 * @param {Buffer} buffer - Audio file buffer
 * @param {string} filename - Desired filename (e.g., 'response-123.mp3')
 * @returns {Promise<string>} - Public URL of the uploaded file
 */
const uploadAudio = async (buffer, filename) => {
    if (!supabase) {
        console.warn('⚠️ Skipping upload: Supabase not configured.');
        return null;
    }

    try {
        console.log(`☁️ Uploading ${filename} to Supabase...`);

        const { data, error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .upload(filename, buffer, {
                contentType: 'audio/mpeg',
                upsert: true
            });

        if (error) {
            throw error;
        }

        // Get Public URL
        const { data: publicUrlData } = supabase
            .storage
            .from(BUCKET_NAME)
            .getPublicUrl(filename);

        console.log('☁️ Upload successful:', publicUrlData.publicUrl);
        return publicUrlData.publicUrl;

    } catch (error) {
        console.error('❌ Error uploading to Supabase:', error);
        return null;
    }
};

/**
 * Upload QR code image to Supabase Storage
 * @param {Buffer} buffer - PNG image buffer
 * @param {string} filename - Desired filename (e.g., 'qr-payment-123.png')
 * @returns {Promise<string>} - Public URL of the uploaded file
 */
const uploadQR = async (buffer, filename) => {
    if (!supabase) {
        console.warn('⚠️ Skipping QR upload: Supabase not configured.');
        return null;
    }

    try {
        console.log(`☁️ Uploading QR ${filename} to Supabase...`);

        const { data, error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .upload(filename, buffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) {
            throw error;
        }

        // Get Public URL
        const { data: publicUrlData } = supabase
            .storage
            .from(BUCKET_NAME)
            .getPublicUrl(filename);

        console.log('☁️ QR Upload successful:', publicUrlData.publicUrl);
        return publicUrlData.publicUrl;

    } catch (error) {
        console.error('❌ Error uploading QR to Supabase:', error);
        return null;
    }
};

module.exports = { uploadAudio, uploadQR };
