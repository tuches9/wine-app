const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
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
  console.log("--- מתחיל פענוח תווית יין ---");
  try {
    if (!req.file) {
      console.log("❌ שגיאה: לא התקבלה תמונה");
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const fileData = fs.readFileSync(req.file.path);
    const imageBase64 = { inlineData: { data: fileData.toString("base64"), mimeType: req.file.mimetype } };

    // חזרנו לג'מיני 2.5 פלאש שלך, יחד עם מצב ה-JSON וללא חיפוש שובר-שרת
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    // הפרומפט החדש: הופך אותו למומחה ליינות טבעיים שקורא את השוליים
    const prompt = `
      You are an expert Sommelier and wine identifier. Analyze the provided image of a wine bottle.
      CRITICAL INSTRUCTIONS FOR HARD-TO-READ OR NATURAL WINE LABELS:
      1. Scan the ENTIRE image, especially the far edges of the label. Look for vertical text, fine print, or small logos.
      2. Natural wines often have hand-drawn, artistic labels without clear text on the front. Use your internal knowledge base to identify the producer based on the art style, the cuvée name, or any fragments of text.
      3. Extract 'name' and 'producer' accurately based on visual clues.
      
      Return ONLY a JSON object with EXACTLY these keys. If you cannot find or deduce a value, return an empty string "" for text, or null for numbers:
      {
        "name": "Exact name of the wine/cuvée",
        "producer": "Exact Winery or Domaine name",
        "vintage": 2024,
        "country": "Country of origin (in Hebrew, e.g., 'צרפת')",
        "region": "Specific wine region (in Hebrew, e.g., 'לואר')",
        "grapes": "Grape varieties (in Hebrew)",
        "isNatural": true,
        "wineType": "אדום, לבן, רוזה, or כתום",
        "aiInsightsArray": [
          "Fascinating fact 1 about this producer or style (Hebrew)",
          "Fascinating fact 2 (Hebrew)",
          "Fascinating fact 3 (Hebrew)"
        ]
      }
    `;

    console.log("שולח תמונה ל-Gemini 2.5 Flash...");
    const result = await model.generateContent([prompt, imageBase64]);
    const responseText = result.response.text();
    console.log("התקבלה תשובה מהמודל, ממיר לנתונים...");

    const cleanJsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const wineData = JSON.parse(cleanJsonString);
    
    if (wineData.aiInsightsArray && Array.isArray(wineData.aiInsightsArray)) {
        wineData.aiInsights = '• ' + wineData.aiInsightsArray.join('\n\n• ');
    } else {
        wineData.aiInsights = '';
    }

    console.log("מעלה תמונה לקלאודינרי...");
    const cloudinaryResponse = await cloudinary.uploader.upload(req.file.path, {
        folder: 'wine_cellar'
    });
    fs.unlinkSync(req.file.path); 

    res.json({ 
      imageUrl: cloudinaryResponse.secure_url, 
      analyzedData: wineData
    });
    console.log("--- פענוח הסתיים בהצלחה, שולח לאפליקציה ---");

  } catch (error) {
    console.error("❌ שגיאה בפענוח השרת:", error.message || error);
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
    const updatedWine = await Wine.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedWine);
  } catch (err) {
    res.status(500).json({ error: 'Error updating wine' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Smart server running on port ${PORT}`));