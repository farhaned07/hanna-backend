const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

/**
 * Generate Rich Menu image programmatically
 * Size: 2500 x 1686 pixels (3x2 grid)
 * Premium "Digital Ward" Layout
 */
const generateRichMenuImage = () => {
    const outputPath = path.join(__dirname, '../../assets/richmenu.jpg');

    // Create assets directory if it doesn't exist
    const assetsDir = path.join(__dirname, '../../assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const width = 2500;
    const height = 1686;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // --- UTILITY: DRAW ROUNDED RECT ---
    const roundRect = (x, y, w, h, r) => {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    };

    // Background (Overall white base)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // --- ROW 1 (Large Buttons) - Height ~843px ---
    const row1Height = 843;
    const padding = 20;

    // Button 1: Daily Vitals (Left) - Emerald Gradient
    const grad1 = ctx.createLinearGradient(0, 0, 0, row1Height);
    grad1.addColorStop(0, '#06C755'); // Brand Green
    grad1.addColorStop(1, '#04883b'); // Darker Green

    ctx.fillStyle = grad1;
    // slightly smaller to leave gap
    roundRect(padding, padding, (width / 2) - (padding * 1.5), row1Height - (padding * 2), 40);
    ctx.fill();

    // Icon 1: Heart (White)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('บันทึกสัญญาณชีพ', width / 4, row1Height - 150);
    ctx.font = '60px Arial';
    ctx.fillText('Daily Vitals', width / 4, row1Height - 80);

    // Draw Heart Shape
    ctx.beginPath();
    const hx = width / 4;
    const hy = row1Height / 2 - 50;
    const hs = 6; // scale
    ctx.moveTo(hx, hy + 30 * hs);
    ctx.bezierCurveTo(hx, hy + 27 * hs, hx - 40 * hs, hy + 5 * hs, hx - 40 * hs, hy - 15 * hs);
    ctx.bezierCurveTo(hx - 40 * hs, hy - 45 * hs, hx - 10 * hs, hy - 45 * hs, hx, hy - 15 * hs);
    ctx.bezierCurveTo(hx + 10 * hs, hy - 45 * hs, hx + 40 * hs, hy - 45 * hs, hx + 40 * hs, hy - 15 * hs);
    ctx.bezierCurveTo(hx + 40 * hs, hy + 5 * hs, hx, hy + 27 * hs, hx, hy + 30 * hs);
    ctx.fill();

    // Button 2: Voice AI Nurse (Right) - Midnight Teal Gradient
    const grad2 = ctx.createLinearGradient(width / 2, 0, width / 2, row1Height);
    grad2.addColorStop(0, '#1e293b'); // Slate 800
    grad2.addColorStop(1, '#020617'); // Slate 950 (Almost Black)

    ctx.fillStyle = grad2;
    roundRect((width / 2) + (padding / 2), padding, (width / 2) - (padding * 1.5), row1Height - (padding * 2), 40);
    ctx.fill();

    // Icon 2: Mic (White + Glow)
    ctx.shadowColor = '#06C755';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#FFFFFF';

    // Draw Mic
    const mx = (width * 0.75);
    const my = row1Height / 2 - 60;
    const ms = 140; // size

    // Mic body
    roundRect(mx - 40, my - 60, 80, 140, 40);
    ctx.fill();
    // Mic stand
    ctx.beginPath();
    ctx.arc(mx, my + 20, 70, 0, Math.PI, false); // bottom curve
    ctx.lineWidth = 20;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.fillRect(mx - 10, my + 90, 20, 60); // stem
    ctx.fillRect(mx - 40, my + 150, 80, 20); // base

    ctx.shadowBlur = 0; // Reset glow
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 80px Arial';
    ctx.fillText('คุยกับฮันนา (AI)', width * 0.75, row1Height - 150);
    ctx.font = '60px Arial';
    ctx.fillStyle = '#06C755'; // Use Green for subtext here
    ctx.fillText('Voice Nurse', width * 0.75, row1Height - 80);


    // --- ROW 2 (Small Buttons) - Height 843px ---
    const row2Y = row1Height;
    const btnWidth = width / 4;
    const row2H = height - row1Height;

    const drawSmallBtn = (index, textTH, textEN, color, iconType) => {
        const x = (index * btnWidth);
        const y = row2Y;

        ctx.fillStyle = color;
        // slightly inset
        if (color === '#ef4444') {
            // Special Red BG for SOS
            roundRect(x + 10, y + 10, btnWidth - 20, row2H - 20, 30);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF'; // White text
        } else {
            // White BG for others
            ctx.fillStyle = '#FFFFFF'; // bg
            // roundRect(x + 10, y + 10, btnWidth - 20, row2H - 20, 30);
            // ctx.fill();
            // Border/Shadow simulation
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 2;
            // ctx.stroke();
            ctx.fillStyle = '#1e293b'; // Dark Text
        }

        // Text
        const cx = x + (btnWidth / 2);
        const cy = y + (row2H / 2);

        ctx.font = 'bold 50px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(textTH, cx, cy + 120);
        ctx.font = '40px Arial';
        ctx.fillText(textEN, cx, cy + 170);

        // Icons
        ctx.fillStyle = (color === '#ef4444') ? '#FFFFFF' : '#06C755';

        if (iconType === 'pill') {
            // Pill shape
            ctx.save();
            ctx.translate(cx, cy - 50);
            ctx.rotate(Math.PI / 4);
            roundRect(-50, -25, 100, 50, 25);
            ctx.fill();
            ctx.fillStyle = (color === '#ef4444') ? '#ef4444' : '#FFFFFF';
            ctx.fillRect(-50, -25, 50, 50); // half pill logic visual
            ctx.restore();
        } else if (iconType === 'graph') {
            // Graph line
            ctx.beginPath();
            ctx.moveTo(cx - 50, cy);
            ctx.lineTo(cx - 20, cy - 50);
            ctx.lineTo(cx + 10, cy - 20);
            ctx.lineTo(cx + 50, cy - 80);
            ctx.lineWidth = 10;
            ctx.strokeStyle = ctx.fillStyle;
            ctx.stroke();
        } else if (iconType === 'user') {
            // User circle + body
            ctx.beginPath();
            ctx.arc(cx, cy - 80, 25, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy - 20, 50, Math.PI, 0); // half circle body
            ctx.fill();
        } else if (iconType === 'sos') {
            // Siren / Bell
            ctx.beginPath();
            ctx.arc(cx, cy - 50, 40, Math.PI, 0); // top
            ctx.fillRect(cx - 40, cy - 50, 80, 50); // body
            ctx.fill();
            ctx.fillRect(cx - 50, cy, 100, 10); // base
        }
    };

    drawSmallBtn(0, 'ยาของฉัน', 'Meds', '#FFFFFF', 'pill');
    drawSmallBtn(1, 'ประวัติ', 'History', '#FFFFFF', 'graph');
    drawSmallBtn(2, 'โปรไฟล์', 'Profile', '#FFFFFF', 'user');
    drawSmallBtn(3, 'SOS 1669', 'Emergency', '#ef4444', 'sos');

    // Save
    const buffer = canvas.toBuffer('image/jpeg');
    fs.writeFileSync(outputPath, buffer);
    console.log(`✅ Premium Rich Menu generated at: ${outputPath}`);

    return outputPath;
};

module.exports = { generateRichMenuImage };
