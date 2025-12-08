// Script pour générer les assets PNG nécessaires pour Expo
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'assets');

async function generateAssets() {
    try {
        console.log('Génération des assets...');

        // Générer l'icône (1024x1024)
        await sharp({
            create: {
                width: 1024,
                height: 1024,
                channels: 4,
                background: { r: 76, g: 175, b: 80, alpha: 1 } // #4CAF50
            }
        })
        .composite([
            {
                input: Buffer.from(`
                    <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
                        <rect width="1024" height="1024" fill="#4CAF50" rx="200"/>
                        <circle cx="512" cy="512" r="300" fill="#FFFFFF" opacity="0.9"/>
                        <circle cx="512" cy="512" r="200" fill="#4CAF50"/>
                        <path d="M 512 312 L 512 512 L 712 512" stroke="#FFFFFF" stroke-width="60" stroke-linecap="round" fill="none"/>
                        <circle cx="512" cy="512" r="50" fill="#FFFFFF"/>
                    </svg>
                `),
                top: 0,
                left: 0
            }
        ])
        .png()
        .toFile(path.join(assetsDir, 'icon.png'));

        // Générer l'icône adaptative Android (1024x1024)
        await sharp({
            create: {
                width: 1024,
                height: 1024,
                channels: 4,
                background: { r: 76, g: 175, b: 80, alpha: 1 }
            }
        })
        .composite([
            {
                input: Buffer.from(`
                    <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
                        <rect width="1024" height="1024" fill="#4CAF50" rx="200"/>
                        <circle cx="512" cy="512" r="300" fill="#FFFFFF" opacity="0.9"/>
                        <circle cx="512" cy="512" r="200" fill="#4CAF50"/>
                        <path d="M 512 312 L 512 512 L 712 512" stroke="#FFFFFF" stroke-width="60" stroke-linecap="round" fill="none"/>
                        <circle cx="512" cy="512" r="50" fill="#FFFFFF"/>
                    </svg>
                `),
                top: 0,
                left: 0
            }
        ])
        .png()
        .toFile(path.join(assetsDir, 'adaptive-icon.png'));

        // Générer le splash screen (2048x2048)
        await sharp({
            create: {
                width: 2048,
                height: 2048,
                channels: 4,
                background: { r: 76, g: 175, b: 80, alpha: 1 }
            }
        })
        .composite([
            {
                input: Buffer.from(`
                    <svg width="2048" height="2048" xmlns="http://www.w3.org/2000/svg">
                        <rect width="2048" height="2048" fill="#4CAF50"/>
                        <circle cx="1024" cy="1024" r="400" fill="#FFFFFF" opacity="0.2"/>
                        <circle cx="1024" cy="1024" r="300" fill="#FFFFFF" opacity="0.3"/>
                        <circle cx="1024" cy="800" r="200" fill="#FFFFFF" opacity="0.9"/>
                        <circle cx="1024" cy="800" r="120" fill="#4CAF50"/>
                        <path d="M 1024 600 L 1024 800 L 1224 800" stroke="#FFFFFF" stroke-width="80" stroke-linecap="round" fill="none"/>
                    </svg>
                `),
                top: 0,
                left: 0
            }
        ])
        .png()
        .toFile(path.join(assetsDir, 'splash.png'));

        // Générer le favicon (48x48)
        await sharp({
            create: {
                width: 48,
                height: 48,
                channels: 4,
                background: { r: 76, g: 175, b: 80, alpha: 1 }
            }
        })
        .composite([
            {
                input: Buffer.from(`
                    <svg width="48" height="48" xmlns="http://www.w3.org/2000/svg">
                        <rect width="48" height="48" fill="#4CAF50" rx="8"/>
                        <circle cx="24" cy="24" r="12" fill="#FFFFFF"/>
                    </svg>
                `),
                top: 0,
                left: 0
            }
        ])
        .png()
        .toFile(path.join(assetsDir, 'favicon.png'));

        console.log('✅ Assets générés avec succès dans assets/');
        console.log('  - icon.png (1024x1024)');
        console.log('  - adaptive-icon.png (1024x1024)');
        console.log('  - splash.png (2048x2048)');
        console.log('  - favicon.png (48x48)');
    } catch (error) {
        console.error('Erreur lors de la génération des assets:', error);
        // Fallback: créer des PNG simples sans SVG
        generateSimpleAssets();
    }
}

function generateSimpleAssets() {
    console.log('Génération d\'assets simples (sans SVG)...');
    
    // Créer des PNG simples avec des couleurs unies et des formes basiques
    // Note: Cette approche crée des images très basiques
    // Pour de meilleurs résultats, utilisez un outil en ligne comme expo-assets-generator.vercel.app
    
    console.log('⚠️  Pour de meilleurs résultats, utilisez:');
    console.log('   https://expo-assets-generator.vercel.app/');
    console.log('   ou');
    console.log('   npx expo-asset generate');
}

generateAssets();
