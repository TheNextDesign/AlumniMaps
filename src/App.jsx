import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Routes, Route } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMapEvents, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Search, GraduationCap, Briefcase, Phone, Menu, X, Plus, School, LocateFixed, ChevronDown, ChevronUp } from 'lucide-react';
import './index.css';
import indianSchools from './indian_institutes.json'; // Import the list
import { supabase } from './supabaseClient'; // Import Supabase Client
import Toast from './Toast'; // New Toast Component
import { Analytics } from '@vercel/analytics/react';

// URL Helper Functions
const slugify = (text) => {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w-]+/g, '')     // Remove all non-word chars
    .replace(/--+/g, '-');    // Replace multiple - with single -
};

const findSchoolBySlug = (slug) => {
  if (!slug) return null;
  return indianSchools.find(s => {
    if (s.startsWith('---')) return false; // Skip category headers
    return slugify(s) === slug;
  });
};

// Fix for default Leaflet marker icons in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom component to handle map clicks
function MapEvents({ onMapClick, closeOverlays }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng);
      if (closeOverlays) closeOverlays();
    },
  });
  return null;
}

// Component to handle map movements
function MapController({ center }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (center) {
      map.flyTo(center, 12, { duration: 2 });
    }
  }, [center, map]);
  return null;
}

