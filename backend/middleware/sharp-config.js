const sharp = require('sharp');
const fs = require('fs');

module.exports = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    const inputPath = req.file.path;

    const outputFilename =
      req.file.filename.split('.')[0] + '.webp';

    const outputPath = `images/${outputFilename}`;

    await sharp(inputPath)
      .resize({
        width: 800,
        height: 800,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 80 })
      .toFile(outputPath);

    fs.unlinkSync(inputPath);

    req.file.filename = outputFilename;
    req.file.path = outputPath;

    next();
  } catch (error) {
    res.status(500).json({ error });
  }
};