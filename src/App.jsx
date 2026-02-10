import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, Routes, Route } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMapEvents, ZoomControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Search, GraduationCap, Briefcase, Phone, Menu, X, Plus, School, LocateFixed, ChevronDown, ChevronUp, Lock, Linkedin, Instagram, ArrowLeft, Mail, MessageCircle } from 'lucide-react';
import './index.css';
import indianSchools from './indian_institutes.json'; // Import the list
import { supabase } from './supabaseClient'; // Import Supabase Client
import Toast from './Toast'; // New Toast Component
import PoweredBy from './PoweredBy'; // PoweredBy Component
import { Analytics } from '@vercel/analytics/react';

// Custom WhatsApp Icon Component
const WhatsAppIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

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

// Custom cluster icon


// Custom component to handle map clicks
function MapEvents({ onMapClick, closeOverlays, setZoom }) {
  const map = useMapEvents({
    click: (e) => {
      onMapClick(e.latlng);
      if (closeOverlays) closeOverlays();
      map.closePopup();
    },
    dragstart: () => {
      map.closePopup();
      if (closeOverlays) closeOverlays();
    },
    movestart: () => {
      map.closePopup();
    },
    zoomend: () => {
      const currentZoom = map.getZoom();
      setZoom(currentZoom);
      if (currentZoom < 10) {
        map.closePopup();
      }

      // Direct DOM manipulation for reliable class toggling
      const mapContainer = map.getContainer();
      if (currentZoom >= 10) {
        mapContainer.classList.add('show-marker-labels');
      } else {
        mapContainer.classList.remove('show-marker-labels');
      }
    }
  });

  // Initial check on mount
  useEffect(() => {
    const mapContainer = map.getContainer();
    if (map.getZoom() >= 10) {
      mapContainer.classList.add('show-marker-labels');
    } else {
      mapContainer.classList.remove('show-marker-labels');
    }
  }, [map]);

  return null;
}

