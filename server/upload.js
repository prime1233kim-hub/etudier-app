// Image uploads are kept in memory only (never written to disk) and checked
// twice: the declared type, then the file's first bytes, so a renamed file
// can't pass as an image.

const multer = require('multer');

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 4 },
  fileFilter(req, file, cb) {
    if (!ALLOWED.includes(file.mimetype)) {
      const err = new Error('Please upload a JPEG, PNG or WebP image.');
      err.code = 'BAD_TYPE';
      return cb(err);
    }
    cb(null, true);
  }
});

// Express middleware: accepts one field named "image" and replies with a
// clear 400/413 instead of a crash when something is wrong.
function singleImage(field = 'image') {
  const handler = upload.single(field);
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'too_large', message: 'That image is larger than 10 MB.' });
        if (err.code === 'BAD_TYPE') return res.status(400).json({ error: 'bad_type', message: err.message });
        return res.status(400).json({ error: 'bad_upload', message: 'The upload could not be read.' });
      }
      if (!req.file) return res.status(400).json({ error: 'no_file', message: 'Please choose an image to upload.' });
      const actual = sniffImageType(req.file.buffer);
      if (!actual) return res.status(400).json({ error: 'bad_type', message: 'This file is not a valid JPEG, PNG or WebP image.' });
      req.file.mimetype = actual;
      next();
    });
  };
}

module.exports = { singleImage, sniffImageType, MAX_BYTES };
