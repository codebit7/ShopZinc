const multer = require('multer');
const path = require('path');



// Only real raster images. Without this any file type (html, svg, exe) was written to disk and sent to Cloudinary.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const storage = multer.diskStorage(
    {
        destination: function (req, file, cb) {
            // cb(null, './public')
            // Absolute path: './public' was relative to the process CWD, so starting the server from
            // anywhere but backend/ wrote uploads to the wrong folder or crashed (BUG-31). Same folder as before.
            cb(null, path.join(__dirname, '../../public'))
        },
        filename: function (req , file , cb)
        {
            cb(null,`${Date.now()}-${file.originalname}`)
        }

    }
)

function imageFileFilter(req, file, cb) {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    // status 400 so the central error handler answers a clean 400 JSON instead of a 500.
    const err = new Error('Only JPEG, PNG, WebP or GIF images are allowed');
    err.status = 400;
    cb(err);
}

// module.exports = multer({storage:storage})
// Limits: without them one request could fill the disk with any number of files of any size.
module.exports = multer({
    storage: storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024, files: 10 }
})
