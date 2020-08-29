const yargs = require('yargs');
const Jimp = require('jimp');
const fs = require('fs');
const INPUT_IMAGE_DIR = `./images`;

const argv = yargs
    .option('numRows', {
        alias: 'r',
        describe: 'Number of rows in the output image',
        type: 'number'
    })
    .option('numCols', {
        alias: 'c',
        describe: 'Number of columns in the output image',
        type: 'number'
    })
    .option('pxPerImage', {
        alias: 'px',
        describe: 'Number of pixels per sub-image in the output image. The same number will be used for width and height.',
        type: 'number',
        default: 250
    })
    .option('outputDirectory', {
        alias: 'd',
        describe: 'The directory inside which you want the final output image to appear.',
        type: 'string',
        default: './output'
    })
    .option('sortOrder', {
        alias: 'o',
        describe: 'The order into which you want your input images to be sorted',
        type: 'string',
        choices: ['row-major', 'column-major'],
        default: 'row-major'
    })
    .help()
    .alias('help', 'h')
    .argv;

// The basics here are from https://css-tricks.com/converting-color-spaces-in-javascript/
// Thank you!
function hexToHSL(hexRGB) {
    // Convert hex to RGB first
    let { r, g, b } = hexRGB;
    // Then to HSL
    r /= 255;
    g /= 255;
    b /= 255;
    let cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin,
        h = 0,
        s = 0,
        l = 0;

    if (delta == 0)
        h = 0;
    else if (cmax == r)
        h = ((g - b) / delta) % 6;
    else if (cmax == g)
        h = (b - r) / delta + 2;
    else
        h = (r - g) / delta + 4;

    h = Math.round(h * 60);

    if (h < 0)
        h += 360;

    l = (cmax + cmin) / 2;
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return { h, s, l };
}

function processImages(imageFilenames) {
    return new Promise((resolve, reject) => {
        let imageData = {};

        imageFilenames.forEach(async (imageFilename) => {
            if (imageFilename === `README.md`) {
                return;
            }
        
            console.log(`Processing \`${imageFilename}\`...`);
        
            Jimp.read(`${INPUT_IMAGE_DIR}/${imageFilename}`)
                .then((currentImage) => {
                    imageData[imageFilename] = {
                        "image": currentImage,
                        "resizedImage": currentImage.clone().cover(argv["px"], argv["px"]),
                        "dominantHue": undefined,
                        "sortedIndex": undefined,
                    };
                
                    let imageClone = currentImage.clone();
                    imageClone.resize(1, 1, Jimp.RESIZE_BILINEAR);
                    let colorHexString = imageClone.getPixelColor(0, 0).toString(16);
                    let colorHex = {
                        r: parseInt(colorHexString.substr(0, 2), 16),
                        g: parseInt(colorHexString.substr(2, 2), 16),
                        b: parseInt(colorHexString.substr(4, 2), 16)
                    };
                    let colorHSL = hexToHSL(colorHex);
        
                    imageData[imageFilename].dominantHue = colorHSL.h;

                    // `-1` term to not count `README.md`.
                    if (Object.keys(imageData).length === imageFilenames.length - 1) {
                        resolve(imageData);
                    }
                })
                .catch((error) => {
                    reject(`Error when reading ${imageFilename}! Error:\n${error}`);
                });
        });
    });
}

function createGrid(imageData) {
    return new Promise((resolve, reject) => {
        new Jimp(256, 256, (err, image) => {
            resolve(image);
        });
    });
}

let imageFilenames = fs.readdirSync(INPUT_IMAGE_DIR);
processImages(imageFilenames)
    .then((imageData) => {
        createGrid(imageData)
            .then((outputJimpImage) => {
                let outputImageFilename = `${argv["d"]}/output.png`;
                console.log(`Writing output image to \`${outputImageFilename}\`...`);
                imageData[Object.keys(imageData)[0]].image.write(outputImageFilename);
            })
            .catch((error) => {
                console.error(`Error when processing images! Error:\n${error}`);
            });
    })
    .catch((error) => {
        console.error(`Error when processing images! Error:\n${error}`);
    });