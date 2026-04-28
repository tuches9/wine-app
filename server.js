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

console.log("--- שרת מרתף היין עולה לאוויר ---");
console.log("בדיקת משתני סביבה:");
console.log("EMAIL_USER:", process.env.EMAIL_USER ? "✅ מוגדר" : "❌ חסר!");
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "✅ מוגדר" : "❌ חסר!");

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
  drinkWindow: String,
  tastingNotes: String,
  memory: String,
  additionalNotes: String,
  bottleStatus: { type: String, default: 'drank' },
  acidity: { type: Number, default: 1 },
  sweetness: { type: Number, default: 1 },
  body: { type: Number, default: 1 },
  tannins: { type: Number, default: 1 },
  alcohol: { type: Number, default: 1 }
});

const Wine = mongoose.model('Wine', wineSchema);

// הגדרת הטרנספורטר עם לוגים לניפוי שגיאות
const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS  
  }
});

// בדיקת חיבור למייל מיד עם עליית השרת
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ שגיאה בהתחברות לשירות המייל:", error.message);
    console.log("טיפ: וודא שהשתמשת ב'סיסמת אפליקציה' ולא בסיסמה הרגילה של ג'ימייל.");
  } else {
    console.log("✅ שרת המייל מוכן לשליחה!");
  }
});

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  console.log("--- מתחיל פענוח תווית יין ---");
  try {
    if (!req.file) {
      console.log("❌ לא התקבלה תמונה בשרת.");
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const fileData = fs.readFileSync(req.file.path);
    const imageBase64 = { inlineData: { data: fileData.toString("base64"), mimeType: req.file.mimetype } };

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ]
    });
    
    const prompt = `
      You are an expert Sommelier and wine identifier. Analyze the provided image of a wine bottle.
      CRITICAL INSTRUCTIONS FOR HARD-TO-READ OR NATURAL WINE LABELS:
      1. Scan the ENTIRE image, especially the far edges of the label. Look for vertical text, fine print, or small logos.
      2. Natural wines often have hand-drawn, artistic labels without clear text. If you suspect it's a natural wine based on the art style, use your deep internal knowledge base to identify the producer, cuvée, or region based on the visual clues.
      3. Estimate the optimal drinking window concisely in Hebrew (e.g., '2024-2028', 'מוכן לשתייה עכשיו', or 'לשמור עוד 3 שנים').
      4. Crucial: Rate the wine's profile (Acidity, Sweetness, Body, Tannins, Alcohol) on a scale of 1-5 (1=lowest, 5=highest) based on the classic profile of this type, region, and vintage.
      
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
        "acidity": 4, // 1-5
        "sweetness": 1, // 1-5
        "body": 3, // 1-5
        "tannins": 1, // 1-5
        "alcohol": 3, // 1-5
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
        console.error("❌ ה-AI לא החזיר JSON תקין:", responseText);
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

    console.log("✅ פענוח תווית הסתיים בהצלחה!");
    res.json({ 
      imageUrl: cloudinaryResponse.secure_url, 
      analyzedData: wineData
    });

  } catch (error) {
    console.error("❌ שגיאה כללית בפענוח היין:", error.message || error);
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
    console.log(`🍷 יין חדש נשמר: ${newWine.name}`);

    // שליחת אימייל על הוספת יין
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const statusText = newWine.bottleStatus === 'drank' ? 'נשתה 🍷' : 'שמור באוסף 🍾';
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: 'ilaybittan@outlook.com',
        subject: `🍷 מרתף היין: יין חדש התווסף! - ${newWine.name}`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; color: #332F2C; background-color: #F4F2EE; padding: 25px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #572C3A; margin-top: 0;">היי עילי!</h2>
            <p style="font-size: 16px;">יין חדש התווסף בהצלחה למרתף היין.</p>
            <div style="background-color: #FFFFFF; padding: 20px; border-radius: 12px; border: 1px solid #EAE6DF; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #B49A65; border-bottom: 2px solid #F4F2EE; padding-bottom: 10px;">פרטי היין החדש:</h3>
              <ul style="line-height: 1.6; padding-right: 20px; list-style-type: none;">
                <li style="margin-bottom: 8px;"><strong style="color: #572C3A;">שם היין:</strong> ${newWine.name}</li>
                <li style="margin-bottom: 8px;"><strong style="color: #572C3A;">יצרן:</strong> ${newWine.producer || '-'}</li>
                <li style="margin-bottom: 8px;"><strong style="color: #572C3A;">סוג:</strong> ${newWine.wineType}</li>
                <li style="margin-bottom: 8px;"><strong style="color: #572C3A;">סטטוס:</strong> ${statusText}</li>
              </ul>
            </div>
            <p style="font-size: 14px; color: #7D736A;">⏰ נוסף בתאריך: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
            <br/><p style="font-weight: bold; color: #572C3A;">לחיים! 🥂</p>
          </div>
        `
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('❌ שגיאה בשליחת מייל הוספה:', error.message);
        } else {
          console.log('✉️ מייל הוספה נשלח בהצלחה: ' + info.response);
        }
      });
    }

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
  console.log(`📬 הגיעה בקשת עריכה ליין: ${req.params.id}`);
  try {
    const oldWine = await Wine.findById(req.params.id);
    
    const updatedWine = await Wine.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { returnDocument: 'after' } 
    );

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
        changesHtml = '<li>עודכנו פרטים טכניים קטנים.</li>';
    }

    const updateTime = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

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
              <ul style="line-height: 1.6; padding-right: 20px;">${changesHtml}</ul>
            </div>
            <p style="font-size: 14px; color: #7D736A;">⏰ תאריך עדכון: ${updateTime}</p>
            <br/><p style="font-weight: bold; color: #572C3A;">לחיים! 🥂</p>
          </div>
        `
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('❌ שגיאה בשליחת מייל עריכה:', error.message);
        } else {
          console.log('✉️ מייל עריכה נשלח בהצלחה: ' + info.response);
        }
      });
    }

    res.json(updatedWine);
  } catch (err) {
    res.status(500).json({ error: 'Error updating wine' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת רץ ומאזין על פורט ${PORT}`);
});