import { useState, useEffect } from 'react'
import heic2any from 'heic2any'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function App() {
  const initialFormState = {
    name: '', producer: '', wineType: 'אדום', country: '', region: '', 
    grapes: '', vintage: 2024, isNatural: false, price: '', rating: 5, 
    location: '', drankWith: '', dateDrank: '', aiInsights: '', tastingNotes: '', memory: '', additionalNotes: '', imageUrl: '',
    bottleStatus: 'drank' 
  };

  const [formData, setFormData] = useState(initialFormState);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [winesList, setWinesList] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('הכל');
  const [currentView, setCurrentView] = useState('scan'); 
  const [cellarTab, setCellarTab] = useState('drank'); 

  // הקישור לשרת החדש שלך ברנדר
  const API_BASE_URL = 'https://wine-app-server.onrender.com';

  const fetchWines = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/wines`);
      if (!response.ok) throw new Error('Network error');
      const data = await response.json();
      setWinesList(data);
    } catch (error) { 
      console.error('שגיאה במשיכת היינות', error); 
    }
  };

  useEffect(() => { fetchWines(); }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  // פונקציה חכמה לכיווץ תמונה לפני שליחה
  const resizeImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200; // גודל מקסימלי מספיק בהחלט
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_WIDTH) {
              width *= MAX_WIDTH / height;
              height = MAX_WIDTH;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            resolve(new File([blob], "compressed.jpg", { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.7); // איכות 70% חוסכת המון מקום בלי לפגוע בזיהוי
        };
      };
    });
  };

  const handleImageChange = async (e) => {
    let file = e.target.files[0];
    if (!file) return;
    
    setIsAnalyzing(true); 

    // המרת HEIC אם צריך
    if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic') {
      try {
        const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
        file = new File([Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob], "converted.jpg", { type: 'image/jpeg' });
      } catch (error) {
        console.error("HEIC conversion failed", error);
      }
    }

    // כיווץ התמונה
    const compressedFile = await resizeImage(file);
    setPreviewUrl(URL.createObjectURL(compressedFile)); 
    
    try {
      const imageFormData = new FormData();
      imageFormData.append('image', compressedFile);
      const response = await fetch(`${API_BASE_URL}/api/analyze`, { method: 'POST', body: imageFormData });
      const data = await response.json();
      
      if (response.ok) {
        setFormData(prev => ({ 
            ...prev, 
            ...data.analyzedData, 
            imageUrl: data.imageUrl,
            aiInsights: '• ' + data.analyzedData.aiInsightsArray.join('\n\n• ')
        }));
      }
    } catch (error) { 
        alert('השרת מתעורר או שיש שגיאת תקשורת. נסה שוב בעוד כמה שניות.'); 
    } finally { 
        setIsAnalyzing(false); 
    }
  };

  // ... שאר הפונקציות (handleSubmit, handleDelete וכו') נשארות כמעט זהות, רק להחליף את ה-fetch ל-API_BASE_URL
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const url = editingId ? `${API_BASE_URL}/api/wines/${editingId}` : `${API_BASE_URL}/api/wines`;
    const method = editingId ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
      });
      if (response.ok) {
        setEditingId(null);
        setCellarTab(formData.bottleStatus === 'stored' ? 'stored' : 'drank');
        setFormData(initialFormState);
        setPreviewUrl(null);
        fetchWines(); 
        setCurrentView('cellar'); 
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) { alert('שגיאה בשמירה.'); } finally { setIsSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('האם למחוק?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/wines/${id}`, { method: 'DELETE' });
      fetchWines();
    } catch (error) { alert('שגיאה במחיקה.'); }
  };

  const startEdit = (wine) => {
    setEditingId(wine._id);
    setFormData({ ...initialFormState, ...wine });
    setPreviewUrl(wine.imageUrl);
    setCurrentView('scan'); 
  };

  // העתק לכאן את כל שאר ה-JSX והעיצוב מהגרסה הקודמת (stats, getCountryFlag וכו')
  // וודא שאתה משתמש בגרסה המלאה שנתתי לך קודם, רק עם handleImageChange החדש.

  return (
      // כאן מגיע כל ה-JSX של האפליקציה (כמו בגרסה הקודמת)
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px', direction: 'rtl' }}>
          {/* ... תוכן האפליקציה ... */}
      </div>
  );
}

export default App;