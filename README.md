# colorSortedImageGrid
Given a folder of images, sorts the images by color, then outputs the color-sorted image into one NxM image grid.

# How do I use this?
1. Clone this repository to your local disk, or download the latest version of the `main` branch code [here](https://github.com/zfox23/colorSortedImageGrid/archive/main.zip).
2. Ensure NodeJS v12.18.x is installed: [https://nodejs.org/en/](https://nodejs.org/en/)
3. Place the images that you'd like to be a part of your output images into `<repo directory>\images`. They should be able to be in any format (I used `.jpg`/`.png` in my testing).
4. Open a PowerShell/Command Prompt/Terminal window, then `cd` into the directory containing this repository.
5. Run `npm i` to install this project's dependencies.

## Now you're ready to run the script!
- Run `node index.js` without any arguments to let the script execute its default behavior.
    - The script's default behavior is to sort your images by color in row-major order, creating a square output image.
- Run `node index.js -h` to see all possible command line arguments.

Enjoy! 💖