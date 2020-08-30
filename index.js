// Include the various necessary library requirements...
const Jimp = require('jimp');
const AsciiTable = require('ascii-table')
const yargs = require('yargs');
const fs = require('fs');

// Define the possible input image sort orders in this 'enum'.
const SORT_ORDERS = {
    'ROW_MAJOR': 'row-major',
    'COLUMN_MAJOR': 'column-major'
};
// Define the posible input image sort parameters in this 'enum'.
const SORT_PARAMETERS = {
    'HUE': 'hue',
    'SATURATION': 'saturation',
    'VALUE': 'value',
    'LUMA': 'luma'
}

// Set up script command line arguments. I love yargs.
const argv = yargs
    .option('numRows', {
        alias: 'r',
        describe: 'Number of rows in the output image',
        type: 'number'
    })
    .option('numColumns', {
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
        type: 'string'
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

// This function takes an object { r, g, b } and converts those
// RGB colors into the HSV (hue, saturation, value) color representation.
// The basics of this function are from https://css-tricks.com/converting-color-spaces-in-javascript/
// Thanks, CSS Tricks!
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

// This function takes in a specially-formatted image data array and determines
// the proper number of pixels for the width and height dimensions of each image in the output grid.
function determinePxPerImage(imageDataArray) {
    console.log(`\nDetermining number of pixels for the dimensions of each image in the output grid...`);

    // If the user defined the `pxPerImage` command line argument,
    // use that value. This will result in upscaling or downscaling of each input image.
    if (argv.pxPerImage) {
        console.log(`\`pxPerImage\` was set at runtime to \`${argv.pxPerImage}px\`!`);
        return;
    }

    // The number of pixels for the width and height of each image in the output grid
    // will automatically be determined to be the smallest pixel dimension across all input images.
    imageDataArray.forEach((currentImageData) => {
        argv.pxPerImage = Math.min(argv.pxPerImage || 999999, Math.min(currentImageData.image.bitmap.width, currentImageData.image.bitmap.height));
    });

    console.log(`\`pxPerImage\` was automatically set to \`${argv.pxPerImage}px\`!`);
}

// If this `Promise` resolves, the caller will receive a specially-formatted and _unsorted_ `imageDataArray`
// which contains various pieces of data about each input image.
function processImages(imageFilenames) {
    return new Promise((resolve, reject) => {
        console.log(`Processing all images...`);
        
        let imageDataArray = [];

        imageFilenames.forEach(async (imageFilename) => {
            console.log(`Processing \`${imageFilename}\`...`);

            Jimp.read(`${argv.inputDirectory}/${imageFilename}`)
                .then((currentImage) => {
                    let currentImageData = {
                        "imageFilename": imageFilename,
                        "image": currentImage,
                    };

                    // Make a clone of this input image upon which we can operate.
                    let imageClone = currentImage.clone();
                    // Resize the cloned image to 1x1px using the bilinear method.
                    // This will give us an output image whose only pixel
                    // contains the average color of the input image.
                    imageClone.resize(1, 1, Jimp.RESIZE_BILINEAR);
                    // Get the pixel color from the 1x1px image and translate that decimal color into a
                    // properly-formatted hex string.
                    let colorHexString = imageClone.getPixelColor(0, 0).toString(16).substr(0, 6).padStart(6, '0');
                    // For easier operation later, turn that hex string into an { r, g, b } object.
                    let colorHex = {
                        r: parseInt(colorHexString.substr(0, 2), 16),
                        g: parseInt(colorHexString.substr(2, 2), 16),
                        b: parseInt(colorHexString.substr(4, 2), 16)
                    };
                    // Create a new `colorInfo` Object that initially contains
                    // the hue, saturation, and value data associated with the current input image.
                    let colorInfo = hexToHSV(colorHex);
                    // Add the current image's luma value to the `colorInfo` Object.
                    colorInfo["luma"] = 0.3 * colorHex.r + 0.59 * colorHex.g + 0.11 * colorHex.b;

                    // Save the calculated color info to our `currentImageData` Object.
                    currentImageData["colorInfo"] = colorInfo;

                    // Push the almost-fully-constructed image data Object to the `imageDataArray`,
                    // which will be used by the function caller.
                    imageDataArray.push(currentImageData);

                    // If we're done processing all of the images...
                    if (imageDataArray.length === imageFilenames.length) {
                        console.log(`Done processing images!`);

                        // ...determine the number of px in the width and height dimensions for
                        // each image in the output grid...
                        determinePxPerImage(imageDataArray);

                        // ...then create a resized version of each input image according to
                        // the calculated number of pixels per image from the function call above. 
                        imageDataArray.forEach((currentImageData) => {
                            // We use the `cover()` method here. This will ensure there is no
                            // letterboxing in any of the images present in the output image grid.
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
        
        // Create a new `Jimp` image big enough to hold all of our properly-resized input images.
        new Jimp(argv.numColumns * argv.pxPerImage, argv.numRows * argv.pxPerImage, (err, outputImage) => {
            if (err) {
                reject(err);
                return;
            }

            let currentImageArrayIndex = 0;

            // This logic determines how the below loop executes based on whether the
            // user wants to see their input images ordered in row-major order or
            // column-major order.
            let xLimiter, yLimiter;
            if (argv.sortOrder === SORT_ORDERS.ROW_MAJOR) {
                xLimiter = argv.numRows;
                yLimiter = argv.numColumns;
            } else if (argv.sortOrder === SORT_ORDERS.COLUMN_MAJOR) {
                xLimiter = argv.numColumns;
                yLimiter = argv.numRows;
            }

            for (let outputX = 0; outputX < xLimiter * argv.pxPerImage; outputX += argv.pxPerImage) {
                for (let outputY = 0; outputY < yLimiter * argv.pxPerImage; outputY += argv.pxPerImage) {
                    let currentImage = imageArray[currentImageArrayIndex++];

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

// This function determines how many images are present in each row and in each column
// in the output image.
function setNumRowsAndNumCols(numInputImages) {
    // If the user specified both `--numRows` and `--numColumns` when running the script,
    // we don't need to do any work.
    if (!argv.numRows || !argv.numColumns) {
        // If the user _only_ specified `--numRows`...
        if (argv.numRows) {
            argv.numColumns = Math.ceil(numInputImages / argv.numRows);
            return;
        }

        // If the user _only_ specified `--numColumns`...
        if (argv.numColumns) {
            argv.numRows = Math.ceil(numInputImages / argv.numColumns);
            return;
        }

        // If the user didn't specify _either_ `--numRows` _or_ `--numColumns`,
        // we want the output image to be a square.
        let numBoth = Math.ceil(Math.sqrt(numInputImages));
        argv.numRows = numBoth;
        argv.numColumns = numBoth;
    }
}

// This is our main script entry point.
function createColorSortedImageGrid() {
    // Get all the filenames from our input directory.
    let imageFilenames = fs.readdirSync(argv.inputDirectory);
    // Discard all files in the input directory that aren't JPGs or PNGs.
    imageFilenames = imageFilenames.filter((current) => { return (current.indexOf('.jpg') > -1 || current.indexOf('.png') > -1); });

    // Uh oh! Error! Stinky!
    if (imageFilenames.length === 0) {
        console.error(`There are no \`.jpg\` or \`.png\` images inside ${argv.inputDirectory}! Quitting...`);
        return;
    }

    // This does exactly what the logs say...
    console.log(`Detecting number of columns and number of rows in output image...`);
    setNumRowsAndNumCols(imageFilenames.length);
    console.log(`Done!\nNumber of input images: ${imageFilenames.length}\nNumber of columns: ${argv.numColumns}\nNumber of rows: ${argv.numRows}\n`);

    // `processImages` will get us our specially-formatted, unsorted `imageDataArray`.
    processImages(imageFilenames)
        .then((imageDataArray) => {
            console.log(`\nImages processed successfully! Sorting images by color into \`resizedImageArray\`...`);

            // Sort the `imageDataArray` by the specified sort parameter.
            imageDataArray.sort((a, b) => {
                return a.colorInfo[argv.sortParameter] - b.colorInfo[argv.sortParameter];
            });
            // Now we have a properly-sorted array, where each element in the array contains an Object.
            // Not quite what we want...
            
            // Build a pretty ASCII table for the logs
            // c:
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
                // Push each `resizedImage` into our `resizedImageArray`.
                // The `resizedImageArray` is what will actually be parsed by our
                // `createOutputGrid()` function.
                resizedImageArray.push(currentImageData.resizedImage);
            });

            // Pretty table. C:
            console.log(table.toString());

            console.log(`Sorted!`);

            // We're getting close...!
            createOutputGrid(resizedImageArray)
                .then((outputJimpImage) => {
                    let outputImageFilename = argv["outputFilename"];
                    // Determine a nice and fancy output image filename if the user didn't
                    // specify one manually.
                    if (!outputImageFilename) {
                        outputImageFilename = `./output/${Date.now()}_${argv.numColumns}x${argv.numRows}_${argv.sortOrder}_${argv.sortParameter}.png`
                    }
                    console.log(`\nWriting output image to \`${outputImageFilename}\`...`);
                    outputJimpImage.write(outputImageFilename);
                    console.log(`Done! Find your color-sorted image grid at:\n\n${"*".repeat(outputImageFilename.length + 4)}\n\n* ${outputImageFilename} *\n\n${"*".repeat(outputImageFilename.length + 4)}\n`);
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

// Thank you for reading the code!
// If you made it this far, I'd love for you to contribute and make this code even better!
// Feel free to star the base repository, or submit a PR against it:
// https://github.com/zfox23/colorSortedImageGrid
// -Zach
