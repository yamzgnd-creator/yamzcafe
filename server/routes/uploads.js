const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, requireRole } = require('../middleware/auth');

// Resolve the uploads directory relative to THIS file, not the current working
// directory. Under PM2 / systemd the cwd is not guaranteed to be the app root,
// which previously caused files to be written somewhere the static handler in
// server.cjs never looked (uploads succeeded but images 404'd).
// server/routes/uploads.js -> ../../ = project root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const UPLOADS_ROOT = path.join(PROJECT_ROOT, 'public', 'uploads');

const VALID_CATEGORIES = ['students', 'menu', 'logos', 'backgrounds'];

// Ensure upload directories exist
[...VALID_CATEGORIES, 'general'].forEach(category => {
  const fullPath = path.join(UPLOADS_ROOT, category);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

console.log(`[uploads] serving/writing images from: ${UPLOADS_ROOT}`);

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = req.params.category || 'general';
    const folder = VALID_CATEGORIES.includes(category) ? category : 'general';
    const uploadPath = path.join(UPLOADS_ROOT, folder);
    
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueSuffix + ext);
  }
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP, SVG, and GIF are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Diagnostics — verify where the server reads/writes images on this machine.
// GET /api/uploads/debug/paths
// Registered BEFORE '/:category' so it is not swallowed by that route.
router.get('/debug/paths', verifyToken, requireRole('admin'), (req, res) => {
  const detail = {};
  for (const category of VALID_CATEGORIES) {
    const dir = path.join(UPLOADS_ROOT, category);
    let fileCount = null;
    let sample = null;
    try {
      const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      fileCount = entries.length;
      sample = entries.length ? `/uploads/${category}/${entries[0]}` : null;
    } catch {
      fileCount = 'unreadable';
    }
    detail[category] = { dir, exists: fs.existsSync(dir), fileCount, sample };
  }

  let writable = false;
  try {
    fs.accessSync(UPLOADS_ROOT, fs.constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }

  res.json({
    projectRoot: PROJECT_ROOT,
    uploadsRoot: UPLOADS_ROOT,
    uploadsRootExists: fs.existsSync(UPLOADS_ROOT),
    uploadsRootWritable: writable,
    processCwd: process.cwd(),
    cwdMatchesProjectRoot: path.resolve(process.cwd()) === PROJECT_ROOT,
    categories: detail
  });
});

// Upload a single image
// POST /api/uploads/:category (students, menu, logos)
router.post('/:category', verifyToken, (req, res) => {
  const singleUpload = upload.single('image');
  singleUpload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size exceeds the 5MB limit' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const category = req.params.category;
    const relativePath = `/uploads/${category}/${req.file.filename}`;

    res.status(201).json({
      success: true,
      path: relativePath,
      url: relativePath,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  });
});

// Upload multiple images
// POST /api/uploads/:category/multiple
router.post('/:category/multiple', verifyToken, (req, res) => {
  const arrayUpload = upload.array('images', 10);
  arrayUpload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size exceeds the 5MB limit' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    const category = req.params.category;
    const files = req.files.map(file => ({
      path: `/uploads/${category}/${file.filename}`,
      url: `/uploads/${category}/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    }));

    res.status(201).json({
      success: true,
      files
    });
  });
});

// Delete an uploaded image
// DELETE /api/uploads/:category/:filename
router.delete('/:category/:filename', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { category, filename } = req.params;
    
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Sanitize filename to prevent path traversal
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(UPLOADS_ROOT, category, sanitizedFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    fs.unlinkSync(filePath);

    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete upload error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// List uploaded images in a category
// GET /api/uploads/:category
router.get('/:category', verifyToken, async (req, res) => {
  try {
    const { category } = req.params;

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const uploadPath = path.join(UPLOADS_ROOT, category);
    
    if (!fs.existsSync(uploadPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(uploadPath)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'].includes(ext);
      })
      .map(file => {
        const stats = fs.statSync(path.join(uploadPath, file));
        return {
          filename: file,
          path: `/uploads/${category}/${file}`,
          url: `/uploads/${category}/${file}`,
          size: stats.size,
          uploadedAt: stats.mtime
        };
      })
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    res.json(files);
  } catch (error) {
    console.error('List uploads error:', error);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

// Error handling middleware for multer errors
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds the 5MB limit' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

module.exports = router;