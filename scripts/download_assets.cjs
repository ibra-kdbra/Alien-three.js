const fs = require('fs');
const https = require('https');
const path = require('path');

const assets = [
    {
        name: 'human.glb',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMan/glTF-Binary/CesiumMan.glb' // Standard animated walking character
    },
    {
        name: 'vehicle.glb',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ToyCar/glTF-Binary/ToyCar.glb' // Standard vehicle model
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
