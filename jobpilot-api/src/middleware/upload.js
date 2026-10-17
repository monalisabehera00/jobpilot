import multer from 'multer';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Kept in memory only long enough to extract text; the PDF itself is never stored
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8', // keep non-ASCII file names intact
  limits: { fileSize: MAX_RESUME_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const accepted = file.mimetype === 'application/pdf';
    if (!accepted) req.rejectedFileType = true;
    cb(null, accepted);
  },
});

// Accepts one PDF in the "resume" form field and answers upload errors in the API's JSON style
export function acceptResumePdf(req, res, next) {
  resumeUpload.single('resume')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Resume must be 5 MB or smaller.' });
      }
      return res.status(400).json({
        message: 'Upload one PDF file in the "resume" form field.',
      });
    }
    if (err) return next(err);

    if (req.rejectedFileType) {
      return res.status(400).json({ message: 'Only PDF files are allowed.' });
    }
    if (!req.file) {
      return res.status(400).json({
        message: 'A PDF file is required in the "resume" form field.',
      });
    }
    next();
  });
}
