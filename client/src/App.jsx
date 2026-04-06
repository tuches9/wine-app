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
  const [currentView, setCurrentView] = useState('scan'); 
  const [cellarTab, setCellarTab] = useState('drank'); 
  
  // הגדרות סינון ומיון - ברירת המחדל היא תאריך טעימה כי הלשונית הראשונה היא היסטוריה
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('הכל');
  const [filterCountry, setFilterCountry] = useState('הכל');
  const [sortOption, setSortOption] = useState('dateDrank_desc');

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

  const handleStatusChange = (status) => {
    setFormData({ ...formData, bottleStatus: status });
  };

  const resizeImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
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
          }, 'image/jpeg', 0.7); 
        };
      };
    });
  };

  const handleImageChange = async (e) => {
    let file = e.target.files[0];
    if (!file) return;
    
    setIsAnalyzing(true); 

    if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic') {
      try {
        const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
        file = new File([Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob], "converted.jpg", { type: 'image/jpeg' });
      } catch (error) {
        console.error("HEIC conversion failed", error);
      }
    }

    const compressedFile = await resizeImage(file);
    setPreviewUrl(URL.createObjectURL(compressedFile)); 
    
    try {
      const imageFormData = new FormData();
      imageFormData.append('image', compressedFile);
      const response = await fetch(`${API_BASE_URL}/api/analyze`, { method: 'POST', body: imageFormData });
      const data = await response.json();
      
      if (response.ok) {
        let insightsText = '';
        if (data.analyzedData.aiInsightsArray && Array.isArray(data.analyzedData.aiInsightsArray)) {
            insightsText = '• ' + data.analyzedData.aiInsightsArray.join('\n\n• ');
        }
        
        setFormData(prev => ({ 
            ...prev, 
            ...data.analyzedData, 
            imageUrl: data.imageUrl,
            aiInsights: insightsText
        }));
      }
    } catch (error) { 
        alert('השרת מתעורר או שיש שגיאת תקשורת. נסה שוב בעוד כמה שניות.'); 
    } finally { 
        setIsAnalyzing(false); 
    }
  };

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
        
        // מעדכן את הלשונית והסינון בהתאם לסטטוס ששמרנו הרגע
        const newTab = formData.bottleStatus === 'stored' ? 'stored' : 'drank';
        setCellarTab(newTab);
        setSortOption(newTab === 'stored' ? 'dateOpened_desc' : 'dateDrank_desc');
        
        setFormData(initialFormState);
        setPreviewUrl(null);
        fetchWines(); 
        setCurrentView('cellar'); 
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) { alert('שגיאה בשמירה.'); } finally { setIsSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('האם למחוק את היין מהמרתף? פעולה זו בלתי הפיכה.')) return;
    try {
      await fetch(`${API_BASE_URL}/api/wines/${id}`, { method: 'DELETE' });
      fetchWines();
    } catch (error) { alert('שגיאה במחיקה.'); }
  };

  const startEdit = (wine) => {
    setEditingId(wine._id);
    setFormData({ ...initialFormState, ...wine, bottleStatus: wine.bottleStatus || 'drank' });
    setPreviewUrl(wine.imageUrl);
    setCurrentView('scan'); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatPerfectDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getWineTypeStyle = (type) => {
    switch(type) {
      case 'אדום': return { color: '#722F37', backgroundColor: '#FDF7F7' }; 
      case 'לבן': return { color: '#8A7A40', backgroundColor: '#FDFDF2' }; 
      case 'כתום': return { color: '#B35A22', backgroundColor: '#FEF8F3' }; 
      case 'רוזה': return { color: '#B06D7B', backgroundColor: '#FDF6F8' }; 
      default: return { color: '#5A5A5A', backgroundColor: '#F9F9F9' };
    }
  };

  const getCountryFlag = (country) => {
    if (!country) return '';
    const name = country.toLowerCase().trim();
    if (name.includes('ישראל')) return '🇮🇱';
    if (name.includes('צרפת')) return '🇫🇷';
    if (name.includes('איטליה')) return '🇮🇹';
    if (name.includes('ספרד')) return '🇪🇸';
    if (name.includes('גאורגיה') || name.includes('גורגיה')) return '🇬🇪';
    if (name.includes('ארגנטינה')) return '🇦🇷';
    if (name.includes('צ\'ילה') || name.includes('צילה')) return '🇨🇱';
    if (name.includes('ארצות הברית') || name.includes('ארה"ב') || name.includes('ארה״ב')) return '🇺🇸';
    if (name.includes('גרמניה')) return '🇩🇪';
    if (name.includes('דרום אפריקה')) return '🇿🇦';
    if (name.includes('ניו זילנד') || name.includes('ניו-זילנד')) return '🇳🇿';
    if (name.includes('אוסטרליה')) return '🇦🇺';
    if (name.includes('פורטוגל')) return '🇵🇹';
    if (name.includes('יוון')) return '🇬🇷';
    if (name.includes('אוסטריה')) return '🇦🇹';
    return '';
  };

  const uniqueCountries = ['הכל', ...new Set(winesList.map(w => w.country).filter(c => c && c.trim() !== ''))].sort();

  const calculateStats = () => {
    if (winesList.length === 0) return null;

    const drankWines = winesList.filter(w => w.bottleStatus !== 'stored');
    const storedWines = winesList.filter(w => w.bottleStatus === 'stored');

    const getMode = (arr) => {
      const counts = arr.reduce((acc, val) => { if(val && val.trim() !== '') acc[val] = (acc[val] || 0) + 1; return acc; }, {});
      return Object.keys(counts).length ? Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b) : '-';
    };

    const validRatings = drankWines.filter(w => w.rating).map(w => Number(w.rating));
    const avgRating = validRatings.length ? (validRatings.reduce((a,b)=>a+b,0) / validRatings.length).toFixed(1) : '-';

    const validPrices = winesList.filter(w => w.price).map(w => Number(w.price));
    const avgPrice = validPrices.length ? Math.round(validPrices.reduce((a,b)=>a+b,0) / validPrices.length) : '-';

    const favoriteType = getMode(drankWines.map(w => w.wineType));

    const locationCounts = drankWines.reduce((acc, w) => {
      if(w.location && w.location.trim() !== '') acc[w.location] = (acc[w.location] || 0) + 1;
      return acc;
    }, {});
    const topLocations = Object.keys(locationCounts)
      .map(loc => ({ name: loc, count: locationCounts[loc] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const topLocation = topLocations.length > 0 ? topLocations[0].name : '-';

    const countryCounts = winesList.reduce((acc, w) => {
      if(w.country && w.country.trim() !== '') acc[w.country] = (acc[w.country] || 0) + 1;
      return acc;
    }, {});
    const topCountriesVolume = Object.keys(countryCounts)
      .map(c => ({ name: c, count: countryCounts[c] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topCountry = topCountriesVolume.length > 0 ? topCountriesVolume[0].name : '-';

    const bestWine = [...drankWines].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))[0];

    const countryRatings = {};
    drankWines.forEach(w => {
      if(w.country && w.rating) {
        if(!countryRatings[w.country]) countryRatings[w.country] = { sum: 0, count: 0 };
        countryRatings[w.country].sum += Number(w.rating);
        countryRatings[w.country].count += 1;
      }
    });
    const countryAverages = Object.keys(countryRatings).map(c => ({
      name: c,
      avg: (countryRatings[c].sum / countryRatings[c].count).toFixed(1),
      count: countryRatings[c].count
    })).sort((a,b) => b.avg - a.avg).slice(0, 5); 

    const monthCounts = {};
    drankWines.forEach(w => {
      const dateStr = w.dateDrank || w.dateOpened;
      if(dateStr) {
        const d = new Date(dateStr);
        if(!isNaN(d)) {
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`;
          monthCounts[key] = (monthCounts[key] || 0) + 1;
        }
      }
    });
    const sortedMonths = Object.keys(monthCounts).sort();
    const graphData = sortedMonths.map(m => {
      const [year, month] = m.split('-');
      const monthName = new Date(year, month - 1).toLocaleString('he-IL', { month: 'short' });
      return { name: `${monthName} ${year.substring(2)}`, בקבוקים: monthCounts[m] };
    });

    return { totalDrank: drankWines.length, totalStored: storedWines.length, avgRating, avgPrice, favoriteType, topLocations, topLocation, topCountriesVolume, topCountry, bestWine, countryAverages, graphData };
  };

  const stats = calculateStats();

  const getSortedAndFilteredWines = () => {
    let result = winesList.filter(wine => {
      const isCorrectTab = (cellarTab === 'stored' && wine.bottleStatus === 'stored') || (cellarTab === 'drank' && wine.bottleStatus !== 'stored');
      if (!isCorrectTab) return false;

      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        (wine.name && wine.name.toLowerCase().includes(term)) || 
        (wine.producer && wine.producer.toLowerCase().includes(term)) ||
        (wine.region && wine.region.toLowerCase().includes(term)) ||
        (wine.grapes && wine.grapes.toLowerCase().includes(term)) ||
        (wine.location && wine.location.toLowerCase().includes(term)) ||
        (wine.drankWith && wine.drankWith.toLowerCase().includes(term));
        
      const matchesType = filterType === 'הכל' || wine.wineType === filterType;
      const matchesCountry = filterCountry === 'הכל' || wine.country === filterCountry;
      
      return matchesSearch && matchesType && matchesCountry;
    });

    result.sort((a, b) => {
      switch (sortOption) {
        case 'dateOpened_desc':
          return new Date(b.dateOpened || 0) - new Date(a.dateOpened || 0);
        case 'dateOpened_asc':
          return new Date(a.dateOpened || 0) - new Date(b.dateOpened || 0);
        case 'dateDrank_desc':
          return new Date(b.dateDrank || 0) - new Date(a.dateDrank || 0);
        case 'rating_desc':
          return (Number(b.rating) || 0) - (Number(a.rating) || 0);
        case 'price_desc':
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        case 'country_asc':
          return (a.country || '').localeCompare(b.country || '', 'he');
        default:
          return 0;
      }
    });

    return result;
  };

  const sortedAndFilteredWines = getSortedAndFilteredWines();

  const modernStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600&family=Frank+Ruhl+Libre:wght@300;400;700&display=swap');

    body {
      background-color: #F4F2EE;
      color: #332F2C;
      font-family: 'Assistant', sans-serif;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }

    .serif-title { font-family: 'Frank Ruhl Libre', serif; }

    .nav-pill-container {
      display: flex;
      justify-content: center;
      position: sticky;
      top: 20px;
      z-index: 100;
      margin-bottom: 40px;
    }
    
    .nav-pill {
      display: flex;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(10px);
      border-radius: 50px;
      padding: 6px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
    }

    .nav-item {
      padding: 10px 25px;
      border-radius: 50px;
      cursor: pointer;
      font-weight: 600;
      font-size: 1.05rem;
      transition: all 0.3s ease;
      color: #7D736A;
    }

    .nav-item.active {
      background-color: #572C3A;
      color: #FFFFFF;
      box-shadow: 0 4px 15px rgba(87, 44, 58, 0.2);
    }

    .status-toggle {
      display: flex;
      background-color: #F8F7F5;
      border-radius: 50px;
      padding: 6px;
      margin-bottom: 25px;
      border: 1px solid #EAE6DF;
    }
    
    .status-option {
      flex: 1;
      text-align: center;
      padding: 12px;
      border-radius: 50px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s ease;
      color: #7D736A;
    }
    
    .status-option.active {
      background-color: #FFFFFF;
      color: #572C3A;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      border: 1px solid #EFECE6;
    }

    .soft-card {
      background-color: #FFFFFF;
      border-radius: 28px;
      box-shadow: 0 15px 35px rgba(0, 0, 0, 0.03);
      border: none;
      transition: all 0.4s ease;
      overflow: hidden;
    }

    .stat-card {
      background-color: #FDFBF7;
      border-radius: 24px;
      padding: 25px 15px;
      text-align: center;
      border: 1px solid #EFECE6;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      transition: all 0.3s ease;
    }

    .soft-input {
      padding: 16px 20px;
      border: none;
      border-radius: 20px;
      background-color: #F8F7F5;
      width: 100%;
      box-sizing: border-box;
      font-family: 'Assistant', sans-serif;
      font-size: 1rem;
      color: #332F2C;
      transition: all 0.3s ease;
      box-shadow: inset 0 2px 5px rgba(0,0,0,0.02);
    }
    
    .soft-input:focus {
      outline: none;
      background-color: #FFFFFF;
      box-shadow: 0 0 0 2px #D3C3B0, inset 0 2px 5px rgba(0,0,0,0.01);
    }

    .filter-panel {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-bottom: 40px;
      background-color: #FFFFFF;
      padding: 20px;
      border-radius: 24px;
      box-shadow: 0 5px 25px rgba(0,0,0,0.03);
      border: 1px solid #EFECE6;
    }
    
    .filter-select {
      flex: 1;
      min-width: 120px;
      border: 1px solid #EAE6DF;
      background-color: #F8F7F5;
      border-radius: 12px;
      padding: 12px;
      outline: none;
      font-size: 1rem;
      font-family: 'Assistant', sans-serif;
      color: #5A5A5A;
      cursor: pointer;
    }

    .btn-pill-primary {
      background-color: #572C3A;
      color: #FDFBF7;
      padding: 18px;
      border: none;
      border-radius: 50px;
      font-size: 1.15rem;
      font-family: 'Assistant', sans-serif;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .btn-pill-primary:hover:not(:disabled) {
      background-color: #3A1C24;
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(87, 44, 58, 0.25);
    }

    .btn-pill-outline {
      background-color: transparent;
      color: #572C3A;
      padding: 10px 20px;
      border: 2px solid #EAE6DF;
      border-radius: 50px;
      font-family: 'Assistant', sans-serif;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .btn-pill-outline:hover {
      border-color: #572C3A;
      background-color: #FDFBF7;
    }
    
    .recharts-tooltip-wrapper { direction: rtl; }
    
    .cellar-tabs {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-bottom: 30px;
      border-bottom: 2px solid #EFECE6;
    }
    
    .cellar-tab {
      padding: 10px 20px;
      font-size: 1.2rem;
      font-family: 'Frank Ruhl Libre', serif;
      color: #BCAFA4;
      cursor: pointer;
      position: relative;
      transition: color 0.3s;
    }
    
    .cellar-tab.active {
      color: #572C3A;
      font-weight: bold;
    }
    
    .cellar-tab.active::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      width: 100%;
      height: 2px;
      background-color: #572C3A;
    }

    .rtl-textarea {
      direction: rtl;
      text-align: right;
      unicode-bidi: plaintext;
    }
  `;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px', direction: 'rtl' }}>
      <style>{modernStyles}</style>
      
      <div style={{ textAlign: 'center', marginBottom: '20px', marginTop: '20px' }}>
        <h1 className="serif-title" style={{ color: '#572C3A', fontSize: '2.5rem', margin: '0 0 5px 0' }}>מרתף היין</h1>
        <p className="serif-title" style={{ color: '#B49A65', fontSize: '1.2rem', margin: 0, fontStyle: 'italic' }}>של עילי וגילי</p>
      </div>

      <div className="nav-pill-container">
        <div className="nav-pill">
          <div className={`nav-item ${currentView === 'scan' ? 'active' : ''}`} onClick={() => setCurrentView('scan')}>
            {editingId ? 'עריכה פעילה' : 'סריקת יין'}
          </div>
          <div className={`nav-item ${currentView === 'cellar' ? 'active' : ''}`} onClick={() => setCurrentView('cellar')}>
            המרתף שלנו
          </div>
          <div className={`nav-item ${currentView === 'stats' ? 'active' : ''}`} onClick={() => setCurrentView('stats')}>
            סטטיסטיקות
          </div>
        </div>
      </div>

      {currentView === 'scan' && (
        <div style={{ animation: 'fadeIn 0.5s ease' }}>
          
          <div className="soft-card" style={{ padding: '40px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
              
              <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                {previewUrl && <img src={previewUrl} style={{ width: '100%', maxHeight: '350px', objectFit: 'contain', marginBottom: '20px', borderRadius: '20px', backgroundColor: '#F8F7F5', padding: '10px' }} />}
                <label className="btn-pill-primary" style={{ display: 'inline-block', padding: '15px 35px', boxShadow: '0 8px 20px rgba(87, 44, 58, 0.2)' }}>
                  {previewUrl ? 'צילום מחדש' : 'סריקת תווית חדשה'}
                  <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} style={{ display: 'none' }} />
                </label>
                {isAnalyzing && <p style={{ color: '#B49A65', fontSize: '1.1rem', marginTop: '20px', fontWeight: '600', animation: 'pulse 1.5s infinite' }}>מפענח את התווית...</p>}
              </div>

              <div>
                <label style={labelStyle}>סטטוס הבקבוק</label>
                <div className="status-toggle">
                  <div 
                    className={`status-option ${formData.bottleStatus === 'drank' ? 'active' : ''}`}
                    onClick={() => handleStatusChange('drank')}
                  >
                    נפתח ונשתה
                  </div>
                  <div 
                    className={`status-option ${formData.bottleStatus === 'stored' ? 'active' : ''}`}
                    onClick={() => handleStatusChange('stored')}
                  >
                    שמור באוסף
                  </div>
                </div>
              </div>

              <div>
                <label style={labelStyle}>שם היין</label>
                <input className="soft-input" name="name" value={formData.name} onChange={handleChange} required />
              </div>

              <div>
                <label style={labelStyle}>יצרן / Domaine</label>
                <input className="soft-input" name="producer" value={formData.producer} onChange={handleChange} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div><label style={labelStyle}>מדינה</label><input className="soft-input" name="country" value={formData.country} onChange={handleChange} /></div>
                <div><label style={labelStyle}>אזור</label><input className="soft-input" name="region" value={formData.region} onChange={handleChange} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div><label style={labelStyle}>זני ענבים</label><input className="soft-input" name="grapes" value={formData.grapes} onChange={handleChange} /></div>
                <div><label style={labelStyle}>שנת בציר</label><input className="soft-input" type="number" name="vintage" value={formData.vintage} onChange={handleChange} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', backgroundColor: '#F8F7F5', padding: '20px', borderRadius: '24px' }}>
                <div>
                  <label style={labelStyle}>סוג יין</label>
                  <select className="soft-input" name="wineType" value={formData.wineType} onChange={handleChange} style={{ backgroundColor: '#fff' }}>
                    <option value="אדום">אדום</option>
                    <option value="לבן">לבן</option>
                    <option value="כתום">כתום</option>
                    <option value="רוזה">רוזה</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '28px' }}>
                  <input type="checkbox" name="isNatural" checked={formData.isNatural} onChange={handleChange} style={{ width: '22px', height: '22px', accentColor: '#572C3A' }} />
                  <label style={{ color: '#332F2C', fontWeight: '600', fontSize: '1.1rem' }}>יין טבעי</label>
                </div>
              </div>

              <div style={{ marginTop: '10px' }}>
                <label style={{...labelStyle, color: '#B49A65', fontWeight: 'bold'}} className="serif-title">הסומלייה הדיגיטלי</label>
                <textarea className="soft-input rtl-textarea" name="aiInsights" value={formData.aiInsights} onChange={handleChange} style={{ minHeight: '180px', lineHeight: '1.6', backgroundColor: '#FFFFFF', border: '1px solid #EAE6DF' }} />
              </div>

              {formData.bottleStatus === 'drank' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', animation: 'fadeIn 0.4s ease' }}>
                  <div style={{ height: '1px', backgroundColor: '#EFECE6', margin: '10px 0' }}></div>
                  
                  <div>
                    <label style={labelStyle}>תאריך טעימה</label>
                    <input className="soft-input" type="date" name="dateDrank" value={formData.dateDrank || ''} onChange={handleChange} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div><label style={labelStyle}>ציון אישי (1-5)</label><input className="soft-input" type="number" step="0.1" name="rating" value={formData.rating} onChange={handleChange} /></div>
                    <div><label style={labelStyle}>מחיר (₪)</label><input className="soft-input" type="number" name="price" value={formData.price} onChange={handleChange} /></div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div><label style={labelStyle}>מיקום הטעימה</label><input className="soft-input" name="location" value={formData.location} onChange={handleChange} /></div>
                    <div><label style={labelStyle}>שותפים לטעימה</label><input className="soft-input" name="drankWith" value={formData.drankWith} onChange={handleChange} /></div>
                  </div>

                  <div>
                    <label style={labelStyle}>רשמי טעימה</label>
                    <textarea className="soft-input rtl-textarea" name="tastingNotes" value={formData.tastingNotes} onChange={handleChange} style={{ minHeight: '100px' }} />
                  </div>

                  <div>
                    <label style={labelStyle}>זיכרון מהחוויה</label>
                    <textarea className="soft-input rtl-textarea" name="memory" value={formData.memory} onChange={handleChange} style={{ minHeight: '100px' }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                <button className="btn-pill-primary" type="submit" disabled={isSaving || isAnalyzing} style={{ flex: 3 }}>
                  {isSaving ? 'שומר...' : (editingId ? 'עדכון הרשומה' : 'הוספה למערכת')}
                </button>
                {editingId && (
                  <button className="btn-pill-outline" type="button" onClick={() => {setEditingId(null); setFormData(initialFormState); setPreviewUrl(null); setCurrentView('cellar');}} style={{ flex: 1 }}>
                    ביטול
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {currentView === 'cellar' && (
        <div style={{ animation: 'fadeIn 0.5s ease' }}>
          
          <div className="cellar-tabs">
            <div 
              className={`cellar-tab ${cellarTab === 'drank' ? 'active' : ''}`}
              onClick={() => {
                setCellarTab('drank');
                setSortOption('dateDrank_desc'); // החלפת סינון אוטומטית לתאריך טעימה
              }}
            >
              היסטוריית טעימות ({stats ? stats.totalDrank : 0})
            </div>
            <div 
              className={`cellar-tab ${cellarTab === 'stored' ? 'active' : ''}`}
              onClick={() => {
                setCellarTab('stored');
                setSortOption('dateOpened_desc'); // החלפת סינון אוטומטית לתאריך הוספה
              }}
            >
              האוסף הפרטי ({stats ? stats.totalStored : 0})
            </div>
          </div>

          <div className="filter-panel">
            <input 
              type="text" 
              placeholder="חיפוש חופשי..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: '1 1 200px', border: '1px solid #EAE6DF', backgroundColor: '#F8F7F5', outline: 'none', fontSize: '1rem', fontFamily: 'Assistant', padding: '12px', borderRadius: '12px' }}
            />
            
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-select"
            >
              <option value="הכל">כל הסוגים</option>
              <option value="אדום">אדום</option>
              <option value="לבן">לבן</option>
              <option value="כתום">כתום</option>
              <option value="רוזה">רוזה</option>
            </select>

            <select 
              value={filterCountry} 
              onChange={(e) => setFilterCountry(e.target.value)}
              className="filter-select"
            >
              {uniqueCountries.map(country => (
                <option key={country} value={country}>{country === 'הכל' ? 'כל המדינות' : country}</option>
              ))}
            </select>

            <select 
              value={sortOption} 
              onChange={(e) => setSortOption(e.target.value)}
              className="filter-select"
            >
              <option value="dateOpened_desc">תאריך הוספה (חדש לישן)</option>
              <option value="dateOpened_asc">תאריך הוספה (ישן לחדש)</option>
              {cellarTab === 'drank' && <option value="dateDrank_desc">תאריך טעימה (מהחדש לישן)</option>}
              {cellarTab === 'drank' && <option value="rating_desc">ציון (מהגבוה לנמוך)</option>}
              <option value="price_desc">מחיר (מהיקר לזול)</option>
              <option value="country_asc">לפי מדינה (א-ת)</option>
            </select>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '35px' }}>
            {sortedAndFilteredWines.map((wine) => {
              const typeStyle = getWineTypeStyle(wine.wineType);
              return (
              <div key={wine._id} className="soft-card" style={{ display: 'flex', flexDirection: 'column' }}>
                
                <div style={{ padding: '20px', backgroundColor: '#F8F7F5', display: 'flex', justifyContent: 'center', position: 'relative' }}>
                  {wine.imageUrl ? (
                     <img src={wine.imageUrl} style={{ width: '100%', height: '280px', objectFit: 'contain', filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.1))' }} />
                  ) : (
                     <div style={{ width: '100%', height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#BCAFA4' }}>ללא תמונה</div>
                  )}
                  {wine.bottleStatus === 'stored' && (
                    <div style={{ position: 'absolute', top: '15px', right: '15px', backgroundColor: '#572C3A', color: 'white', padding: '5px 12px', borderRadius: '50px', fontSize: '0.85rem', fontWeight: 'bold' }}>שמור באוסף</div>
                  )}
                </div>
                
                <div style={{ padding: '30px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h3 className="serif-title" style={{ margin: '0', color: '#2B2624', fontSize: '1.6rem', lineHeight: '1.2' }}>{wine.name}</h3>
                    {wine.rating && wine.bottleStatus === 'drank' && <span style={{ color: '#B49A65', fontSize: '1.2rem', fontWeight: 'bold' }}>{wine.rating} ★</span>}
                  </div>
                  
                  <p style={{ color: '#7D736A', fontSize: '1rem', margin: '0 0 20px 0', letterSpacing: '0.5px' }}>
                    {getCountryFlag(wine.country)} {wine.producer} {wine.vintage ? `| ${wine.vintage}` : ''} 
                  </p>
                  
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '25px' }}>
                    <span style={{ ...typeStyle, padding: '6px 16px', borderRadius: '50px', fontSize: '0.9rem', fontWeight: '600' }}>{wine.wineType}</span>
                    {wine.isNatural && <span style={{ color: '#4A5D23', backgroundColor: '#F3F6EB', padding: '6px 16px', borderRadius: '50px', fontSize: '0.9rem', fontWeight: '600' }}>טבעי</span>}
                  </div>

                  {wine.bottleStatus === 'drank' && (
                    <div style={{ padding: '20px', backgroundColor: '#F8F7F5', borderRadius: '20px', marginBottom: '25px' }}>
                      {wine.dateDrank && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span style={{ color: '#9C898E', fontSize: '0.95rem' }}>תאריך:</span> <span style={{ fontWeight: '600' }}>{formatPerfectDate(wine.dateDrank)}</span></div>}
                      {wine.location && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span style={{ color: '#9C898E', fontSize: '0.95rem' }}>מקום:</span> <span style={{ fontWeight: '600' }}>{wine.location}</span></div>}
                      {wine.drankWith && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9C898E', fontSize: '0.95rem' }}>שותפים:</span> <span style={{ fontWeight: '600' }}>{wine.drankWith}</span></div>}
                    </div>
                  )}

                  {wine.aiInsights && (
                    <div style={{ marginBottom: '25px' }}>
                      <span className="serif-title" style={{ color: '#B49A65', fontSize: '1rem', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>הסומלייה הדיגיטלי</span>
                      <p className="rtl-textarea" style={{ margin: 0, fontSize: '1rem', lineHeight: '1.6', color: '#5A5A5A', whiteSpace: 'pre-wrap' }}>{wine.aiInsights}</p>
                    </div>
                  )}

                  {wine.bottleStatus === 'drank' && wine.tastingNotes && (
                    <div style={{ marginBottom: '20px' }}>
                      <span style={{ color: '#9C898E', fontSize: '0.9rem', display: 'block', marginBottom: '4px' }}>רשמים</span>
                      <p className="rtl-textarea" style={{ margin: 0, fontSize: '1rem', lineHeight: '1.5' }}>{wine.tastingNotes}</p>
                    </div>
                  )}

                  {wine.bottleStatus === 'drank' && wine.memory && (
                    <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#FDFBF7', borderRadius: '16px', border: '1px solid #EAE6DF' }}>
                      <span style={{ color: '#B49A65', fontSize: '0.9rem', display: 'block', marginBottom: '4px' }}>זיכרון</span>
                      <p className="rtl-textarea" style={{ margin: 0, fontSize: '1rem', lineHeight: '1.5', fontStyle: 'italic' }}>"{wine.memory}"</p>
                    </div>
                  )}

                  <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #EAE6DF' }}>
                    <div style={{ marginBottom: '15px', color: '#9C898E', fontSize: '0.85rem' }}>
                      נוסף למערכת: {formatPerfectDate(wine.dateOpened)}
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <button className="btn-pill-outline" onClick={() => startEdit(wine)} style={{ flex: 1 }}>{wine.bottleStatus === 'stored' ? 'פתיחת הבקבוק' : 'עריכה'}</button>
                      <button className="btn-pill-outline" onClick={() => handleDelete(wine._id)} style={{ flex: 1, color: '#A34E4E', borderColor: '#EAD8D9' }}>מחיקה</button>
                    </div>
                  </div>
                </div>
              </div>
            )})}
            {sortedAndFilteredWines.length === 0 && <p className="serif-title" style={{ color: '#BCAFA4', gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', fontSize: '1.5rem' }}>אין יינות בקטגוריה זו.</p>}
          </div>
        </div>
      )}

      {currentView === 'stats' && (
        <div style={{ animation: 'fadeIn 0.5s ease', display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {stats ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <div className="stat-card">
                  <span style={{ color: '#572C3A', fontSize: '3rem', fontWeight: 'bold', lineHeight: '1' }}>{stats.totalDrank}</span>
                  <span style={{ color: '#7D736A', fontSize: '1.1rem', marginTop: '10px' }}>נפתחו ונשתו</span>
                </div>
                <div className="stat-card">
                  <span style={{ color: '#B49A65', fontSize: '3rem', fontWeight: 'bold', lineHeight: '1' }}>{stats.totalStored}</span>
                  <span style={{ color: '#7D736A', fontSize: '1.1rem', marginTop: '10px' }}>שוכבים באוסף</span>
                </div>
                <div className="stat-card">
                  <span style={{ color: '#572C3A', fontSize: '2.5rem', fontWeight: 'bold', lineHeight: '1' }}>{stats.favoriteType || '-'}</span>
                  <span style={{ color: '#7D736A', fontSize: '1.1rem', marginTop: '10px' }}>הסוג המועדף</span>
                </div>
                <div className="stat-card">
                  <span style={{ color: '#B49A65', fontSize: '2.5rem', fontWeight: 'bold', lineHeight: '1' }}>₪{stats.avgPrice}</span>
                  <span style={{ color: '#7D736A', fontSize: '1.1rem', marginTop: '10px' }}>מחיר ממוצע</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                <div className="soft-card" style={{ padding: '25px', textAlign: 'center', border: '1px solid #EFECE6' }}>
                  <p style={{ margin: '0 0 5px 0', color: '#7D736A', fontSize: '1.1rem' }}>המדינה המובילה באוסף</p>
                  <p className="serif-title" style={{ margin: 0, fontSize: '1.8rem', color: '#572C3A', fontWeight: 'bold' }}>
                    {getCountryFlag(stats.topCountry)} {stats.topCountry || 'טרם עודכן'}
                  </p>
                </div>
                <div className="soft-card" style={{ padding: '25px', textAlign: 'center', border: '1px solid #EFECE6' }}>
                  <p style={{ margin: '0 0 5px 0', color: '#7D736A', fontSize: '1.1rem' }}>המקום הפופולרי ביותר לשתייה</p>
                  <p className="serif-title" style={{ margin: 0, fontSize: '1.8rem', color: '#572C3A', fontWeight: 'bold' }}>{stats.topLocation || 'טרם עודכן'}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
                <div className="soft-card" style={{ padding: '30px', border: '1px solid #EFECE6' }}>
                  <div style={{ textAlign: 'center', marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px solid #EAE6DF' }}>
                    <span style={{ color: '#7D736A', fontSize: '1.1rem', display: 'block', marginBottom: '5px' }}>ממוצע הציונים הכללי</span>
                    <span style={{ color: '#B49A65', fontSize: '3.5rem', fontWeight: 'bold', lineHeight: '1' }}>{stats.avgRating} <span style={{ fontSize: '1.5rem' }}>★</span></span>
                  </div>
                  
                  <h3 className="serif-title" style={{ margin: '0 0 20px 0', fontSize: '1.5rem', color: '#572C3A', textAlign: 'center' }}>ממוצע לפי מדינה</h3>
                  
                  {stats.countryAverages.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {stats.countryAverages.map((country, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #EFECE6', paddingBottom: '10px' }}>
                          <span style={{ fontSize: '1.2rem', fontWeight: '600', color: '#332F2C' }}>
                            {getCountryFlag(country.name)} {country.name}
                          </span>
                          <div style={{ textAlign: 'left' }}>
                            <span style={{ color: '#B49A65', fontWeight: 'bold', fontSize: '1.2rem' }}>{country.avg} ★</span>
                            <span style={{ color: '#9C898E', fontSize: '0.9rem', display: 'block' }}>מתוך {country.count} יינות</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#7D736A', textAlign: 'center' }}>חסרים נתוני דירוג.</p>
                  )}
                </div>

                <div className="soft-card" style={{ padding: '30px', border: '1px solid #EFECE6' }}>
                  <h3 className="serif-title" style={{ margin: '0 0 20px 0', fontSize: '1.5rem', color: '#572C3A', textAlign: 'center' }}>כמות יינות לפי מדינה</h3>
                  {stats.topCountriesVolume && stats.topCountriesVolume.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {stats.topCountriesVolume.map((country, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #EFECE6', paddingBottom: '10px' }}>
                          <span style={{ fontSize: '1.2rem', fontWeight: '600', color: '#332F2C' }}>
                            {getCountryFlag(country.name)} {country.name}
                          </span>
                          <div style={{ textAlign: 'left' }}>
                            <span style={{ color: '#B49A65', fontWeight: 'bold', fontSize: '1.2rem' }}>{country.count}</span>
                            <span style={{ color: '#9C898E', fontSize: '0.9rem', display: 'inline-block', marginRight: '5px' }}>יינות</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ textAlign: 'center', color: '#7D736A' }}>טרם עודכן</p>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
                {stats.bestWine ? (
                  <div className="soft-card" style={{ padding: '30px', backgroundColor: '#FDFBF7', border: '1px solid #EFECE6', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <h3 className="serif-title" style={{ color: '#572C3A', margin: '0 0 20px 0', fontSize: '1.5rem', textAlign: 'center' }}>🏆 יין הדגל</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      {stats.bestWine.imageUrl && <img src={stats.bestWine.imageUrl} style={{ height: '140px', width: '90px', objectFit: 'cover', borderRadius: '12px', border: '1px solid #EAE6DF', boxShadow: '0 5px 15px rgba(0,0,0,0.05)' }} />}
                      <div>
                        <h4 className="serif-title" style={{ margin: '0 0 5px 0', fontSize: '1.3rem', color: '#332F2C', lineHeight: '1.2' }}>{stats.bestWine.name}</h4>
                        <p style={{ margin: '0 0 15px 0', color: '#7D736A', fontSize: '0.95rem' }}>{getCountryFlag(stats.bestWine.country)} {stats.bestWine.producer} {stats.bestWine.vintage ? `| ${stats.bestWine.vintage}` : ''}</p>
                        <span style={{ backgroundColor: '#572C3A', color: 'white', padding: '6px 16px', borderRadius: '50px', fontWeight: 'bold', fontSize: '1rem' }}>ציון: {stats.bestWine.rating} ★</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="soft-card" style={{ padding: '30px', backgroundColor: '#FDFBF7', border: '1px solid #EFECE6', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                     <h3 className="serif-title" style={{ color: '#572C3A', margin: '0 0 10px 0', fontSize: '1.5rem', textAlign: 'center' }}>🏆 יין הדגל</h3>
                     <p style={{ color: '#7D736A' }}>דרגו יינות כדי לראות את יין הדגל.</p>
                  </div>
                )}

                <div className="soft-card" style={{ padding: '30px', border: '1px solid #EFECE6' }}>
                  <h3 className="serif-title" style={{ margin: '0 0 20px 0', fontSize: '1.5rem', color: '#572C3A', textAlign: 'center' }}>המקומות הפופולריים ביותר</h3>
                  {stats.topLocations && stats.topLocations.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {stats.topLocations.map((loc, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #EFECE6', paddingBottom: '10px' }}>
                          <span style={{ fontSize: '1.2rem', fontWeight: '600', color: '#332F2C' }}>{loc.name}</span>
                          <div style={{ textAlign: 'left' }}>
                            <span style={{ color: '#B49A65', fontWeight: 'bold', fontSize: '1.2rem' }}>{loc.count}</span>
                            <span style={{ color: '#9C898E', fontSize: '0.9rem', display: 'inline-block', marginRight: '5px' }}>יינות</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ textAlign: 'center', color: '#7D736A' }}>טרם עודכן</p>
                  )}
                </div>
              </div>

              {stats.graphData && stats.graphData.length > 0 && (
                <div className="soft-card" style={{ padding: '30px', backgroundColor: '#FFFFFF', border: '1px solid #EFECE6' }}>
                  <h3 className="serif-title" style={{ margin: '0 0 25px 0', fontSize: '1.5rem', color: '#572C3A', textAlign: 'center' }}>היסטוריית בקבוקים שנפתחו (לפי חודש)</h3>
                  <div style={{ width: '100%', height: '250px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.graphData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EAE6DF" vertical={false} />
                        <XAxis dataKey="name" stroke="#7D736A" tick={{ fill: '#7D736A', fontSize: 12, fontFamily: 'Assistant' }} axisLine={false} tickLine={false} />
                        <YAxis stroke="#7D736A" tick={{ fill: '#7D736A', fontSize: 12, fontFamily: 'Assistant' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#FDFBF7', border: '1px solid #EAE6DF', borderRadius: '8px', color: '#332F2C', direction: 'rtl', fontFamily: 'Assistant' }}
                          itemStyle={{ color: '#572C3A', fontWeight: 'bold' }}
                        />
                        <Line type="monotone" dataKey="בקבוקים" stroke="#572C3A" strokeWidth={3} dot={{ r: 5, fill: '#572C3A', stroke: '#FFFFFF', strokeWidth: 2 }} activeDot={{ r: 7, fill: '#B49A65', stroke: '#FFFFFF' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="soft-card" style={{ padding: '60px', textAlign: 'center' }}>
              <p className="serif-title" style={{ color: '#BCAFA4', fontSize: '1.5rem', margin: 0 }}>המרתף עדיין ריק.</p>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

const labelStyle = { fontSize: '0.9rem', color: '#7D736A', marginBottom: '8px', display: 'block', fontWeight: '600' };

export default App