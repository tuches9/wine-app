require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;
const { Resend } = require('resend');
const app = express();

app.use(cors());
app.use(express.json());

console.log("--- שרת מרתף היין עולה לאוויר ---");
console.log("בדיקת מפתח Resend:", process.env.RESEND_API_KEY ? "✅ מוגדר" : "❌ חסר");

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');
const resend = new Resend(process.env.RESEND_API_KEY);

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

const getWineTypeIcon = (type) => {
  switch (type) {
    case 'אדום': return '🍷 יין אדום';
    case 'לבן': return '🥂 יין לבן';
    case 'כתום': return '🍊 יין כתום';
    case 'רוזה': return '🌸 יין רוזה';
    case 'מבעבע': return '🍾 יין מבעבע';
    case 'סאקה': return '🍶 סאקה';
    default: return '🍷 יין';
  }
};

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
        const backticks = String.fromCharCode(96, 96, 96);
        let cleanJsonString = responseText.replace(new RegExp(backticks + 'json', 'g'), '');
        cleanJsonString = cleanJsonString.replace(new RegExp(backticks, 'g'), '');
        cleanJsonString = cleanJsonString.trim();
        
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

// מסלול ליצירת יין חדש (כולל שליחת מייל)
app.post('/api/wines', async (req, res) => {
  try {
    const newWine = new Wine(req.body);
    await newWine.save();
    
    // מחזירים תשובה ללקוח כדי לא לעכב את האפליקציה
    res.status(201).json({ message: 'Wine saved successfully!' });

    // תהליך הרקע של המייל ליין חדש
    if (process.env.RESEND_API_KEY) {
      const wineIcon = getWineTypeIcon(newWine.wineType);
      const updateTime = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
      
      resend.emails.send({
        from: 'onboarding@resend.dev',
        to: 'ilaybittan@outlook.com',
        subject: `🍷 מרתף היין: יין חדש נוסף - ${newWine.name}`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; color: #332F2C; background-color: #F4F2EE; padding: 25px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #572C3A; margin: 0; font-size: 24px;">מרתף היין</h1>
              <p style="color: #B49A65; font-style: italic; margin: 0;">של עילי וגילי</p>
            </div>
            
            <p style="font-size: 16px;">יין חדש נוסף למערכת: <strong>${newWine.name}</strong></p>
            <p style="font-size: 16px;">סוג היין: <strong>${wineIcon}</strong> ${newWine.isNatural ? '(טבעי 🌱)' : ''}</p>
            
            <div style="background-color: #FFFFFF; padding: 20px; border-radius: 12px; border: 1px solid #EAE6DF; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #B49A65; border-bottom: 2px solid #F4F2EE; padding-bottom: 10px;">פרטים כלליים:</h3>
              <ul style="line-height: 1.6; padding-right: 0; list-style-type: none;">
                <li style="margin-bottom: 8px;"><strong style="color: #572C3A;">יצרן:</strong> ${newWine.producer || 'לא צוין'}</li>
                <li style="margin-bottom: 8px;"><strong style="color: #572C3A;">שנת בציר:</strong> ${newWine.vintage || 'לא צוין'}</li>
                <li style="margin-bottom: 8px;"><strong style="color: #572C3A;">מדינה ואזור:</strong> ${newWine.country || ''} ${newWine.region ? `(${newWine.region})` : ''}</li>
                <li style="margin-bottom: 8px;"><strong style="color: #572C3A;">סטטוס הבקבוק:</strong> ${newWine.bottleStatus === 'drank' ? 'נשתה 🍷' : 'שמור באוסף 🍾'}</li>
              </ul>
            </div>

            <p style="font-size: 12px; color: #7D736A; text-align: center; border-top: 1px solid #EAE6DF; padding-top: 15px;">
              ⏰ נוסף בתאריך: ${updateTime}
            </p>
          </div>
        `
      }).catch(e => console.error('❌ שגיאה בשליחת המייל דרך Resend (הוספה):', e));
    }

  } catch (err) {
    console.error("❌ Error saving wine:", err);
    if (!res.headersSent) res.status(500).json({ error: 'Error saving wine' });
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

// מסלול למחיקת יין (כולל שליחת מייל)
app.delete('/api/wines/:id', async (req, res) => {
  try {
    // שולפים את היין לפני המחיקה כדי שנדע מה השם שלו למייל
    const wineToDelete = await Wine.findById(req.params.id);
    
    await Wine.findByIdAndDelete(req.params.id);
    res.json({ message: 'Wine deleted successfully' });

    // תהליך הרקע של המייל ליין שנמחק
    if (process.env.RESEND_API_KEY && wineToDelete) {
      const updateTime = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
      
      resend.emails.send({
        from: 'onboarding@resend.dev',
        to: 'ilaybittan@outlook.com',
        subject: `🗑️ מרתף היין: יין נמחק - ${wineToDelete.name}`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; color: #332F2C; background-color: #F4F2EE; padding: 25px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #572C3A; margin: 0; font-size: 24px;">מרתף היין</h1>
              <p style="color: #B49A65; font-style: italic; margin: 0;">של עילי וגילי</p>
            </div>
            
            <p style="font-size: 16px;">היין <strong>${wineToDelete.name}</strong> הוסר לחלוטין מהמערכת.</p>
            
            <p style="font-size: 12px; color: #7D736A; text-align: center; border-top: 1px solid #EAE6DF; margin-top: 20px; padding-top: 15px;">
              ⏰ נמחק בתאריך: ${updateTime}
            </p>
          </div>
        `
      }).catch(e => console.error('❌ שגיאה בשליחת המייל דרך Resend (מחיקה):', e));
    }

  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Error deleting wine' });
  }
});

