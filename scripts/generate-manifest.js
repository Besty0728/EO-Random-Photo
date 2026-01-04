import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.resolve(__dirname, '../public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const OUTPUT_FILE = path.resolve(__dirname, '../functions/data/manifest.json');
const OUTPUT_DIR = path.dirname(OUTPUT_FILE);

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function getImages(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(file => /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(file))
        .map(file => file);
}

const manifest = {
    vertical: getImages(path.join(IMAGES_DIR, 'vertical')).map(f => `/images/vertical/${f}`),
    horizontal: getImages(path.join(IMAGES_DIR, 'horizontal')).map(f => `/images/horizontal/${f}`),
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
console.log('Manifest generated successfully.');
