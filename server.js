const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;

// 1. מפתח ג'מיני:
const genAI = new GoogleGenerativeAI('AIzaSyCNovA_E4NFRZ-QLVjaqYp816z7SS_U6rc');

// 2. מפתחות קלאודינרי (העתק מהאתר שלהם):
cloudinary.config({
  cloud_name: 'dfmh32zbg',
  api_key: '261223895863227',
  api_secret: 'bRbkbM2uP9OzzU7HxkSd7Sd5Tvk'
});

const app = express();
app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, 'uploads/') },
  filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname) }
});
const upload = multer({ storage: storage });

const mongoURI = 'mongodb+srv://ilay_admin:120766ely@cluster0.whmntq6.mongodb.net/?appName=Cluster0';
mongoose.connect(mongoURI)
  .then(() => console.log('Database connection successful!'))
  .catch((err) => console.log('Database connection error:', err));

const wineSchema = new mongoose.Schema({
  imageUrl: String,
  name: String,
  producer: String,
  wineType: String,
  country: String,
  region: String,
  grapes: String,
  vintage: Number,
  isNatural: Boolean,
  price: Number,
  dateOpened: { type: Date, default: Date.now },
  dateDrank: String,
  rating: Number,
  location: String,
  drankWith: String,
  aiInsights: String, 
  tastingNotes: String,
  memory: String,
  additionalNotes: String,
  bottleStatus: { type: String, default: 'drank' } 
});
const Wine = mongoose.model('Wine', wineSchema);

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const fileData = fs.readFileSync(req.file.path);
    const imageBase64 = { inlineData: { data: fileData.toString("base64"), mimeType: req.file.mimetype } };

    // --- אבחון בינה מלאכותית ---
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const prompt = `
      You are a master sommelier. Analyze this wine label.
      CRITICAL INSTRUCTION: Extract the 'name' and 'producer' EXACTLY as they appear on the label. Do not correct spelling.
      Write fascinating insights (3-4 sentences, in Hebrew) about the wine, the producer, the history, or the vintage. 
      Return a JSON object with EXACTLY these keys:
      {
        "name": "Exact name on label",
        "producer": "Exact producer or domaine",
        "vintage": 2024,
        "country": "Country of origin (in Hebrew, e.g., 'צרפת')",
        "region": "Region (in Hebrew, e.g., 'בורגון')",
        "grapes": "Grape varieties (in Hebrew)",
        "isNatural": true or false,
        "wineType": "אדום", "לבן", "כתום", or "רוזה",
        "aiInsightsArray": ["First interesting fact...", "Second interesting fact...", "Third interesting fact..."]
      }
      If you absolutely cannot find or deduce a value, return an empty string "" for text, or null for numbers.
    `;

    const result = await model.generateContent([prompt, imageBase64]);
    const responseText = result.response.text();
    const cleanJsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const wineData = JSON.parse(cleanJsonString);
    
    if (wineData.aiInsightsArray && Array.isArray(wineData.aiInsightsArray)) {
        wineData.aiInsights = '• ' + wineData.aiInsightsArray.join('\n\n• ');
    } else {
        wineData.aiInsights = '';
    }

    // --- העלאה חכמה לענן ומחיקה מקומית ---
    const cloudinaryResponse = await cloudinary.uploader.upload(req.file.path, {
        folder: 'wine_cellar'
    });
    fs.unlinkSync(req.file.path); // מוחק את העותק הזמני מהמחשב

    res.json({ 
      imageUrl: cloudinaryResponse.secure_url, // עכשיו התמונה מוגשת בבטחה מהענן!
      analyzedData: wineData
    });

  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).json({ error: 'Image analysis error' });
  }
});

app.post('/api/wines', async (req, res) => {
  try {
    const newWine = new Wine(req.body);
    await newWine.save();
    res.status(201).json({ message: 'Wine saved successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Error saving wine' });
  }
});

app.get('/api/wines', async (req, res) => {
  try {
    const wines = await Wine.find().sort({ dateOpened: -1 });
    res.json(wines);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching wines' });
  }
});

app.delete('/api/wines/:id', async (req, res) => {
  try {
    await Wine.findByIdAndDelete(req.params.id);
    res.json({ message: 'Wine deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting wine' });
  }
});

app.put('/api/wines/:id', async (req, res) => {
  try {
    const updatedWine = await Wine.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedWine);
  } catch (err) {
    res.status(500).json({ error: 'Error updating wine' });
  }
});

app.listen(3000, () => console.log('Smart server running on port 3000'));