// Component to resolve City Name if only Pincode is present
function CityResolver({ city, lat, lon }) {
  const [displayCity, setDisplayCity] = useState(city);

  useEffect(() => {
    // Check if city is just a 4-6 digit number (Pincode)
    if (/^\d{4,6}$/.test(city)) {
      const fetchCity = async () => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=en`);
          const data = await res.json();
          if (data && data.address) {
            const cityName = data.address.city || data.address.town || data.address.village || data.address.county || data.address.state_district;
            if (cityName) {
              setDisplayCity(`${cityName} ${city}`); // Show City + Pincode
            }
          }
        } catch (err) {
          console.error("Failed to reverse geocode", err);
        }
      };
      fetchCity();
    } else {
      setDisplayCity(city);
    }
  }, [city, lat, lon]);

  return <span>{displayCity}</span>;
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
  const [zoomLevel, setZoomLevel] = useState(5); // Track map zoom


  // Toast State
  const [toasts, setToasts] = useState([]);
  const showToast = (message, type = 'info') => {
    setToasts(prev => {
      // Prevent duplicate messages
      if (prev.some(t => t.message === message)) return prev;
      const id = Date.now();
      return [...prev, { id, message, type }];
    });
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Routing hooks
  const { schoolSlug } = useParams();
  const navigate = useNavigate();

  // School Selection State
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [schoolLogo, setSchoolLogo] = useState("/letscatchup-logo.jpg");
  const [schoolInput, setSchoolInput] = useState(''); // Search within map
  const [filterSchool, setFilterSchool] = useState('');
  const [dbSchools, setDbSchools] = useState([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualSchoolName, setManualSchoolName] = useState('');
  const [manualSchoolLogo, setManualSchoolLogo] = useState(null);
  const [manualSchoolLogoPreview, setManualSchoolLogoPreview] = useState(null);

  // Consolidate schools
  const allSchools = useMemo(() => {
    const dbSchoolNames = dbSchools.map(s => s.name);
    return [...new Set([...indianSchools, ...dbSchoolNames])];
  }, [dbSchools]);

  // Auth State for / route
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);



  // Sync state with URL
  useEffect(() => {
    const syncSchool = async () => {
      if (schoolSlug) {
        // 1. Try hardcoded list
        const school = findSchoolBySlug(schoolSlug);
        if (school) {
          setSelectedSchool(school);
          setFilterSchool(school);
          setSchoolInput(school);

          // Hardcoded logos
          if (school === "Sardar Patel Vidyalaya, Lodi Estate") setSchoolLogo("/spv-logo.jpg");
          else if (school === "Indiana University Bloomington") setSchoolLogo("/iu-logo.png");
          else setSchoolLogo("/letscatchup-logo.jpg");
          return;
        }

        // 2. Try DB fetching
        try {
          const { data, error } = await supabase
            .from('schools')
            .select('*')
            .eq('slug', schoolSlug)
            .single();

          if (data) {
            setSelectedSchool(data.name);
            setFilterSchool(data.name);
            setSchoolInput(data.name);
            setSchoolLogo(data.logo_url || "/letscatchup-logo.jpg");
          } else {
            showToast("School map not found.", "error");
            navigate('/', { replace: true });
          }
        } catch (err) {
          console.error("Error fetching school:", err);
          navigate('/', { replace: true });
        }
      } else {
        setSelectedSchool(null);
        setFilterSchool('');
        setSchoolInput('');
        setSchoolLogo("/letscatchup-logo.jpg");
      }
    };

    syncSchool();
  }, [schoolSlug, navigate]);

  const isSPV = selectedSchool === "Sardar Patel Vidyalaya, Lodi Estate";
  const isIU = selectedSchool === "Indiana University Bloomington";

  // Near Me State
  const [nearMeActive, setNearMeActive] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  const [filterCity, setFilterCity] = useState('');
  const [filterBatchYear, setFilterBatchYear] = useState(''); // Batch year filter
  const [filterProfession, setFilterProfession] = useState(''); // Profession filter
  const [filterCompany, setFilterCompany] = useState(''); // Company filter
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false); // Toggle advanced filters panel
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
    mobile_number: '',
    linkedin_url: '',
    instagram_url: '',
    pincode: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  const filteredSchoolsList = useMemo(() => {
    if (!formData.school_name) return [];
    const query = formData.school_name.toLowerCase();
    return allSchools
      .filter(s => s.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query);
        const bStarts = b.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 50);
  }, [formData.school_name, allSchools]);

  // Top Bar Search State
  const [showSchoolSearchDropdown, setShowSchoolSearchDropdown] = useState(false);
  // OPTIMIZATION: Memoize filtered list for Top Bar Search
  // Uses schoolInput (typing) instead of filterSchool (committed)
  const filteredSearchSchools = useMemo(() => {
    if (!schoolInput) return [];
    const query = schoolInput.toLowerCase();
    return allSchools
      .filter(s => s.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query);
        const bStarts = b.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 50);
  }, [schoolInput, allSchools]);

  const createClusterCustomIcon = useCallback((cluster) => {
    return L.divIcon({
      html: `
        <div class="marker-pin cluster-pin">
          <div class="marker-inner is-logo">
            <img src="${schoolLogo}" alt="School Logo" />
          </div>
          <div class="cluster-badge">${cluster.getChildCount()}</div>
        </div>
      `,
      className: 'custom-marker cluster-marker',
      iconSize: [40, 58],
      iconAnchor: [20, 58]
    });
  }, [schoolLogo]);

  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    fetchPins();
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*');
      if (data) setDbSchools(data);
    } catch (err) {
      console.error("Error fetching schools list:", err);
    }
  };

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
      // Stay in Step 2, just show the pin and confirmation
    }
  };

  // Handle manual school logo selection
  const handleManualLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    if (file.size > 500 * 1024) { // 500KB limit
      showToast('Logo must be under 500KB', 'error');
      return;
    }

    setManualSchoolLogo(file);
    const reader = new FileReader();
    reader.onloadend = () => setManualSchoolLogoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleCreateManualSchool = async (e) => {
    e.preventDefault();
    if (!manualSchoolName.trim()) return showToast("Please enter school name", "error");

    setSubmitting(true);
    try {
      const slug = slugify(manualSchoolName);
      let logoUrl = "/letscatchup-logo.jpg";

      // Upload Logo if provided
      if (manualSchoolLogo) {
        const fileExt = manualSchoolLogo.name.split('.').pop();
        const fileName = `logo-${slug}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `school-logos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars') // Or a dedicated 'logos' bucket if exists
          .upload(filePath, manualSchoolLogo);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        logoUrl = publicUrl;
      }

      // Insert School
      const { data, error } = await supabase
        .from('schools')
        .insert([{
          name: manualSchoolName.trim(),
          slug,
          logo_url: logoUrl
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') throw new Error("This school already exists!");
        throw error;
      }

      showToast("School Map Generated!", "success");
      setDbSchools(prev => [...prev, data]);
      setShowManualEntry(false);
      setManualSchoolName('');
      setManualSchoolLogo(null);
      setManualSchoolLogoPreview(null);

      // Proactively set selected school and navigate
      setSelectedSchool(data.name);
      setFilterSchool(data.name);
      setSchoolInput(data.name);
      setSchoolLogo(data.logo_url || "/letscatchup-logo.jpg");
      navigate(`/${slug}`);

    } catch (err) {
      console.error("Manual creation error:", err);
      showToast(err.message || "Failed to create school map", "error");
    } finally {
      setSubmitting(false);
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
    let { name, value } = e.target;

    // Enforce numbers only for mobile_number
    if (name === 'mobile_number') {
      value = value.replace(/\D/g, '');
    }

    setFormData({ ...formData, [name]: value });
  };

  const handleStep1Submit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.full_name) return showToast("Please enter your full name.", "error");
    if (!formData.city) return showToast("Please enter your city.", "error");
    if (!formData.pincode) return showToast("Please enter your pincode.", "error");

    // Ensure school name is set from selectedSchool
    const finalFormData = { ...formData, school_name: selectedSchool };

    // Fly to the city/pincode
    try {
      // Try searching with city + pincode for better accuracy
      const searchQuery = formData.pincode ? `${formData.city} ${formData.pincode}` : formData.city;
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&addressdetails=1&accept-language=en&limit=1`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon, address, display_name } = data[0];
        setFlyToLocation([parseFloat(lat), parseFloat(lon)]);

        // Auto-update city name if we got better details (especially for pincodes)
        // Try to construct "City, State" or fallback to display_name
        let niceCityName = formData.city;
        if (address) {
          const cityComponent = address.city || address.town || address.village || address.county || address.state_district;
          const stateComponent = address.state;
          const postcode = address.postcode;

          if (cityComponent && stateComponent) {
            niceCityName = `${cityComponent}, ${stateComponent}${postcode ? ' ' + postcode : ''}`;
          } else {
            // Fallback to shorter display name (first 2 parts)
            niceCityName = display_name.split(',').slice(0, 2).join(',');
          }
        }

        setFormData({ ...finalFormData, city: niceCityName });
        setAddStep(2); // Move to Pick Location
        showToast("Now tap your exact location on the map", "info");
      } else {
        showToast("Location not found. Try a different city or pincode.", "error");
        setFormData(finalFormData);
      }
    } catch (err) {
      console.error(err);
      // Even if fly fails, let them proceed
      setFormData(finalFormData);
      setAddStep(2);
      showToast("Now tap your exact location on the map", "info");
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
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

      // Strip pincode as it's not in the database schema (used for search accuracy only)
      const { pincode, ...dbPayload } = formData;

      const payload = {
        ...dbPayload,
        batch_year: dbPayload.batch_year ? parseInt(dbPayload.batch_year) : null,
        latitude: parseFloat(newPinLoc.lat),
        longitude: parseFloat(newPinLoc.lng),
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
          full_name: '', school_name: '', batch_year: '', profession: '', company: '', city: '', contact_info: '', mobile_number: '', linkedin_url: '', instagram_url: '', pincode: ''
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
          // Search for cities with addressdetails
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&addressdetails=1&accept-language=en&limit=20&email=alumni_map_student@example.com`);
          const data = await response.json();

          const searchTerm = value.toLowerCase();

          // Filter and rank results
          const filteredData = data
            .filter(item => {
              const type = item.type;
              const addr = item.address;

              // Only include actual cities, towns, villages, or postcodes
              const isValidType = type === 'city' || type === 'town' || type === 'village' ||
                type === 'municipality' || type === 'postcode';

              // Must have a city/town/village in address
              const hasCity = addr?.city || addr?.town || addr?.village;

              return isValidType || hasCity;
            })
            .map(item => {
              const addr = item.address;
              const city = addr?.city || addr?.town || addr?.village || addr?.county;
              const state = addr?.state;
              const country = addr?.country;
              const postcode = addr?.postcode;

              // Calculate relevance score
              let score = 0;
              const cityLower = city?.toLowerCase() || '';
              const displayLower = item.display_name?.toLowerCase() || '';

              // Exact match gets highest score
              if (cityLower === searchTerm) score += 100;
              // Starts with search term
              else if (cityLower.startsWith(searchTerm)) score += 50;
              // Contains search term in city name
              else if (cityLower.includes(searchTerm)) score += 25;
              // Check if display name contains search term (for variations/typos)
              else if (displayLower.includes(searchTerm)) score += 15;

              // Prefer cities over towns/villages
              if (item.type === 'city') score += 10;
              else if (item.type === 'town') score += 5;

              // Format display name
              let displayName = item.display_name;
              if (city && state) {
                displayName = `${city}, ${state}`;
              } else if (city && country) {
                displayName = `${city}, ${country}`;
              } else if (postcode && city) {
                displayName = `${city}, ${postcode}`;
              }

              return { ...item, display_name: displayName, score, cityName: city };
            })
            .filter(item => item.score > 0) // Only show items with relevance
            .sort((a, b) => b.score - a.score) // Sort by relevance
            .slice(0, 8); // Top 8 results

          setFormCitySuggestions(filteredData);
        } catch (err) {
          console.error('Form city search error:', err);
        }
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
          // Search for cities with addressdetails
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&addressdetails=1&accept-language=en&limit=20&email=alumni_map_student@example.com`);
          const data = await response.json();

          const searchTerm = value.toLowerCase();

          // Filter and rank results
          const filteredData = data
            .filter(item => {
              const type = item.type;
              const addr = item.address;

              // Only include actual cities, towns, villages, or postcodes
              const isValidType = type === 'city' || type === 'town' || type === 'village' ||
                type === 'municipality' || type === 'postcode';

              // Must have a city/town/village in address
              const hasCity = addr?.city || addr?.town || addr?.village;

              return isValidType || hasCity;
            })
            .map(item => {
              const addr = item.address;
              const city = addr?.city || addr?.town || addr?.village || addr?.county;
              const state = addr?.state;
              const country = addr?.country;
              const postcode = addr?.postcode;

              // Calculate relevance score
              let score = 0;
              const cityLower = city?.toLowerCase() || '';
              const displayLower = item.display_name?.toLowerCase() || '';

              // Exact match gets highest score
              if (cityLower === searchTerm) score += 100;
              // Starts with search term
              else if (cityLower.startsWith(searchTerm)) score += 50;
              // Contains search term in city name
              else if (cityLower.includes(searchTerm)) score += 25;
              // Check if display name contains search term (for variations/typos)
              else if (displayLower.includes(searchTerm)) score += 15;

              // Prefer cities over towns/villages
              if (item.type === 'city') score += 10;
              else if (item.type === 'town') score += 5;

              // Format display name
              let displayName = item.display_name;
              if (city && state) {
                displayName = `${city}, ${state}`;
              } else if (city && country) {
                displayName = `${city}, ${country}`;
              } else if (postcode && city) {
                displayName = `${city}, ${postcode}`;
              }

              return { ...item, display_name: displayName, score, cityName: city };
            })
            .filter(item => item.score > 0) // Only show items with relevance
            .sort((a, b) => b.score - a.score) // Sort by relevance
            .slice(0, 8); // Top 8 results

          setSuggestions(filteredData);
        } catch (err) {
          console.error('City search error:', err);
        }
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
    // Use the formatted display name
    setFilterCity(s.display_name);
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

    // Batch year filter (optional, supports partial matching)
    const batchMatch = !filterBatchYear.trim() ||
      (p.batch_year && p.batch_year.toString().includes(filterBatchYear.trim()));

    // Profession filter (optional)
    const professionMatch = !filterProfession.trim() ||
      (p.profession && p.profession.toLowerCase().includes(filterProfession.toLowerCase()));

    // Company filter (optional)
    const companyMatch = !filterCompany.trim() ||
      (p.company && p.company.toLowerCase().includes(filterCompany.toLowerCase()));

    // If a specific search location is set (via Enter or Suggestion), filter by distance (50km)
    if (searchLocation) {
      const dist = getDistanceFromLatLonInKm(searchLocation[0], searchLocation[1], p.latitude, p.longitude);
      return schoolMatch && batchMatch && professionMatch && companyMatch && dist <= 50;
    }

    // Otherwise use text-based city filter (or show all if search is empty)
    const cityMatch = p.city.toLowerCase().includes(filterCity.toLowerCase());

    // If Near Me is active, also apply proximity filter
    if (nearMeActive && userLocation) {
      const dist = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, p.latitude, p.longitude);
      return schoolMatch && batchMatch && professionMatch && companyMatch && cityMatch && dist <= 50;
    }

    // Standard filter: school + city + batch + profession + company
    return schoolMatch && batchMatch && professionMatch && companyMatch && cityMatch;
  });

  // Handle School selection on Welcome Screen
  const handleSelectSchool = (school) => {
    const slug = slugify(school);
    navigate(`/${slug}`);
  };

  // Handle Password Submit
  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password === 'Alumni@183') {
      setIsAuthorized(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
      showToast("Incorrect password", "error");
    }
  };

  // Switch School Helper
  const handleSwitchSchool = () => {
    setIsAuthorized(false);
    setPassword('');
    navigate('/');
    setAddStep(0);
  };

  if (!selectedSchool) {
    return (
      <div className="welcome-screen">
        <div className="welcome-card glass-panel">
          <div className="welcome-header">
            <img src="/letscatchup-logo.jpg" alt="LetsCatchUp Logo" className="welcome-logo" />
            <h1>LetsCatchUp</h1>
            <p>Connect with your fellow alumni across the globe</p>
          </div>

          {!isAuthorized ? (
            <form className="password-gate" onSubmit={handlePasswordSubmit}>
              <label>Enter Portal Password</label>
              <div className={`search-input-group ${passwordError ? 'error' : ''}`}>
                <Lock size={20} className="icon" />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(false);
                  }}
                  autoFocus
                />
              </div>
              {passwordError && (
                <p className="error-message">Incorrect password. Please try again.</p>
              )}
              <button type="submit" className="btn-submit" style={{ marginTop: '20px', width: '100%' }}>
                Access Portal
              </button>
            </form>
          ) : (
            <div className="welcome-search-group">
              {!showManualEntry ? (
                <>
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

                  <button
                    className="btn-text-only"
                    style={{ marginTop: '12px', opacity: 0.8 }}
                    onClick={() => setShowManualEntry(true)}
                  >
                    Don't see your school? Add it manually
                  </button>
                </>
              ) : (
                <form className="manual-school-form" onSubmit={handleCreateManualSchool}>
                  <label>Register New Institution</label>
                  <div className="search-input-group">
                    <School size={20} className="icon" />
                    <input
                      type="text"
                      placeholder="Full School Name"
                      value={manualSchoolName}
                      onChange={(e) => setManualSchoolName(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ marginTop: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', opacity: 0.8 }}>
                      School Logo (Optional)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div
                        className="logo-upload-preview"
                        onClick={() => document.getElementById('school-logo-upload').click()}
                        style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '12px',
                          border: '2px dashed var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          background: 'rgba(255,255,255,0.05)'
                        }}
                      >
                        {manualSchoolLogoPreview ? (
                          <img src={manualSchoolLogoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                          <Plus size={24} style={{ opacity: 0.5 }} />
                        )}
                      </div>
                      <input
                        id="school-logo-upload"
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={handleManualLogoChange}
                      />
                      <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>This will be used for all map pins</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button
                      type="button"
                      className="btn-submit"
                      style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', flex: 1 }}
                      onClick={() => setShowManualEntry(false)}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="btn-submit"
                      style={{ flex: 2 }}
                      disabled={submitting}
                    >
                      {submitting ? "Generating..." : "Generate Map"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          <div className="welcome-footer">
            <p>Ready to reconnect? LetsCatchUp!</p>
          </div>
        </div>

        {/* Credits */}
        <PoweredBy />
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
            <img src={schoolLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '2px' }} />
          </div>
          <div className="branding-text">
            <h2>{selectedSchool}</h2>
            <p>{selectedSchool} Family</p>
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

          {/* Batch Year Filter */}
          <div className="search-input-group" style={{ position: 'relative', minWidth: '160px' }}>
            <GraduationCap size={18} className="icon" />
            <input
              type="text"
              placeholder="Batch Year..."
              value={filterBatchYear}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, ''); // Only allow numbers
                setFilterBatchYear(value);
              }}
              maxLength={4}
            />
          </div>

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

          {/* More Filters Button */}
          <button
            className={`more-filters-btn ${showAdvancedFilters ? 'active' : ''}`}
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            title="More Filters"
          >
            <Briefcase size={18} />
            <span>Filters</span>
            {(filterProfession || filterCompany) && (
              <span className="filter-badge">
                {[filterProfession, filterCompany].filter(Boolean).length}
              </span>
            )}
            {showAdvancedFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="advanced-filters-panel">
            <div className="advanced-filters-content">
              <div className="filter-row">
                <div className="search-input-group" style={{ flex: 1 }}>
                  <Briefcase size={18} className="icon" />
                  <input
                    type="text"
                    placeholder="Profession (e.g., Software Engineer)..."
                    value={filterProfession}
                    onChange={(e) => setFilterProfession(e.target.value)}
                  />
                </div>
              </div>

              <div className="filter-row">
                <div className="search-input-group" style={{ flex: 1 }}>
                  <Briefcase size={18} className="icon" />
                  <input
                    type="text"
                    placeholder="Company (e.g., Google)..."
                    value={filterCompany}
                    onChange={(e) => setFilterCompany(e.target.value)}
                  />
                </div>
              </div>

              {(filterProfession || filterCompany) && (
                <div className="filter-actions">
                  <button
                    className="btn-clear-filters"
                    onClick={() => {
                      setFilterProfession('');
                      setFilterCompany('');
                    }}
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

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

        {/* STEP 1: Complete Information Form */}
        {addStep === 1 && (
          <div className="sidebar-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="sidebar-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', width: '100%' }}>
                <div>
                  <h2>Step 1/2</h2>
                  <p>Be the Part of the Family</p>
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

            <form className="add-pin-form" onSubmit={handleStep1Submit} onClick={() => { setFormCitySuggestions([]); }} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Scrollable Content Area */}
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '10px' }}>
                <p className="section-label">Profile</p>
                {/* School Name - Pre-filled and disabled */}
                <input name="school_name" value={formData.school_name} disabled style={{ opacity: 0.7 }} />

                <input name="full_name" placeholder="Full Name" required value={formData.full_name} onChange={handleInputChange} autoFocus />
                <input name="batch_year" placeholder="Batch Year (e.g. 2024)" type="number" value={formData.batch_year} onChange={handleInputChange} />
                <input name="profession" placeholder="Profession" value={formData.profession} onChange={handleInputChange} />
                <input name="company" placeholder="Company" value={formData.company} onChange={handleInputChange} />

                {/* Avatar Upload */}
                <div style={{ marginTop: '10px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Profile Picture (max 200KB)
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

                {/* Contact Section */}
                <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border)' }}>
                  <p className="section-label">Contact</p>
                  <p className="section-subheading">Best & Fastest way to reach you?</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      name="mobile_number"
                      placeholder="Mobile No. (for WhatsApp)"
                      type="tel"
                      value={formData.mobile_number}
                      onChange={handleInputChange}
                    />
                    <input
                      name="contact_info"
                      placeholder="Email"
                      value={formData.contact_info}
                      onChange={handleInputChange}
                    />
                    <input
                      name="linkedin_url"
                      placeholder="LinkedIn Profile URL"
                      value={formData.linkedin_url}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                {/* Location Information */}
                <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border)' }}>
                  <p className="section-label">Your Location</p>

                  {/* City Input with suggestions */}
                  <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                    <MapPin size={14} className="icon-input-overlay" style={{ position: 'absolute', right: 10, top: 12, opacity: 0.5 }} />
                    <input
                      name="city"
                      placeholder="City"
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

                  {/* Pincode Input */}
                  <div style={{ marginTop: '8px' }}>
                    <input
                      name="pincode"
                      placeholder="Pincode"
                      required
                      value={formData.pincode || ''}
                      onChange={(e) => {
                        // Only numbers for pincode
                        const val = e.target.value.replace(/\D/g, '');
                        setFormData({ ...formData, pincode: val });
                      }}
                      pattern="\d*"
                      maxLength={10}
                    />
                  </div>
                </div>
              </div>

              {/* Sticky Submit Button */}
              <div style={{ padding: '15px 0 0', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-sidebar)' }}>
                <button type="submit" className="btn-submit" style={{ margin: 0, width: '100%' }}>
                  Next: Place Pin on Map
                </button>
              </div>
            </form>
          </div>
        )}



        {/* STEP 2: After pin is placed, show confirmation */}
        {addStep === 2 && newPinLoc && (
          <div className="sidebar-panel">
            <div className="sidebar-header" style={{ padding: '12px 15px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr 36px',
                alignItems: 'center',
                gap: '10px',
                width: '100%'
              }}>
                {/* Back Button - Left */}
                <button
                  onClick={() => {
                    setAddStep(1); // Go back to Step 1
                    setNewPinLoc(null); // Clear the pin
                  }}
                  className="btn-icon-close"
                  title="Back to Edit Info"
                  style={{ width: '36px', height: '36px' }}
                >
                  <ArrowLeft size={18} />
                </button>

                {/* Title - Center */}
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 2px 0' }}>Confirm Location</h2>
                  <p style={{ fontSize: '0.75rem', margin: 0, opacity: 0.8 }}>Is this pin in the right place?</p>
                </div>

                {/* Close Button - Right */}
                <button
                  onClick={() => {
                    setAddStep(0);
                    setNewPinLoc(null);
                  }}
                  className="btn-icon-close"
                  title="Close"
                  style={{ width: '36px', height: '36px' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{ padding: '15px' }}>


              <div className="form-actions" style={{ gap: '8px' }}>
                <button
                  onClick={() => {
                    setNewPinLoc(null);
                  }}
                  className="btn-submit"
                  style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', padding: '10px 16px', fontSize: '0.8rem' }}
                >
                  Reposition Pin
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-submit"
                  style={{ padding: '10px 16px', fontSize: '0.8rem' }}
                >
                  {submitting ? "Pinning..." : "Confirm & Join Map"}
                </button>
              </div>
            </div>
          </div>
        )}


      </div>

      {/* Main Map */}
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        minZoom={2}
        worldCopyJump={true}
        maxBounds={[[-85, -Infinity], [85, Infinity]]}
        maxBoundsViscosity={1.0}
        style={{ height: "100vh", width: "100%" }}
        zoomControl={false} // Custom zoom control position if needed, or default
        attributionControl={false}
        className={zoomLevel >= 10 ? 'show-marker-labels' : ''}
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
            // Close advanced filters panel
            setShowAdvancedFilters(false);
          }}
          setZoom={setZoomLevel}
        />

        {/* Render Existing Pins with Clustering */}
        <MarkerClusterGroup
          chunkedLoading
          iconCreateFunction={createClusterCustomIcon}
          maxClusterRadius={70} // Slightly larger radius for logo-based clusters
          spiderfyOnMaxZoom={true}
          zoomToBoundsOnClick={false}
          eventHandlers={{
            clusterclick: (e) => {
              const cluster = e.layer;
              const map = e.target._map;
              map.flyToBounds(cluster.getBounds(), {
                padding: [150, 150],
                duration: 2.0,
                easeLinearity: 0.20
              });
            }
          }}
        >
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
            const isCustomLogo = schoolLogo && schoolLogo !== "/letscatchup-logo.jpg";
            const displayIconUrl = isCustomLogo ? schoolLogo : pin.avatar_url;

            const customIcon = L.divIcon({
              className: 'custom-marker',
              html: `
                <div class="marker-pin">
                  <div class="marker-inner ${isCustomLogo ? 'is-logo' : ''} ${!displayIconUrl ? 'is-placeholder' : ''}" 
                       style="${!displayIconUrl ? `color: ${avatarBgColor}; background-color: white` : ''}">
                    ${displayIconUrl
                  ? `<img src="${displayIconUrl}" alt="${pin.full_name}" />`
                  : `<span>${pin.full_name.charAt(0)}</span>`
                }
                  </div>
                </div>
                <div class="marker-name-label">
                  <strong>${pin.full_name}</strong>
                  ${pin.batch_year ? `<span>Batch of ${pin.batch_year}</span>` : ''}
                </div>`,
              iconSize: [40, 58],
              iconAnchor: [20, 58],
              popupAnchor: [0, -45]
            });

            return (
              <Marker
                key={pin.id}
                position={[parseFloat(pin.latitude), parseFloat(pin.longitude)]}
                icon={customIcon}
                eventHandlers={{
                  click: (e) => {
                    if (zoomLevel >= 10) {
                      e.target.openPopup();
                    } else {
                      // Optional: You could add map.flyTo here if you wanted to zoom them in instead
                      // e.target._map.flyTo(e.latlng, 12);
                    }
                  },
                  mouseover: (e) => {
                    if (zoomLevel >= 10) {
                      e.target.openPopup();
                    }
                  },
                  add: (e) => {
                    // After marker is added to map, attach event listeners to the name label
                    setTimeout(() => {
                      const markerElement = e.target._icon;
                      if (markerElement) {
                        const nameLabel = markerElement.querySelector('.marker-name-label');
                        if (nameLabel && zoomLevel >= 10) {
                          nameLabel.addEventListener('click', () => {
                            e.target.openPopup();
                          });
                          nameLabel.addEventListener('mouseover', () => {
                            e.target.openPopup();
                          });
                        }
                      }
                    }, 100);
                  }
                }}
              >
                <Popup>
                  <div className="pin-popup">
                    <div className="popup-header" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      {pin.avatar_url ? (
                        <img
                          src={pin.avatar_url}
                          alt={pin.full_name}
                          className="popup-avatar"
                          style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff' }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="popup-avatar-placeholder" style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundColor: avatarBgColor,
                          color: 'white', // White text for better contrast
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          border: '2px solid white'
                        }}>
                          {pin.full_name.charAt(0)}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: 0 }}>@{pin.full_name}</h3>
                        {pin.batch_year && (
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            Batch of {pin.batch_year}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="tag">
                      <GraduationCap size={14} />
                      <span><strong>{pin.school_name}</strong></span>
                    </div>
                    <div className="tag">
                      <Briefcase size={14} />
                      <span>{pin.profession} {pin.company && `@ ${pin.company}`}</span>
                    </div>
                    <div className="tag">
                      <MapPin size={14} />
                      <CityResolver city={pin.city} lat={pin.latitude} lon={pin.longitude} />
                    </div>
                    {/* Unified Contact Logos in Popup */}
                    {(pin.mobile_number || pin.contact_info || pin.linkedin_url || pin.instagram_url) && (
                      <div className="popup-social-links" style={{ justifyContent: 'center' }}>
                        {pin.mobile_number && (
                          <a href={`https://wa.me/${pin.mobile_number.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" title="WhatsApp">
                            <WhatsAppIcon size={20} />
                          </a>
                        )}
                        {pin.contact_info && (
                          <a href={`mailto:${pin.contact_info}`} title="Email">
                            <Mail size={20} />
                          </a>
                        )}
                        {pin.linkedin_url && (
                          <a href={pin.linkedin_url.startsWith('http') ? pin.linkedin_url : `https://${pin.linkedin_url}`} target="_blank" rel="noopener noreferrer" title="LinkedIn">
                            <Linkedin size={20} />
                          </a>
                        )}
                        {pin.instagram_url && (
                          <a href={pin.instagram_url.startsWith('http') ? pin.instagram_url : `https://instagram.com/${pin.instagram_url.replace('@', '')}`} target="_blank" rel="noopener noreferrer" title="Instagram">
                            <Instagram size={20} />
                          </a>
                        )}
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
        </MarkerClusterGroup>

        {/* Temporary Marker for New Pin - Draggable */}
        {
          newPinLoc && (
            <Marker
              position={newPinLoc}
              opacity={0.9}
              draggable={true}
              icon={L.divIcon({
                className: 'custom-marker dragging-marker',
                html: `
                  <div class="marker-pin">
                    <div class="marker-inner is-logo">
                       <img src="${schoolLogo}" alt="New Pin" />
                    </div>
                  </div>`,
                iconSize: [40, 58],
                iconAnchor: [20, 58]
              })}
              eventHandlers={{
                dragend: (e) => {
                  const marker = e.target;
                  const position = marker.getLatLng();
                  setNewPinLoc(position); // Fixed: Pass LatLng object directly or consistent array
                }
              }}
            />
          )
        }
      </MapContainer >


      <Analytics />

      {/* Credits */}
      <PoweredBy />
    </div >
  );
}

export default App;
