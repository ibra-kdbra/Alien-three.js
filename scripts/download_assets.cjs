const fs = require('fs');
const https = require('https');
const path = require('path');

const assets = [
    {
        name: 'human.glb',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WalkingLady/glTF-Binary/WalkingLady.glb' // Placeholder high quality model
    },
    {
        name: 'vehicle.glb',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/SciFiHelmet/glTF-Binary/SciFiHelmet.glb' // Placeholder scifi asset
    }
];

const dir = path.join(__dirname, '../public/models');
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

assets.forEach(asset => {
    const filePath = path.join(dir, asset.name);
    const file = fs.createWriteStream(filePath);
    
    console.log(`Downloading ${asset.name}...`);
    https.get(asset.url, response => {
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log(`Finished downloading ${asset.name}`);
        });
    }).on('error', err => {
        fs.unlink(filePath);
        console.error(`Error downloading ${asset.name}: ${err.message}`);
    });
});
