const Jimp = require('jimp');
const AsciiTable = require('ascii-table')
const yargs = require('yargs');
const fs = require('fs');
const SORT_ORDERS = {
    'ROW_MAJOR': 'row-major',
    'COLUMN_MAJOR': 'column-major'
};
const SORT_PARAMETERS = {
    'HUE': 'hue',
    'SATURATION': 'saturation',
    'VALUE': 'value',
    'LUMA': 'luma'
}

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
        describe: 'Number of pixels per sub-image in the output image. The same number will be used for width and height. Defaults to the minimum dimension across all input images.',
        type: 'number'
    })
    .option('outputFilename', {
        alias: 'o',
        describe: 'The directory and filename at which you want the final output image to appear. Must include the image extensions, i.e. `./output/output.png`.',
        type: 'string',
        default: './output/output.png'
    })
    .option('sortOrder', {
        alias: 's',
        describe: 'The order into which you want your input images to be sorted',
        type: 'string',
        choices: Object.values(SORT_ORDERS),
        default: SORT_ORDERS.COLUMN_MAJOR
    })
    .option('sortParameter', {
        alias: 'p',
        describe: 'The color parameter by which you want to sort. Experiment with this!',
        type: 'string',
        choices: Object.values(SORT_PARAMETERS),
        default: SORT_PARAMETERS.HUE
    })
    .option('inputDirectory', {
        alias: 'i',
        describe: 'The directory inside which you have placed input files for this script.',
        type: 'string',
        default: './images'
    })
    .help()
    .alias('help', 'h')
    .argv;

// The basics here are from https://css-tricks.com/converting-color-spaces-in-javascript/
// Thank you!
function hexToHSV(hexRGB) {
    // Convert hex to RGB first
    let { r, g, b } = hexRGB;
    // Then to HSV
    r /= 255;
    g /= 255;
    b /= 255;
    let cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin,
        hue = 0,
        saturation = 0,
        value = 0;

    if (delta == 0)
        hue = 0;
    else if (cmax == r)
        hue = ((g - b) / delta) % 6;
    else if (cmax == g)
        hue = (b - r) / delta + 2;
    else
        hue = (r - g) / delta + 4;

    hue = Math.round(hue * 60);

    if (hue < 0)
        hue += 360;

    value = (cmax + cmin) / 2;
    saturation = delta == 0 ? 0 : delta / (1 - Math.abs(2 * value - 1));
    saturation = +(saturation * 100).toFixed(1);
    value = +(value * 100).toFixed(1);

    return { hue, saturation, value };
}

function determinePxPerImage(imageDataArray) {
    console.log(`\nDetermining number of pixels for the dimensions of each image in the output grid...`);

    if (argv.pxPerImage) {
        console.log(`\`pxPerImage\` was set at runtime to \`${argv.pxPerImage}px\`!`);
        return;
    }

    imageDataArray.forEach((currentImageData) => {
        argv.pxPerImage = Math.min(argv.pxPerImage || 999999, Math.min(currentImageData.image.bitmap.width, currentImageData.image.bitmap.height));
    });

    console.log(`\`pxPerImage\` was automatically set to \`${argv.pxPerImage}px\`!`);
}

function processImages(imageFilenames) {
    return new Promise((resolve, reject) => {
        console.log(`Processing all images...`);
        
        let imageDataArray = [];

        imageFilenames.forEach(async (imageFilename) => {
            console.log(`Processing \`${imageFilename}\`...`);

            Jimp.read(`${argv.inputDirectory}/${imageFilename}`)
                .then((currentImage) => {
                    let obj = {
                        "imageFilename": imageFilename,
                        "image": currentImage,
                    };

                    let imageClone = currentImage.clone();
                    imageClone.resize(1, 1, Jimp.RESIZE_BILINEAR);
                    let colorHexString = imageClone.getPixelColor(0, 0).toString(16).substr(0, 6).padStart(6, '0');
                    let colorHex = {
                        r: parseInt(colorHexString.substr(0, 2), 16),
                        g: parseInt(colorHexString.substr(2, 2), 16),
                        b: parseInt(colorHexString.substr(4, 2), 16)
                    };
                    let colorInfo = hexToHSV(colorHex);
                    colorInfo["luma"] = 0.3 * colorHex.r + 0.59 * colorHex.g + 0.11 * colorHex.b;
                    obj["colorInfo"] = colorInfo;

                    imageDataArray.push(obj);

                    if (imageDataArray.length === imageFilenames.length) {
                        console.log(`Done processing images!`);

                        determinePxPerImage(imageDataArray);

                        imageDataArray.forEach((currentImageData) => {
                            currentImageData["resizedImage"] = currentImageData.image.clone().cover(argv["pxPerImage"], argv["pxPerImage"]);
                        })

                        resolve(imageDataArray);
                    }
                })
                .catch((error) => {
                    reject(`Error when reading ${imageFilename}! Error:\n${error}`);
                });
        });
    });
}