// מסלול לעדכון יין קיים (כולל שליחת מייל משודרג)
app.put('/api/wines/:id', async (req, res) => {
  console.log(`📬 הגיעה בקשת עריכה ליין: ${req.params.id}`);
  try {
    const oldWine = await Wine.findById(req.params.id);
    
    const updatedWine = await Wine.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { returnDocument: 'after' } 
    );

    res.json(updatedWine);

    if (process.env.RESEND_API_KEY && oldWine) {
      let changesHtml = '';
      
      const fieldsToCheck = {
        name: 'שם היין', 
        producer: 'יצרן / Domaine', 
        vintage: 'שנת בציר', 
        wineType: 'סוג היין',
        country: 'מדינה',
        region: 'אזור',
        grapes: 'זני ענבים',
        price: 'מחיר (₪)',
        bottleStatus: 'סטטוס הבקבוק', 
        rating: 'ציון אישי', 
        tastingNotes: 'רשמי טעימה', 
        drinkWindow: 'חלון שתייה', 
        memory: 'זיכרון',
        location: 'מיקום הטעימה',
        drankWith: 'שותפים לטעימה',
        aiInsights: 'הסומלייה הדיגיטלי (AI)',
        acidity: 'חומציות (1-5)',
        sweetness: 'מתיקות (1-5)',
        body: 'גוף (1-5)',
        tannins: 'טאנינים (1-5)',
        alcohol: 'אלכוהול (1-5)'
      };

      for (const key in fieldsToCheck) {
        let oldVal = oldWine[key];
        let newVal = updatedWine[key];

        if (oldVal === undefined || oldVal === null || oldVal === '') oldVal = 'ריק';
        if (newVal === undefined || newVal === null || newVal === '') newVal = 'ריק';

        if (key === 'bottleStatus') {
            oldVal = oldVal === 'drank' ? 'נשתה 🍷' : 'שמור באוסף 🍾';
            newVal = newVal === 'drank' ? 'נשתה 🍷' : 'שמור באוסף 🍾';
        }

        if (String(oldVal) !== String(newVal)) {
            changesHtml += `
              <li style="margin-bottom: 12px; padding: 10px; background-color: #F8F7F5; border-radius: 8px;">
                <strong style="color: #572C3A; display: block; font-size: 1.1em; margin-bottom: 4px;">${fieldsToCheck[key]}</strong>
                <span style="color: #A34E4E; text-decoration: line-through;">${oldVal}</span> 
                <br/>➔ <span style="color: #4A5D23; font-weight: bold;">${newVal}</span>
              </li>
            `;
        }
      }

      if (changesHtml === '') {
          changesHtml = '<p style="color: #7D736A; font-style: italic; text-align: center;">לא זוהו שינויים מהותיים בטקסט.</p>';
      } else {
          changesHtml = `<ul style="list-style-type: none; padding-right: 0; margin: 0;">${changesHtml}</ul>`;
      }

      const updateTime = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
      const wineIcon = getWineTypeIcon(updatedWine.wineType);

      resend.emails.send({
        from: 'onboarding@resend.dev',
        to: 'ilaybittan@outlook.com',
        subject: `🍷 מרתף היין: עדכון בבקבוק ${updatedWine.name}`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; color: #332F2C; background-color: #F4F2EE; padding: 25px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #572C3A; margin: 0; font-size: 24px;">מרתף היין</h1>
              <p style="color: #B49A65; font-style: italic; margin: 0;">של עילי וגילי</p>
            </div>
            
            <p style="font-size: 16px;">בוצע כעת עדכון ליין <strong>${updatedWine.name}</strong> במרתף.</p>
            <p style="font-size: 16px; margin-bottom: 20px;">סוג היין: <strong>${wineIcon}</strong> ${updatedWine.isNatural ? '(טבעי 🌱)' : ''}</p>
            
            <div style="background-color: #FFFFFF; padding: 20px; border-radius: 12px; border: 1px solid #EAE6DF; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #B49A65; border-bottom: 2px solid #F4F2EE; padding-bottom: 10px;">פירוט השינויים:</h3>
              ${changesHtml}
            </div>

            <p style="font-size: 12px; color: #7D736A; text-align: center; border-top: 1px solid #EAE6DF; padding-top: 15px;">
              ⏰ עדכון זה בוצע בתאריך: ${updateTime}
            </p>
          </div>
        `
      })
      .then(data => console.log("✉️ התראת מייל נשלחה בהצלחה ברקע דרך Resend"))
      .catch(emailError => console.error('❌ שגיאה בשליחת המייל דרך Resend:', emailError));
    }

  } catch (err) {
    console.error("❌ Error updating wine:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error updating wine' });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 השרת רץ ומאזין על פורט ${PORT}`);
});