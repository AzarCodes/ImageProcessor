const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/imagemagick')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Image Schema
const ImageSchema = new mongoose.Schema({
  originalName: String,
  filename: String,
  path: String,
  processedFilename: String,
  createdAt: { type: Date, default: Date.now }
});

const Image = mongoose.model('Image', ImageSchema);

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Route to handle root URL
app.get('/', (req, res) => {
  res.send('Welcome to the Image Processor!');
});

// Image Upload and Process Route
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const processedFilename = `processed_${req.file.filename}`;
    const processedPath = path.join(uploadDir, processedFilename);
    
    // Instead of using ImageMagick, let's just create a simple copy for now
    fs.copyFileSync(req.file.path, processedPath);

    // Save image details to MongoDB
    const newImage = new Image({
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      processedFilename: processedFilename
    });

    await newImage.save();

    res.json({
      message: 'Image uploaded and processed',
      image: newImage
    });
  } catch (error) {
    console.error('Error during image upload and processing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all images
app.get('/images', async (req, res) => {
  try {
    const images = await Image.find().sort({ createdAt: -1 });
    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: 'Error fetching images.' });
  }
});

// Delete Files
app.delete('/delete/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const deletedImage = await Image.findByIdAndDelete(id);
    if (!deletedImage) {
      return res.status(404).json({ error: 'Image not found.' });
    }
    
    // Delete associated files
    try {
      if (fs.existsSync(deletedImage.path)) {
        fs.unlinkSync(deletedImage.path);
      }
      
      const processedPath = path.join(uploadDir, deletedImage.processedFilename);
      if (fs.existsSync(processedPath)) {
        fs.unlinkSync(processedPath);
      }
    } catch (err) {
      console.error('Error deleting files:', err);
    }
    
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Error deleting image.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});