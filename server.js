const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME || 'dummy',
  api_key: process.env.CLOUD_API_KEY || 'dummy',
  api_secret: process.env.CLOUD_API_SECRET || 'dummy'
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, 'uploads/') },
  filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname) }
});
const upload = multer({ storage: storage });

const mongoURI = 'mongodb+srv://ilay_admin:120766ely@cluster0.whmntq6.mongodb.net/?appName=Cluster0';

mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log('✅ חיבור למסד הנתונים הצליח!'))
  .catch((err) => console.error('❌ שגיאה בחיבור למסד הנתונים:', err.message));

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
  isGift: { type: Boolean, default: false },
  dateOpened: { type: Date, default: Date.now },
  dateDrank: String,
  rating: Number,
  location: String,
  drankWith: String,
  aiInsights: String, 
  drinkWindow: String, // השדה החדש שהוספנו
  tastingNotes: String,
  memory: String,
  additionalNotes: String,
  bottleStatus: { type: String, default: 'drank' } 
});
const Wine = mongoose.model('Wine', wineSchema);

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  console.log("--- מתחיל פענוח תווית יין ---");
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const fileData = fs.readFileSync(req.file.path);
    const imageBase64 = { inlineData: { data: fileData.toString("base64"), mimeType: req.file.mimetype } };

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const prompt = `
      You are an expert Sommelier and wine identifier. Analyze the provided image of a wine bottle.
      CRITICAL INSTRUCTIONS FOR HARD-TO-READ OR NATURAL WINE LABELS:
      1. Scan the ENTIRE image, especially the far edges of the label. Look for vertical text, fine print, or small logos.
      2. Natural wines often have hand-drawn, artistic labels without clear text. If you suspect it's a natural wine based on the art style, use your deep internal knowledge base to identify the producer, cuvée, or region based on the visual clues.
      3. Estimate the optimal drinking window for this wine based on its type, region, and vintage. Keep it concise in Hebrew (e.g., '2024-2028', 'מוכן לשתייה עכשיו', or 'לשמור עוד 3 שנים').
      
      Return ONLY a valid JSON object with EXACTLY these keys. If you cannot find or deduce a value, return an empty string "" for text, or null for numbers. Do not include markdown:
      {
        "name": "Exact name of the wine/cuvée",
        "producer": "Exact Winery or Domaine name",
        "vintage": 2024,
        "country": "Country of origin (in Hebrew, e.g., 'צרפת')",
        "region": "Specific wine region (in Hebrew, e.g., 'בורגון')",
        "grapes": "Grape varieties (in Hebrew)",
        "isNatural": true,
        "wineType": "אדום, לבן, רוזה, or כתום",
        "drinkWindow": "Estimated drinking window in Hebrew",
        "aiInsightsArray": [
          "Fascinating fact 1 about this producer or style (Hebrew)",
          "Fascinating fact 2 (Hebrew)"
        ]
      }
    `;

    const result = await model.generateContent([prompt, imageBase64]);
    const responseText = result.response.text();
    
    let wineData;
    try {
        const cleanJsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        wineData = JSON.parse(cleanJsonString);
    } catch (parseError) {
        throw new Error("Invalid JSON format from Gemini");
    }
    
    if (wineData.aiInsightsArray && Array.isArray(wineData.aiInsightsArray)) {
        wineData.aiInsights = '• ' + wineData.aiInsightsArray.join('\n\n• ');
    } else {
        wineData.aiInsights = '';
    }

    const cloudinaryResponse = await cloudinary.uploader.upload(req.file.path, {
        folder: 'wine_cellar'
    });
    fs.unlinkSync(req.file.path); 

    res.json({ 
      imageUrl: cloudinaryResponse.secure_url, 
      analyzedData: wineData
    });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
       fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Image analysis error', details: error.message });
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
    const updatedWine = await Wine.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { returnDocument: 'after' } 
    );
    res.json(updatedWine);
  } catch (err) {
    res.status(500).json({ error: 'Error updating wine' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת רץ ומאזין על פורט ${PORT}`);
});