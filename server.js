const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;

// השרת ימשוך את המפתחות מההגדרות המאובטחות ב-Render
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
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const fileData = fs.readFileSync(req.file.path);
    const imageBase64 = { inlineData: { data: fileData.toString("base64"), mimeType: req.file.mimetype } };

    // התיקון כאן: הסרנו את ה-generationConfig שגרם להתנגשות עם מנוע החיפוש
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro",
      tools: [{ googleSearch: {} }] 
    });
    
    const prompt = `
      You are an expert Sommelier and wine identifier. Analyze the provided image of a wine bottle.
      Your goal is to extract as much accurate information as possible and return it strictly as a JSON object.

      CRITICAL INSTRUCTIONS FOR HARD-TO-READ LABELS:
      1. Scan the ENTIRE image, especially the far edges of the label. Look for vertical text, fine print, or import/export details.
      2. If the front label is purely an illustration without text, USE THE GOOGLE SEARCH TOOL to search for the visual characteristics, producer name (if found on the edge), or any visible cuvée name.
      3. Natural wines often have hand-drawn, artistic labels without clear text on the front. If you suspect it's a natural wine based on the art style, use that context in your search.
      4. If you see a QR code, mention that in the insights, even if you can't scan it directly.

      Return a JSON object with EXACTLY these keys. If you are entirely unsure about a field, return an empty string "" for text, or null for numbers, but try your absolute best to infer from the search:
      {
        "name": "Exact name of the wine/cuvée",
        "producer": "Exact Winery or Domaine name",
        "vintage": 2024,
        "country": "Country of origin (in Hebrew, e.g., 'צרפת')",
        "region": "Specific wine region (in Hebrew, e.g., 'בורגון')",
        "grapes": "Grape varieties (in Hebrew)",
        "isNatural": true or false,
        "wineType": "אדום, לבן, רוזה, or כתום",
        "aiInsightsArray": [
          "A fascinating fact about this producer or wine style (Hebrew)",
          "Information about the label art or the story behind the wine (Hebrew)",
          "Any other interesting context from your search (Hebrew)"
        ]
      }
    `;

    const result = await model.generateContent([prompt, imageBase64]);
    const responseText = result.response.text();
    
    // מנקה את הטקסט כדי לוודא שזה JSON תקין
    const cleanJsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const wineData = JSON.parse(cleanJsonString);
    
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
    // הוספתי כאן הדפסה מפורטת יותר כדי שאם תהיה שוב שגיאה נדע בדיוק מה היא
    console.error("Detailed analysis error:", error.message || error);
    if (req.file && fs.existsSync(req.file.path)) {
       fs.unlinkSync(req.file.path); // מנקה את הקובץ גם אם היתה שגיאה
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