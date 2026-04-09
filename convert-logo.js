const sharp = require('sharp');
const fs = require('fs');

const inputPath = '../venus-frontend/public/images/venus-logo.webp';
const outputPath = '../venus-frontend/public/images/venus-logo.png';

if (fs.existsSync(inputPath)) {
    sharp(inputPath)
        .png()
        .toFile(outputPath)
        .then(() => console.log('Successfully converted webp to png'))
        .catch(err => console.error('Error converting image:', err));
} else {
    console.log('Webp logo does not exist at ' + inputPath);
}
