import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const IMAGE_DIRS = [
    path.join(process.cwd(), 'public', 'images', 'vertical'),
    path.join(process.cwd(), 'public', 'images', 'horizontal')
];

// Configuration
const PREFIX_MAP = {
    'vertical': 'v',
    'horizontal': 'h'
};

const QUALITY = 90; // High fidelity

async function processImages() {
    console.log('🚀 Starting Image Optimization...');

    for (const dir of IMAGE_DIRS) {
        if (!fs.existsSync(dir)) continue;

        const folderName = path.basename(dir);
        const prefix = PREFIX_MAP[folderName];
        console.log(`\n📂 Processing ${folderName} images...`);

        const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));

        // Sort files to maintain some order (optional, but good for consistency)
        files.sort();

        let count = 1;
        for (const file of files) {
            const ext = path.extname(file);
            const oldPath = path.join(dir, file);

            // Target Name
            const newName = `${prefix}_${String(count).padStart(3, '0')}.webp`;
            const newPath = path.join(dir, newName);

            // Skip if already processed and named correctly (to avoid re-processing if script runs again)
            // Check if current file matches the pattern AND is already webp
            if (file === newName) {
                console.log(`  ✅ ${file} (Already optimized)`);
                count++;
                continue;
            }

            // If the target file already exists (collision), we might need to be careful
            // But renaming strategy v_001, v_002 implies we rewriting the folder.
            // To avoid collisions with existing files during loop, we should process to a temp folder?
            // Or just rename in place if careful.
            // Easiest: Convert to temp name, then rename.

            console.log(`  🔄 Converting ${file} -> ${newName}`);

            try {
                // Use temp file specifically for same-file replacement
                const tempPath = newPath + '.tmp.webp';

                // Convert with FFmpeg
                // -c:v libwebp: Use WebP encoder
                // -q:v 75: Quality 75 (Google recommended sweet spot)
                // -compression_level 6: Compression method 6 (slowest but best compression)
                // -preset photo: Optimized for photos
                // -mt: Multi-threading (removed -mt param as it might cause issues on some builds, and ffmpeg usually auto-detects)
                // -map_metadata -1: Remove all metadata
                const cmd = `ffmpeg -y -v error -i "${oldPath}" -c:v libwebp -q:v 75 -compression_level 6 -preset photo -map_metadata -1 "${tempPath}"`;
                execSync(cmd);

                // Move temp file to target path
                // Remove original if different (though logical flow here implies we are replacing)
                if (fs.existsSync(tempPath)) {
                    // If target exists (and it does), unlink it first to be safe, though renameSync overwrites on POSIX, 
                    // on Windows unlinking first is safer for some node versions/filesystems
                    if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
                    fs.renameSync(tempPath, newPath);
                }

                // If oldPath was different and we didn't just overwrite it with newPath above
                // (This block is for renaming e.g. .jpg -> .webp)
                if (oldPath !== newPath && fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }

            } catch (e) {
                console.error(`  ❌ Failed to convert ${file}:`, e.message);
            }

            count++;
        }
    }

    console.log('\n✨ All images processed!');
    console.log('💡 Remember to re-run "npm run generate:manifest" to update the index.');
}

processImages();