function createOutputGrid(imageArray) {
    return new Promise((resolve, reject) => {
        console.log(`\nCompositing output image in ${argv.sortOrder} order...`);
        
        new Jimp(argv.numCols * argv.pxPerImage, argv.numRows * argv.pxPerImage, (err, outputImage) => {
            if (err) {
                reject(err);
                return;
            }

            for (let i = 0; i < argv.numCols; i++) {
                for (let j = 0; j < argv.numRows; j++) {
                    let outputX, outputY;
                    if (argv.sortOrder === SORT_ORDERS.ROW_MAJOR) {
                        outputX = j * argv.pxPerImage;
                        outputY = i * argv.pxPerImage;
                    } else if (argv.sortOrder === SORT_ORDERS.COLUMN_MAJOR) {
                        outputX = i * argv.pxPerImage;
                        outputY = j * argv.pxPerImage;
                    }

                    let currentImage = imageArray[i * argv.numCols + j];

                    if (currentImage) {
                        outputImage.composite(currentImage, outputX, outputY);
                    }
                }
            }
            
            console.log(`Done compositing output image!`);
            resolve(outputImage);
        });
    });
}

function setNumRowsAndNumCols(numImages) {
    if (!argv.numRows || !argv.numCols) {
        if (argv.numRows) {
            argv.numCols = Math.ceil(numInputImages / argv.numRows);
            return;
        }

        if (argv.numCols) {
            argv.numRows = Math.ceil(numInputImages / argv.numCols);
            return;
        }

        let numBoth = Math.ceil(Math.sqrt(numImages));
        argv.numRows = numBoth;
        argv.numCols = numBoth;
    }
}

function createColorSortedImageGrid() {
    let imageFilenames = fs.readdirSync(argv.inputDirectory);
    imageFilenames = imageFilenames.filter((current) => { return (current.indexOf('.jpg') > -1 || current.indexOf('.png') > -1); });

    if (imageFilenames.length === 0) {
        console.error(`There are no \`.jpg\` or \`.png\` images inside ${argv.inputDirectory}! Quitting...`);
        return;
    }

    console.log(`Detecting number of columns and number of rows in output image...`);
    setNumRowsAndNumCols(imageFilenames.length);
    console.log(`Done!\nNumber of input images: ${imageFilenames.length}\nNumber of columns: ${argv.numCols}\nNumber of rows: ${argv.numRows}\n`);

    processImages(imageFilenames)
        .then((imageDataArray) => {
            console.log(`\nImages processed successfully! Sorting images by color into \`resizedImageArray\`...`);

            imageDataArray.sort((a, b) => {
                return a.colorInfo[argv.sortParameter] - b.colorInfo[argv.sortParameter];
            });
            
            let resizedImageArray = [];
            let table = new AsciiTable('Image Information - Dominant Color');
            let tableHeadings = ['Filename'];
            Object.values(SORT_PARAMETERS).forEach((parameter) => {
                if (argv.sortParameter === parameter) {
                    tableHeadings.push(`${parameter}*`);
                } else {
                    tableHeadings.push(parameter);
                }
            });
            table.setHeading(tableHeadings);
            imageDataArray.forEach((currentImageData) => {
                table.addRow(currentImageData.imageFilename, currentImageData.colorInfo.hue, currentImageData.colorInfo.saturation, currentImageData.colorInfo.value, currentImageData.colorInfo.luma.toFixed(2));
                resizedImageArray.push(currentImageData.resizedImage);
            });

            console.log(table.toString());

            console.log(`Sorted!`);

            createOutputGrid(resizedImageArray)
                .then((outputJimpImage) => {
                    let outputImageFilename = argv["outputFilename"];
                    console.log(`\nWriting output image to \`${outputImageFilename}\`...`);
                    outputJimpImage.write(outputImageFilename);
                    console.log(`Done! Find your color-sorted image grid at:\n\n${"*".repeat(outputImageFilename.length + 4)}\n* ${outputImageFilename} *\n${"*".repeat(outputImageFilename.length + 4)}\n`);
                })
                .catch((error) => {
                    console.error(`Error when processing images! Error:\n${error}`);
                });
        })
        .catch((error) => {
            console.error(`Error when processing images! Error:\n${error}`);
        });

}

createColorSortedImageGrid();