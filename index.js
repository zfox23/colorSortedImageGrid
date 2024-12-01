// Include the various necessary library requirements...
const { Jimp } = require("jimp");
const AsciiTable = require('ascii-table')
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');

// Define the possible input image sort orders in this 'enum'.
const SORT_ORDERS = {
    'ROW_MAJOR': 'row-major',
    'COLUMN_MAJOR': 'column-major'
};
// Define the posible input image sort parameters in this 'enum'.
const SORT_PARAMETERS = {
    'FILENAME': 'filename',
    'HUE': 'hue',
    'SATURATION': 'saturation',
    'VALUE': 'value',
    'LUMA': 'luma',
};
// Define the possible visualization modes in this 'enum'.
const VISUALIZATION_MODES = {
    'NORMAL': 'normal',
    'DOMINANT': 'dominant',
    'FOURBYFOUR': '4x4',
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
        describe: 'Number of pixels per side per sub-image in the output image. The same number of pixels will be used for width and height. Defaults to the minimum dimension across all input images.',
        type: 'number'
    })
    .option('outputFilename', {
        alias: 'o',
        describe: 'The directory and filename at which you want the final output image to appear. Must include the image extensions, i.e. `./output/output.png`. Set this value to "files" if you want the sorted image grid to be output to enumerated files in the `./output/` folder.',
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
    .option('visualizationMode', {
        alias: 'v',
        describe: 'The output image visualization mode. Experiment!',
        type: 'string',
        choices: Object.values(VISUALIZATION_MODES),
        default: VISUALIZATION_MODES.NORMAL
    })
    .option('greyscale', {
        alias: 'g',
        describe: 'Makes all input images greyscale before processing them. Try this mode while sorting by value!',
        type: "boolean",
        default: false
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

        if (argv.greyscale) {
            console.log(`(Making each image greyscale first...)`);
        }

        let imageDataArray = [];

        imageFilenames.forEach(async (imageFilename) => {
            console.log(`Processing \`${imageFilename}\`...`);

            Jimp.read(path.resolve(path.join(argv.inputDirectory, imageFilename)))
                .then((currentImage) => {
                    let currentImageData = {
                        "imageFilename": imageFilename,
                        "image": currentImage,
                    };

                    if (argv.sortParameter !== SORT_PARAMETERS.FILENAME) {
                        // This is an interesting argument to set to `true` when sorting by `value`.
                        if (argv.greyscale) {
                            currentImageData.image.greyscale();
                        }

                        // Make a clone of this input image upon which we can operate.
                        const imageClone = currentImage.clone();

                        // If we have this cool visualization mode set...
                        if (argv.visualizationMode === VISUALIZATION_MODES.FOURBYFOUR) {
                            currentImageData["4x4"] = currentImage.clone().resize({ w: 4, h: 4, method: Jimp.RESIZE_BICUBIC });
                        }

                        // Resize the cloned image to 1x1px using the bicubic method.
                        // This will give us an output image whose only pixel
                        // contains the average color of the input image (for some definition of "average").
                        imageClone.resize({ w: 1, h: 1, mode: Jimp.RESIZE_BICUBIC });
                        // Get the pixel color from the 1x1px image and translate that decimal color into a
                        // properly-formatted hex string.
                        let colorHexString = imageClone.getPixelColor(0, 0).toString(16).substring(0, 6).padStart(6, '0');

                        // For easier operation later, turn that hex string into an { r, g, b } object.
                        let colorHex = {
                            r: parseInt(colorHexString.substring(0, 2), 16),
                            g: parseInt(colorHexString.substring(2, 4), 16),
                            b: parseInt(colorHexString.substring(4, 6), 16)
                        };
                        // Create a new `colorInfo` Object that initially contains
                        // the hue, saturation, and value data associated with the current input image.
                        let colorInfo = hexToHSV(colorHex);
                        // Add the current image's luma value to the `colorInfo` Object.
                        colorInfo["luma"] = 0.3 * colorHex.r + 0.59 * colorHex.g + 0.11 * colorHex.b;
                        colorInfo["colorHexString"] = colorHexString;

                        // Save the calculated color info to our `currentImageData` Object.
                        currentImageData["colorInfo"] = colorInfo;
                    }

                    // Push the almost-fully-constructed image data Object to the `imageDataArray`,
                    // which will be used by the function caller.
                    imageDataArray.push(currentImageData);

                    // If we're done processing all of the images...
                    if (imageDataArray.length === imageFilenames.length) {
                        console.log(`Done processing images!`);

                        // ...determine the number of px in the width and height dimensions for
                        // each image in the output grid...
                        determinePxPerImage(imageDataArray);

                        if (argv.visualizationMode === VISUALIZATION_MODES.NORMAL) {
                            // ...then create a resized version of each input image according to
                            // the calculated number of pixels per image from the function call above. 
                            imageDataArray.forEach((currentImageData) => {
                                // We use the `cover()` method here. This will ensure there is no
                                // letterboxing in any of the images present in the output image grid.
                                currentImageData["outputImage"] = currentImageData.image.clone().cover({ w: argv["pxPerImage"], h: argv["pxPerImage"] });
                            });

                            resolve(imageDataArray);
                            return;
                        } else if (argv.visualizationMode === VISUALIZATION_MODES.FOURBYFOUR) {
                            imageDataArray.forEach((currentImageData) => {
                                currentImageData["outputImage"] = currentImageData["4x4"].resize({ w: argv["pxPerImage"], h: argv["pxPerImage"], method: Jimp.RESIZE_NEAREST_NEIGHBOR });
                            });

                            resolve(imageDataArray);
                            return;
                        } else if (argv.visualizationMode === VISUALIZATION_MODES.DOMINANT) {
                            let outputImageCount = 0;
                            imageDataArray.forEach((currentImageData) => {
                                const outputImage = new Jimp({ width: argv.pxPerImage, height: argv.pxPerImage, color: parseInt(currentImageData.colorInfo.colorHexString + 'ff', 16) });

                                currentImageData["outputImage"] = outputImage;
                                outputImageCount++;

                                if (outputImageCount === imageDataArray.length) {
                                    resolve(imageDataArray);
                                }
                            });
                            return;
                        }
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
        const outputImage = new Jimp({ width: argv.numColumns * argv.pxPerImage, height: argv.numRows * argv.pxPerImage });

        let currentImageArrayIndex = 0;

        if (argv.sortOrder === SORT_ORDERS.ROW_MAJOR) {
            for (let outputY = 0; outputY < argv.numRows * argv.pxPerImage; outputY += argv.pxPerImage) {
                for (let outputX = 0; outputX < argv.numColumns * argv.pxPerImage; outputX += argv.pxPerImage) {
                    let currentImage = imageArray[currentImageArrayIndex++];

                    if (currentImage) {
                        outputImage.composite(currentImage, outputX, outputY);
                    } else {
                        console.error(`Invalid \`currentImage\`!`);
                    }
                }
            }
        } else {
            for (let outputX = 0; outputX < argv.numColumns * argv.pxPerImage; outputX += argv.pxPerImage) {
                for (let outputY = 0; outputY < argv.numRows * argv.pxPerImage; outputY += argv.pxPerImage) {
                    let currentImage = imageArray[currentImageArrayIndex++];

                    if (currentImage) {
                        outputImage.composite(currentImage, outputX, outputY);
                    } else {
                        console.error(`Invalid \`currentImage\`!`);
                    }
                }
            }
        }

        console.log(`Done compositing output image!`);
        resolve(outputImage);
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
    imageFilenames = imageFilenames.filter((current) => { return (current.toLowerCase().indexOf('.jpg') > -1 || current.toLowerCase().indexOf('.png') > -1); });

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
            console.log(`\nImages processed successfully! Sorting images into \`sortedImageArray\`...`);

            // Sort the `imageDataArray` by the specified sort parameter.
            imageDataArray.sort((a, b) => {
                if (argv.sortParameter === SORT_PARAMETERS.FILENAME) {
                    return a.imageFilename.localeCompare(b.imageFilename);
                } else {
                    return a.colorInfo[argv.sortParameter] - b.colorInfo[argv.sortParameter];
                }
            });
            // Now we have a properly-sorted array, where each element in the array contains an Object.
            // Not quite what we want...

            // Build a pretty ASCII table for the logs
            // c:
            let sortedImageArray = [];
            let table = new AsciiTable('Image Information - Dominant Color');
            let tableHeadings = [];
            if (argv.sortParameter === SORT_PARAMETERS.FILENAME) {
                tableHeadings.push(`${argv.sortParameter}*`);
            } else {
                Object.values(SORT_PARAMETERS).forEach((parameter) => {
                    if (argv.sortParameter === parameter) {
                        tableHeadings.push(`${parameter}*`);
                    } else {
                        tableHeadings.push(parameter);
                    }
                });
            }
            table.setHeading(tableHeadings);
            imageDataArray.forEach((currentImageData) => {
                if (argv.sortParameter === SORT_PARAMETERS.FILENAME) {
                    table.addRow(currentImageData.imageFilename);
                } else {
                    table.addRow(currentImageData.imageFilename, currentImageData.colorInfo.hue, currentImageData.colorInfo.saturation, currentImageData.colorInfo.value, currentImageData.colorInfo.luma.toFixed(2));
                }
                // Push each `outputImage` into our `sortedImageArray`.
                // The `sortedImageArray` is what will actually be parsed by our
                // `createOutputGrid()` function.
                sortedImageArray.push(currentImageData.outputImage);
            });

            // Pretty table. C:
            console.log(table.toString());

            console.log(`Sorted!`);

            // We're getting close...!

            if (argv["outputFilename"] === "table") {

            } else if (argv["outputFilename"] === "files") {
                let outputImageFolder = `./output/`;
                console.log(`\nWriting output images in numeric order to \`${outputImageFolder}<n>.png\`...`);
                for (let i = 0; i < sortedImageArray.length; i++) {
                    sortedImageArray[i].write(`${outputImageFolder}${(i + 1).toString().padStart(sortedImageArray.length.toString().length, '0')}.png`);
                }
                console.log(`Done! Find your color-sorted image files inside:\n\n${"*".repeat(outputImageFolder.length + 4)}\n\n* ${outputImageFolder} *\n\n${"*".repeat(outputImageFolder.length + 4)}\n`);
            } else {
                createOutputGrid(sortedImageArray)
                    .then((outputJimpImage) => {
                        let outputImageFilename = argv["outputFilename"];
                        // Determine a nice and fancy output image filename if the user didn't
                        // specify one manually.
                        if (!outputImageFilename) {
                            outputImageFilename = `./output/${Date.now()}_${argv.numColumns}x${argv.numRows}_${argv.sortOrder}_${argv.sortParameter}_${argv.visualizationMode}.png`
                        }
                        console.log(`\nWriting output image to \`${outputImageFilename}\`...`);
                        outputJimpImage.write(outputImageFilename);
                        console.log(`Done! Find your color-sorted image grid at:\n\n${"*".repeat(outputImageFilename.length + 4)}\n\n* ${outputImageFilename} *\n\n${"*".repeat(outputImageFilename.length + 4)}\n`);
                    })
                    .catch((error) => {
                        console.error(`Error when processing images! Error:\n${error}`);
                    });
            }
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