function App() {
  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(true);

  // Toast State
  const [toasts, setToasts] = useState([]);
  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Routing hooks
  const { schoolSlug } = useParams();
  const navigate = useNavigate();

  // School Selection State
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [schoolInput, setSchoolInput] = useState(''); // Search within map
  const [filterSchool, setFilterSchool] = useState('');

  // Sync state with URL
  useEffect(() => {
    if (schoolSlug) {
      const school = findSchoolBySlug(schoolSlug);
      if (school) {
        setSelectedSchool(school);
        setFilterSchool(school);
        setSchoolInput(school);
      } else {
        // Fallback for invalid slugs
        showToast("School map not found.", "error");
        navigate('/', { replace: true });
      }
    } else {
      setSelectedSchool(null);
      setFilterSchool('');
      setSchoolInput('');
    }
  }, [schoolSlug, navigate]);

  // Near Me State
  const [nearMeActive, setNearMeActive] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  const [filterCity, setFilterCity] = useState('');
  const [flyToLocation, setFlyToLocation] = useState(null); // { lat, lng }
  const [searchLocation, setSearchLocation] = useState(null); // [lat, lng] for filtering

  // Add Pin Mode State
  const [addStep, setAddStep] = useState(0); // 0=Closed, 1=Pre-Form, 2=Pick-Location, 3=Details-Form
  const [newPinLoc, setNewPinLoc] = useState(null);
  const [formMinimized, setFormMinimized] = useState(false); // Track if form is minimized

  // Avatar Upload State
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  // Form Data
  const [formData, setFormData] = useState({
    full_name: '',
    school_name: '',
    batch_year: '',
    profession: '',
    company: '',
    city: '',
    contact_info: '',
    mobile_number: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  const filteredSchoolsList = useMemo(() => {
    if (!formData.school_name) return [];
    const query = formData.school_name.toLowerCase();
    return indianSchools
      .filter(s => s.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query);
        const bStarts = b.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 50);
  }, [formData.school_name]);

  // Top Bar Search State
  const [showSchoolSearchDropdown, setShowSchoolSearchDropdown] = useState(false);
  // OPTIMIZATION: Memoize filtered list for Top Bar Search
  // Uses schoolInput (typing) instead of filterSchool (committed)
  const filteredSearchSchools = useMemo(() => {
    if (!schoolInput) return [];
    const query = schoolInput.toLowerCase();
    return indianSchools
      .filter(s => s.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query);
        const bStarts = b.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 50);
  }, [schoolInput]);

  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    fetchPins();
  }, []);

  const fetchPins = async () => {
    try {
      const { data, error } = await supabase
        .from('alumni_pins')
        .select('*');

      if (error) throw error;

      if (data) {
        setPins(data);
      }
    } catch (err) {
      console.error("Failed to fetch pins", err);
      showToast("Failed to fetch data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleMapClick = (latlng) => {
    // Only allow clicking if we are in Step 2 (Pick Location)
    if (addStep === 2) {
      setNewPinLoc(latlng);
      setAddStep(3); // Move to Details form
    }
  };

  // Handle avatar file selection
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      e.target.value = ''; // Clear the file input
      return;
    }

    // Validate file size (200KB = 204800 bytes)
    if (file.size > 204800) {
      showToast('Image must be less than 200KB', 'error');
      e.target.value = ''; // Clear the file input
      return;
    }

    setAvatarFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleStep1Submit = async (e) => {
    e.preventDefault();
    if (!formData.city) return showToast("Please enter your city.", "error");

    // Ensure school name is set from selectedSchool
    const finalFormData = { ...formData, school_name: selectedSchool };
    setFormData(finalFormData);

    // Fly to the city
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.city)}&accept-language=en&limit=1`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setFlyToLocation([parseFloat(lat), parseFloat(lon)]);
        setAddStep(2); // Move to Pick Location
      } else {
        showToast("City not found. Try a major city.", "error");
      }
    } catch (err) {
      console.error(err);
      // Even if fly fails, let them proceed? Maybe warn.
      setAddStep(2);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newPinLoc) return showToast("Location missing!", "error");

    setSubmitting(true);
    try {
      let avatarUrl = '';

      // Upload avatar if selected
      if (avatarFile) {
        console.log('Uploading avatar file:', avatarFile.name, 'Size:', avatarFile.size);
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        console.log('Generated filename:', fileName);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, avatarFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        console.log('Upload successful:', uploadData);

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);

        console.log('Public URL:', publicUrl);
        avatarUrl = publicUrl;
      } else {
        console.log('No avatar file selected');
      }

      const payload = {
        ...formData,
        latitude: newPinLoc.lat,
        longitude: newPinLoc.lng,
        avatar_url: avatarUrl
      };

      const { data, error } = await supabase
        .from('alumni_pins')
        .insert([payload])
        .select();

      if (error) throw error;

      if (data) {
        setPins([data[0], ...pins]);

        // Reset Everything
        setAddStep(0);
        setNewPinLoc(null);
        setAvatarFile(null);
        setAvatarPreview(null);
        setFormData({
          full_name: '', school_name: '', batch_year: '', profession: '', company: '', city: '', contact_info: '', mobile_number: ''
        });
        showToast("Pin added successfully!", "success");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to submit: " + err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };





  // Form City Suggestions
  const [formCitySuggestions, setFormCitySuggestions] = useState([]);

  // OPTIMIZATION: Debounce Form City Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      const value = formData.city;
      if (value && value.length > 2) {
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&accept-language=en&limit=5&email=alumni_map_student@example.com`);
          const data = await response.json();
          setFormCitySuggestions(data);
        } catch (err) { }
      } else {
        setFormCitySuggestions([]);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timer);
  }, [formData.city]);

  const handleFormCityChange = (e) => {
    setFormData({ ...formData, city: e.target.value });
    setShowSchoolDropdown(false);
  };

  // Search Suggestions Logic

  // OPTIMIZATION: Debounce Top Bar City Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      const value = filterCity;
      if (value && value.length > 2) {
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&accept-language=en&limit=5&email=alumni_map_student@example.com`);
          const data = await response.json();
          setSuggestions(data);
        } catch (err) { }
      } else {
        setSuggestions([]);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timer);
  }, [filterCity]);

  const handleCityChange = (e) => {
    const val = e.target.value;
    setFilterCity(val);
    if (!val.trim()) {
      setSearchLocation(null);
    }
  };

  const selectSuggestion = (s) => {
    const lat = parseFloat(s.lat);
    const lon = parseFloat(s.lon);
    setFilterCity(s.display_name.split(',')[0]);
    setFlyToLocation([lat, lon]);
    setSearchLocation([lat, lon]);
    setSuggestions([]);
  };

  const handleLocationSearch = async (e) => {
    if (e.key === 'Enter' && filterCity.trim()) {
      if (suggestions.length > 0) {
        selectSuggestion(suggestions[0]);
      } else {
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(filterCity)}&accept-language=en&limit=1`);
          const data = await response.json();
          if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            setFlyToLocation([lat, lon]);
            setSearchLocation([lat, lon]);
          }
        } catch (err) { }
      }
    }
  };

  // --- NEAR ME LOGIC ---
  const handleNearMe = () => {
    if (nearMeActive) {
      setNearMeActive(false);
      showToast("Near Me mode disabled", "info");
      return;
    }

    // Require school selection first
    if (!filterSchool.trim()) {
      return showToast("Please select a school first", "error");
    }

    if (!navigator.geolocation) {
      return showToast("Geolocation is not supported by your browser", "error");
    }

    showToast("Locating you...", "info");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setFlyToLocation([latitude, longitude]);
        setNearMeActive(true);
        showToast(`Showing ${filterSchool} alumni within 50km`, "success");
      },
      (error) => {
        showToast("Unable to retrieve your location", "error");
        console.error(error);
      }
    );
  };

  // Calculate Distance (Haversine Formula) in km
  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
  }

  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  // Filter logic for pins
  const filteredPins = pins.filter(p => {
    // School filter is ALWAYS required
    if (!filterSchool.trim()) return false;

    const schoolMatch = p.school_name.toLowerCase().includes(filterSchool.toLowerCase());

    // If a specific search location is set (via Enter or Suggestion), filter by distance (50km)
    if (searchLocation) {
      const dist = getDistanceFromLatLonInKm(searchLocation[0], searchLocation[1], p.latitude, p.longitude);
      return schoolMatch && dist <= 50;
    }

    // Otherwise use text-based city filter (or show all if search is empty)
    const cityMatch = p.city.toLowerCase().includes(filterCity.toLowerCase());

    // If Near Me is active, also apply proximity filter
    if (nearMeActive && userLocation) {
      const dist = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, p.latitude, p.longitude);
      return schoolMatch && cityMatch && dist <= 50;
    }

    // Standard filter: school + city
    return schoolMatch && cityMatch;
  });

  // Handle School selection on Welcome Screen
  const handleSelectSchool = (school) => {
    const slug = slugify(school);
    navigate(`/${slug}`);
  };

  // Switch School Helper
  const handleSwitchSchool = () => {
    navigate('/');
    setAddStep(0);
  };

  if (!selectedSchool) {
    return (
      <div className="welcome-screen">
        <div className="welcome-card glass-panel">
          <div className="welcome-header">
            <School size={48} className="welcome-icon" />
            <h1>LetsCatchUp</h1>
            <p>Connect with your fellow alumni across the globe</p>
          </div>

          <div className="welcome-search-group">
            <label>Search for your Institution</label>
            <div className="search-input-group">
              <Search size={20} className="icon" />
              <input
                type="text"
                placeholder="Ex. Sardar Patel Vidyalaya, Modern School..."
                value={schoolInput}
                onChange={(e) => {
                  setSchoolInput(e.target.value);
                  setShowSchoolSearchDropdown(true);
                }}
                onFocus={() => setShowSchoolSearchDropdown(true)}
              />
            </div>

            {showSchoolSearchDropdown && schoolInput && filteredSearchSchools.length > 0 && (
              <ul className="suggestions-list welcome-suggestions">
                {filteredSearchSchools.map((school, i) => (
                  <li key={i} onClick={() => handleSelectSchool(school)}>
                    <School size={16} className="icon-small" />
                    {school}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="welcome-footer">
            <p>Ready to reconnect? LetsCatchUp!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>

      {/* Top Left Branding */}
      <div className="top-bar">
        <div className="school-branding glass-panel no-click">
          <div className="branding-icon-container">
            <School size={20} />
          </div>
          <div className="branding-text">
            <h2>{selectedSchool}</h2>
            <p>LetsCatchUp Map</p>
          </div>
        </div>

        <div className="search-input-group" style={{ position: 'relative', display: 'none' }} onClick={e => e.stopPropagation()}>
          <Search size={18} className="icon" />
          <input
            type="text"
            placeholder="Search School/College..."
            value={schoolInput}
            onChange={e => {
              setSchoolInput(e.target.value);
              setFilterSchool(''); // Clear pins while typing new search
              setNearMeActive(false); // Disable near me if searching
              setShowSchoolSearchDropdown(true);
            }}
            onFocus={() => setShowSchoolSearchDropdown(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setFilterSchool(schoolInput); // Commit search on Enter
                setShowSchoolSearchDropdown(false);
              }
            }}
          />
          {showSchoolSearchDropdown && schoolInput && filteredSearchSchools.length > 0 && (
            <ul className="suggestions-list">
              {filteredSearchSchools.map((school, i) => (
                <li key={i} onClick={() => {
                  setSchoolInput(school);
                  setFilterSchool(school); // Commit search on click
                  setShowSchoolSearchDropdown(false);
                }}>
                  <School size={14} className="icon-small" />
                  {school}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="city-search-row">
          {/* Near Me Button */}
          <button
            className={`near-me-btn ${nearMeActive ? 'active' : ''}`}
            onClick={handleNearMe}
            title={nearMeActive ? "Exit Near Me" : "Show Alumni Near Me"}
          >
            <LocateFixed size={20} />
          </button>

          <div className="search-input-group" style={{ position: 'relative' }}>
            <MapPin size={18} className="icon" />
            <input
              type="text"
              placeholder="Search City..."
              value={filterCity}
              onChange={handleCityChange}
              onKeyDown={handleLocationSearch}
            />

            {/* Suggestions Dropdown */}
            {suggestions.length > 0 && (
              <ul className="suggestions-list">
                {suggestions.map((s) => (
                  <li key={s.place_id} onClick={() => selectSuggestion(s)}>
                    <MapPin className="icon-small" />
                    {s.display_name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Area (Add Pin Option) */}
      <div className="sidebar-container">
        {/* Toggle Button / FAB */}
        <button
          className={`sidebar-trigger-btn ${addStep > 0 ? 'active' : ''}`}
          onClick={() => {
            if (addStep > 0) {
              setAddStep(0);
              setNewPinLoc(null);
            } else {
              setFormData({ ...formData, school_name: selectedSchool, city: '' });
              setAddStep(1);
            }
          }}
          title={addStep > 0 ? "Cancel" : "Add Your Pin"}
        >
          {addStep > 0 ? <X size={32} /> : <Plus size={32} />}
        </button>

        {/* STEP 1: Pre-Fill School & City */}
        {addStep === 1 && (
          <div className="sidebar-panel">
            <div className="sidebar-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', width: '100%' }}>
                <div>
                  <h2>Step 1/2</h2>
                  <p>Where are you from?</p>
                </div>
                <button
                  onClick={() => setAddStep(0)}
                  className="btn-icon-close"
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <form className="add-pin-form" onSubmit={handleStep1Submit} onClick={() => { setFormCitySuggestions([]); }}>
              <div style={{ padding: '0 14px 10px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Adding pin for <strong>{selectedSchool}</strong>
              </div>

              {/* City Autocomplete */}
              <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                <MapPin size={14} className="icon-input-overlay" style={{ position: 'absolute', right: 10, top: 12, opacity: 0.5 }} />
                <input
                  name="city"
                  placeholder="Current City/Pincode"
                  required
                  value={formData.city}
                  onChange={(e) => {
                    handleFormCityChange(e);
                    setShowSchoolDropdown(false);
                  }}
                  onFocus={() => setShowSchoolDropdown(false)}
                  autoComplete="off"
                />
                {formCitySuggestions.length > 0 && (
                  <ul className="suggestions-list" style={{ maxHeight: '150px' }}>
                    {formCitySuggestions.map((s) => (
                      <li key={s.place_id} onClick={() => {
                        setFormData({ ...formData, city: s.display_name.split(',')[0] });
                        setFormCitySuggestions([]);
                      }}>
                        <MapPin size={14} className="icon-small" />
                        {s.display_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button type="submit" className="btn-submit">
                Next: Place Pin
              </button>
            </form>
          </div>
        )}

        {/* STEP 2: Pick Location Instruction */}
        {addStep === 2 && (
          <div className="pin-instruction-compact">
            <p>Tap your exact location on the map</p>
          </div>
        )}

        {/* STEP 3: Final Details Form */}
        {addStep === 3 && newPinLoc && (
          <div className={`sidebar-panel ${formMinimized ? 'minimized' : ''}`}>
            <div className="sidebar-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', width: '100%' }}>
                <div>
                  <h2>Final Step</h2>
                  {!formMinimized && <p>Tell us about yourself!</p>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setFormMinimized(!formMinimized)}
                    className="btn-icon-minimize"
                    title={formMinimized ? "Expand form" : "Minimize to adjust pin"}
                  >
                    {formMinimized ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  <button
                    onClick={() => {
                      setAddStep(0);
                      setNewPinLoc(null);
                      setFormMinimized(false);
                    }}
                    className="btn-icon-close"
                    title="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>

            {!formMinimized && (
              <form className="add-pin-form" onSubmit={handleSubmit}>
                <div className="row">
                  <input name="school_name" value={formData.school_name} disabled style={{ opacity: 0.7 }} />
                  <input name="city" value={formData.city} disabled style={{ opacity: 0.7 }} />
                </div>

                <input name="full_name" placeholder="Full Name" required onChange={handleInputChange} autoFocus />
                <input name="batch_year" placeholder="Batch Year (e.g. 2024)" type="number" onChange={handleInputChange} />
                <input name="profession" placeholder="Profession" onChange={handleInputChange} />
                <input name="company" placeholder="Company" onChange={handleInputChange} />
                <input name="mobile_number" placeholder="Mobile No. (for WhatsApp)" type="tel" onChange={handleInputChange} />

                {/* Avatar Upload */}
                <div style={{ marginTop: '10px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Profile Picture (Optional, max 200KB)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handleAvatarChange}
                    style={{
                      padding: '8px',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      width: '100%'
                    }}
                  />
                  {avatarPreview && (
                    <div style={{ marginTop: '10px', textAlign: 'center' }}>
                      <img
                        src={avatarPreview}
                        alt="Preview"
                        style={{
                          width: '80px',
                          height: '80px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '2px solid var(--accent)'
                        }}
                      />
                    </div>
                  )}
                </div>

                <input name="contact_info" placeholder="Email/LinkedIn (Optional)" onChange={handleInputChange} />

                <div className="form-actions">
                  <button type="submit" disabled={submitting} className="btn-submit">
                    {submitting ? "Pinning..." : "Confirm & Join Map"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Main Map */}
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        minZoom={3} // Prevent zooming out too far
        style={{ height: "100vh", width: "100%" }}
        zoomControl={false} // Custom zoom control position if needed, or default
      >
        <MapController center={flyToLocation} />

        {/* Google Maps Tiles - Colorful & Strictly English (hl=en) */}
        <TileLayer
          attribution='&copy; Google Maps'
          url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=en"
        />

        <MapEvents
          onMapClick={handleMapClick}
          closeOverlays={() => {
            setShowSchoolSearchDropdown(false);
            setSuggestions([]);
            // Also close sidebar form suggestions if open
            setShowSchoolDropdown(false);
            setFormCitySuggestions([]);
          }}
        />

        {/* Render Existing Pins */}
        {filteredPins.map(pin => {
          // Generate consistent color based on name
          const getAvatarColor = (name) => {
            const colors = [
              '#FFCB42', '#FF6B6B', '#4ECDC4', '#45B7D1',
              '#FFA07A', '#98D8C8', '#BB8FCE', '#85C1E2',
              '#F8B739', '#52B788'
            ];
            const charCode = name.charCodeAt(0) || 0;
            return colors[charCode % colors.length];
          };
          const avatarBgColor = getAvatarColor(pin.full_name);

          // Create custom icon with avatar
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: pin.avatar_url
              ? `<div class="marker-avatar-container">
                   <img src="${pin.avatar_url}" class="marker-avatar" alt="${pin.full_name}" />
                 </div>
                 <div class="marker-name-label">${pin.full_name}</div>`
              : `<div class="marker-avatar-placeholder" style="background-color: ${avatarBgColor}">${pin.full_name.charAt(0)}</div>
                 <div class="marker-name-label">${pin.full_name}</div>`,
            iconSize: [50, 80],
            iconAnchor: [25, 60],
            popupAnchor: [0, -60]
          });

          return (
            <Marker
              key={pin.id}
              position={[parseFloat(pin.latitude), parseFloat(pin.longitude)]}
              icon={customIcon}
            >
              <Popup>
                <div className="pin-popup">
                  <div className="popup-header" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    {pin.avatar_url ? (
                      <>
                        {console.log('Avatar URL:', pin.avatar_url)}
                        <img
                          src={pin.avatar_url}
                          alt={pin.full_name}
                          className="popup-avatar"
                          style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent)' }}
                          onError={(e) => {
                            console.error('Image failed to load:', pin.avatar_url);
                            e.target.style.display = 'none';
                          }}
                        />
                      </>
                    ) : (
                      <div className="popup-avatar-placeholder" style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        {pin.full_name.charAt(0)}
                      </div>
                    )}
                    <h3 style={{ margin: 0 }}>{pin.full_name}</h3>
                  </div>

                  <div className="tag">
                    <GraduationCap size={14} />
                    <span><strong>{pin.school_name}</strong> {pin.batch_year && `'${pin.batch_year.slice(-2)}`}</span>
                  </div>
                  <div className="tag">
                    <Briefcase size={14} />
                    <span>{pin.profession} {pin.company && `@ ${pin.company}`}</span>
                  </div>
                  <div className="tag">
                    <MapPin size={14} />
                    <span>{pin.city}</span>
                  </div>
                  {pin.contact_info && (
                    <div className="contact-info">
                      <Phone size={14} /> {pin.contact_info}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '10px' }}>
                    {/* Directions Button (Left) */}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${pin.latitude},${pin.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="directions-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        backgroundColor: '#3b82f6', // Blue
                        color: 'white',
                        padding: '6px 10px',
                        borderRadius: '15px',
                        textDecoration: 'none',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                      }}
                    >
                      <MapPin size={12} />
                      Directions
                    </a>

                    {/* WhatsApp Button (Right) */}
                    {pin.mobile_number && (
                      <a
                        href={`https://wa.me/${pin.mobile_number.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whatsapp-btn"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          backgroundColor: '#25D366',
                          color: 'white',
                          padding: '6px 12px',
                          borderRadius: '20px',
                          textDecoration: 'none',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          fill="currentColor"
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                        </svg>
                        Chat
                      </a>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Temporary Marker for New Pin - Draggable */}
        {newPinLoc && (
          <Marker
            position={newPinLoc}
            opacity={0.8}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const position = marker.getLatLng();
                setNewPinLoc([position.lat, position.lng]);
              }
            }}
          >
            <Popup>
              <div style={{ textAlign: 'center' }}>
                <strong>New Pin Location</strong>
                <p style={{ margin: '5px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Drag to adjust position
                </p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Stats Pill - Only show when searching */}
      {filterSchool.trim() && (
        <div className="stats-pill">
          {`Found ${filteredPins.length} Alumni`}
        </div>
      )}
      <Analytics />
    </div>
  );
}

export default App;
