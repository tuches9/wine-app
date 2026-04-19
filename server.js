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

// לוגים שיופיעו בטרמינל של Render כדי שנדע מה קורה
console.log("--- שרת מרתף היין עולה לאוויר ---");
console.log("בדיקת משתני סביבה:");
console.log("EMAIL_USER הוגדר?", process.env.EMAIL_USER ? "✅ כן" : "❌ לא");
console.log("EMAIL_PASS הוגדר?", process.env.EMAIL_PASS ? "✅ כן" : "❌ לא");

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

app.get('/health', (req, res) => res.status(200).send('OK'));

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image' });
    const fileData = fs.readFileSync(req.file.path);
    const imageBase64 = { inlineData: { data: fileData.toString("base64"), mimeType: req.file.mimetype } };
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });
    const prompt = `You are an expert Sommelier... (PROMPT_FULL)`; 
    const result = await model.generateContent([prompt, imageBase64]);
    const responseText = result.response.text();
    let wineData = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
    if (wineData.aiInsightsArray) wineData.aiInsights = '• ' + wineData.aiInsightsArray.join('\n\n• ');
    const cloudinaryResponse = await cloudinary.uploader.upload(req.file.path, { folder: 'wine_cellar' });
    fs.unlinkSync(req.file.path); 
    res.json({ imageUrl: cloudinaryResponse.secure_url, analyzedData: wineData });
  } catch (error) { res.status(500).json({ error: 'AI Error' }); }
});

app.get('/api/wines', async (req, res) => {
  try {
    const wines = await Wine.find().sort({ dateOpened: -1 });
    res.json(wines);
  } catch (err) { res.status(500).json({ error: 'Fetch Error' }); }
});

app.put('/api/wines/:id', async (req, res) => {
  console.log(`📬 בקשת עריכה הגיעה לשרת עבור: ${req.params.id}`);
  try {
    const oldWine = await Wine.findById(req.params.id);
    const updatedWine = await Wine.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });

    let changesHtml = '';
    const fieldsToCheck = { name: 'שם היין', producer: 'יצרן', vintage: 'בציר', bottleStatus: 'סטטוס', rating: 'ציון' };
    for (const key in fieldsToCheck) {
      if (String(oldWine[key]) !== String(updatedWine[key])) {
        changesHtml += `<li><strong>${fieldsToCheck[key]}:</strong> ${oldWine[key]} ➔ ${updatedWine[key]}</li>`;
      }
    }

    const updateTime = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: 'ilaybittan@outlook.com',
        subject: `🍷 עדכון במרתף: ${updatedWine.name}`,
        html: `<div dir="rtl"><h2>היי עילי, היין ${updatedWine.name} עודכן!</h2><ul>${changesHtml || '<li>עודכנו פרטים כלליים.</li>'}</ul><p>זמן עדכון: ${updateTime}</p></div>`
      });
      console.log("✉️ מייל נשלח בהצלחה!");
    }

    res.json(updatedWine);
  } catch (err) { 
    console.error("❌ שגיאה בעריכה:", err.message);
    res.status(500).json({ error: 'Update Error' }); 
  }
});

app.delete('/api/wines/:id', async (req, res) => {
  try {
    await Wine.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Delete Error' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 שרת רץ בפורט ${PORT}`));