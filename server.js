require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;
const nodemailer = require('nodemailer');

const app = express();

app.use(cors());
app.use(express.json());

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
  imageUrl: String, name: String, producer: String, wineType: String, country: String,
  region: String, grapes: String, vintage: Number, isNatural: Boolean, price: Number,
  isGift: { type: Boolean, default: false }, dateOpened: { type: Date, default: Date.now },
  dateDrank: String, rating: Number, location: String, drankWith: String, aiInsights: String, 
  drinkWindow: String, tastingNotes: String, memory: String, additionalNotes: String,
  bottleStatus: { type: String, default: 'drank' }, acidity: { type: Number, default: 1 },
  sweetness: { type: Number, default: 1 }, body: { type: Number, default: 1 },
  tannins: { type: Number, default: 1 }, alcohol: { type: Number, default: 1 }
});

const Wine = mongoose.model('Wine', wineSchema);

const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image' });
    const fileData = fs.readFileSync(req.file.path);
    const imageBase64 = { inlineData: { data: fileData.toString("base64"), mimeType: req.file.mimetype } };
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } 
    });
    const prompt = `
      You are an expert Sommelier and wine identifier. Analyze the provided image of a wine bottle.
      Return ONLY a valid JSON object with EXACTLY these keys. If you cannot find or deduce a value, return an empty string "" for text, or null for numbers. Do not include markdown:
      {
        "name": "Exact name of the wine/cuvée",
        "producer": "Exact Winery or Domaine name",
        "vintage": 2024,
        "country": "Country of origin (in Hebrew)",
        "region": "Specific wine region (in Hebrew)",
        "grapes": "Grape varieties (in Hebrew)",
        "isNatural": true,
        "wineType": "אדום, לבן, רוזה, or כתום",
        "drinkWindow": "Estimated drinking window in Hebrew",
        "acidity": 4, "sweetness": 1, "body": 3, "tannins": 1, "alcohol": 3,
        "aiInsightsArray": ["Fact 1", "Fact 2"]
      }
    `;
    const result = await model.generateContent([prompt, imageBase64]);
    const responseText = result.response.text();
    let wineData = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
    if (wineData.aiInsightsArray) wineData.aiInsights = '• ' + wineData.aiInsightsArray.join('\n\n• ');
    const cloudinaryResponse = await cloudinary.uploader.upload(req.file.path, { folder: 'wine_cellar' });
    fs.unlinkSync(req.file.path); 
    res.json({ imageUrl: cloudinaryResponse.secure_url, analyzedData: wineData });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Image analysis error' });
  }
});

app.post('/api/wines', async (req, res) => {
  try {
    const newWine = new Wine(req.body);
    await newWine.save();
    res.status(201).json({ message: 'Saved successfully!' });
  } catch (err) { res.status(500).json({ error: 'Error saving' }); }
});

app.get('/api/wines', async (req, res) => {
  try {
    const wines = await Wine.find().sort({ dateOpened: -1 });
    res.json(wines);
  } catch (err) { res.status(500).json({ error: 'Error fetching' }); }
});

app.delete('/api/wines/:id', async (req, res) => {
  try {
    await Wine.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: 'Error deleting' }); }
});

// המוח החדש: עריכה עם השוואת נתונים למייל
app.put('/api/wines/:id', async (req, res) => {
  try {
    // 1. קודם שולפים את היין הישן כדי שיהיה לנו למה להשוות
    const oldWine = await Wine.findById(req.params.id);
    
    // 2. מבצעים את העדכון בפועל
    const updatedWine = await Wine.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { returnDocument: 'after' } 
    );

    // 3. מחפשים מה השתנה ומרכיבים רשימה יפה
    let changesHtml = '';
    const fieldsToCheck = {
      name: 'שם היין', producer: 'יצרן', vintage: 'שנת בציר', 
      bottleStatus: 'סטטוס הבקבוק', rating: 'ציון אישי', 
      tastingNotes: 'רשמי טעימה', drinkWindow: 'חלון שתייה', 
      aiInsights: 'הסומלייה הדיגיטלי (AI)', price: 'מחיר'
    };

    for (const key in fieldsToCheck) {
      let oldVal = oldWine[key] || 'ריק';
      let newVal = updatedWine[key] || 'ריק';
      
      if (key === 'bottleStatus') {
          oldVal = oldVal === 'drank' ? 'נשתה 🍷' : 'שמור באוסף 🍾';
          newVal = newVal === 'drank' ? 'נשתה 🍷' : 'שמור באוסף 🍾';
      }

      if (String(oldVal) !== String(newVal)) {
          changesHtml += `
            <li style="margin-bottom: 8px;">
              <strong style="color: #572C3A;">${fieldsToCheck[key]}:</strong><br/>
              <span style="color: #9C898E; text-decoration: line-through;">${oldVal}</span> 
              <br/>➔ <span style="color: #332F2C; font-weight: bold;">${newVal}</span>
            </li>
          `;
      }
    }

    if (changesHtml === '') {
        changesHtml = '<li>עודכנו פרטים טכניים קטנים (השדות המרכזיים נותרו ללא שינוי).</li>';
    }

    // 4. שעת העדכון
    const updateTime = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

    // 5. שליחת המייל העשיר
    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const mailOptions = {
          from: process.env.EMAIL_USER, 
          to: 'ilaybittan@outlook.com', 
          subject: `🍷 מרתף היין: עודכנו פרטים ל-${updatedWine.name}`,
          html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; color: #332F2C; background-color: #F4F2EE; padding: 25px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #572C3A; margin-top: 0;">היי עילי!</h2>
              <p style="font-size: 16px;">בוצע כעת עדכון ליין <strong>${updatedWine.name}</strong> במרתף.</p>
              
              <div style="background-color: #FFFFFF; padding: 20px; border-radius: 12px; border: 1px solid #EAE6DF; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #B49A65; border-bottom: 2px solid #F4F2EE; padding-bottom: 10px;">מה בדיוק השתנה?</h3>
                <ul style="line-height: 1.6; padding-right: 20px;">
                  ${changesHtml}
                </ul>
              </div>

              <p style="font-size: 14px; color: #7D736A;">⏰ עדכון זה בוצע בתאריך ${updateTime}</p>
              <br/>
              <p style="font-weight: bold; color: #572C3A;">לחיים! 🥂</p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
      }
    } catch (emailError) {
      console.error('❌ שגיאה בשליחת המייל:', emailError.message);
    }

    res.json(updatedWine);
  } catch (err) {
    res.status(500).json({ error: 'Error updating' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת רץ ומאזין על פורט ${PORT}`);
});