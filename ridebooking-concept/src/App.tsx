import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Car, Bike, CreditCard, Menu, User, Clock, Star,
  ChevronLeft, Search, Phone, MessageSquare, MoreHorizontal
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// Custom icons to avoid broken default image links in Vite
const currentLocationIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div class="w-5 h-5 bg-blue-500 border-4 border-white rounded-full shadow-md"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const destinationIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div class="w-6 h-6 bg-emerald-500 border-4 border-white rounded-full shadow-md flex items-center justify-center"><div class="w-1.5 h-1.5 bg-white rounded-full"></div></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const RIDE_OPTIONS = [
  { id: 'moto', name: 'Motorcycle', time: '2 min', price: 45, icon: Bike, capacity: 1 },
  { id: 'eco', name: 'Economy Car', time: '4 min', price: 120, icon: Car, capacity: 4 },
  { id: 'premium', name: 'Premium Car', time: '6 min', price: 250, icon: Car, capacity: 4 },
];

// Helper component to auto-fit map bounds
function MapBounds({ start, routeCoords, step }: { start: [number, number], routeCoords: [number, number][] | null, step: string }) {
  const map = useMap();
  useEffect(() => {
    if (routeCoords && routeCoords.length > 0 && step !== 'home') {
      const bounds = L.latLngBounds(routeCoords);
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    } else if (step === 'home') {
      map.setView(start, 15, { animate: true });
    }
  }, [map, start, routeCoords, step]);
  return null;
}

export default function App() {
  const [step, setStep] = useState<'home' | 'select' | 'searching' | 'matched'>('home');
  const [pickup, setPickup] = useState('Current Location');
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [dropoff, setDropoff] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | null>(null);
  const [selectedRide, setSelectedRide] = useState('eco');
  const [deviceLocation, setDeviceLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number, duration: number } | null>(null);

  useEffect(() => {
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setDeviceLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error("Error getting location:", error);
          setLocationError(true);
          // Fallback to Makati if location access is denied or fails
          setDeviceLocation([14.5547, 121.0244]);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setLocationError(true);
      setDeviceLocation([14.5547, 121.0244]);
    }
  }, []);

  const startLoc = pickupCoords || deviceLocation;
  const endLoc = destinationCoords;

  useEffect(() => {
    if (startLoc && endLoc && step !== 'home') {
      const fetchRoute = async () => {
        try {
          // OSRM expects longitude,latitude
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${startLoc[1]},${startLoc[0]};${endLoc[1]},${endLoc[0]}?overview=full&geometries=geojson`);
          const data = await res.json();
          if (data.routes && data.routes.length > 0) {
            // OSRM returns [longitude, latitude], Leaflet expects [latitude, longitude]
            const coords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
            setRouteCoords(coords);
            setRouteInfo({
              distance: data.routes[0].distance,
              duration: data.routes[0].duration
            });
          } else {
            setRouteCoords([startLoc, endLoc]);
            setRouteInfo(null);
          }
        } catch (err) {
          console.error("Routing error:", err);
          setRouteCoords([startLoc, endLoc]);
          setRouteInfo(null);
        }
      };
      fetchRoute();
    } else {
      setRouteCoords(null);
      setRouteInfo(null);
    }
  }, [startLoc, endLoc, step]);

  if (!startLoc) {
    return (
      <div className="relative w-full h-screen bg-gray-900 flex justify-center items-center font-sans">
        <div className="text-white flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="font-medium">Locating you...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-gray-900 overflow-hidden flex justify-center font-sans text-gray-900">
      {/* Mobile Container Simulator */}
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-hidden flex flex-col">
        
        {/* Real Map Background */}
        <div className="absolute inset-0 z-0 bg-[#f3f4f6] overflow-hidden">
          <MapContainer 
            center={startLoc} 
            zoom={15} 
            zoomControl={false}
            className="w-full h-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            <Marker position={startLoc} icon={currentLocationIcon} />
            
            {endLoc && step !== 'home' && (
              <>
                <Marker position={endLoc} icon={destinationIcon} />
                {routeCoords && (
                  <Polyline 
                    positions={routeCoords} 
                    color="#10b981" 
                    weight={5} 
                  />
                )}
              </>
            )}
            <MapBounds start={startLoc} routeCoords={routeCoords} step={step} />
          </MapContainer>
        </div>

        {/* Top Navigation */}
        <div className="absolute top-0 left-0 right-0 z-20 p-5 flex justify-between items-center pointer-events-none">
          {step === 'home' ? (
            <button className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors pointer-events-auto">
              <Menu size={24} />
            </button>
          ) : (
            <button 
              onClick={() => setStep('home')} 
              className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors pointer-events-auto"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <div className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center overflow-hidden border-2 border-white pointer-events-auto">
            <User size={24} className="text-gray-600" />
          </div>
        </div>

        {/* Main Content Area (Bottom Sheets) */}
        <div className="relative z-10 flex-1 flex flex-col justify-end pointer-events-none">
          <AnimatePresence mode="wait">
            {step === 'home' && (
              <HomePanel 
                key="home" 
                setStep={setStep} 
                pickup={pickup}
                setPickup={setPickup}
                setPickupCoords={setPickupCoords}
                dropoff={dropoff} 
                setDropoff={setDropoff} 
                setDestinationCoords={setDestinationCoords} 
              />
            )}
            {step === 'select' && (
              <SelectPanel key="select" setStep={setStep} selectedRide={selectedRide} setSelectedRide={setSelectedRide} routeInfo={routeInfo} />
            )}
            {step === 'searching' && (
              <SearchingPanel key="search" />
            )}
            {step === 'matched' && (
              <MatchedPanel key="matched" setStep={setStep} selectedRide={selectedRide} routeInfo={routeInfo} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// --- Panel Components ---

const HomePanel = ({ setStep, pickup, setPickup, setPickupCoords, dropoff, setDropoff, setDestinationCoords }: any) => {
  const [activeField, setActiveField] = useState<'pickup' | 'dropoff'>('dropoff');
  const [query, setQuery] = useState(dropoff);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const data = await res.json();
        setSuggestions(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleFocus = (field: 'pickup' | 'dropoff') => {
    setActiveField(field);
    setQuery(field === 'pickup' ? (pickup === 'Current Location' ? '' : pickup) : dropoff);
    setSuggestions([]);
  };

  const handleSelect = (place: any) => {
    const shortName = place.name || place.display_name.split(',')[0];
    const coords: [number, number] = [parseFloat(place.lat), parseFloat(place.lon)];
    
    if (activeField === 'pickup') {
      setPickup(shortName);
      setPickupCoords(coords);
      setActiveField('dropoff');
      setQuery(dropoff);
    } else {
      setDropoff(shortName);
      setDestinationCoords(coords);
      setStep('select');
    }
  };

  const handleUseCurrentLocation = () => {
    setPickup('Current Location');
    setPickupCoords(null);
    setActiveField('dropoff');
    setQuery(dropoff);
  };

  return (
    <motion.div
      initial={{ y: 300, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 pb-10 pointer-events-auto flex flex-col max-h-[85vh]"
    >
      <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-8 shrink-0" />
      <h2 className="text-3xl font-bold mb-6 tracking-tight shrink-0">Where to?</h2>
      
      <div className="relative mb-6 shrink-0">
        <div className="absolute left-5 top-0 bottom-0 flex flex-col items-center justify-center py-5">
          <div className="w-2.5 h-2.5 bg-black rounded-full" />
          <div className="w-0.5 h-10 bg-gray-200 my-1" />
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
        </div>
        <div className="pl-12 space-y-3">
          <div className={`bg-gray-50 rounded-2xl p-4 flex items-center border ${activeField === 'pickup' ? 'border-emerald-500 ring-2 ring-emerald-500 bg-white' : 'border-gray-100'} transition-all shadow-sm`}>
            <input
              type="text"
              placeholder="Pickup location"
              className="bg-transparent w-full outline-none font-semibold text-lg placeholder:font-medium placeholder:text-gray-400"
              value={activeField === 'pickup' ? query : pickup}
              onChange={(e) => {
                if (activeField !== 'pickup') handleFocus('pickup');
                setQuery(e.target.value);
              }}
              onFocus={() => handleFocus('pickup')}
            />
          </div>
          <div className={`bg-gray-50 rounded-2xl p-4 flex items-center border ${activeField === 'dropoff' ? 'border-emerald-500 ring-2 ring-emerald-500 bg-white' : 'border-gray-100'} transition-all shadow-sm`}>
            <input
              type="text"
              placeholder="Search destination"
              className="bg-transparent w-full outline-none font-semibold text-lg placeholder:font-medium placeholder:text-gray-400"
              value={activeField === 'dropoff' ? query : dropoff}
              onChange={(e) => {
                if (activeField !== 'dropoff') handleFocus('dropoff');
                setQuery(e.target.value);
              }}
              onFocus={() => handleFocus('dropoff')}
              onKeyDown={(e) => e.key === 'Enter' && dropoff && setStep('select')}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto flex-1 pr-2 pb-2">
        {activeField === 'pickup' && query.length < 3 && (
          <div 
            className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors" 
            onClick={handleUseCurrentLocation}
          >
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0">
              <div className="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-sm" />
            </div>
            <div className="truncate">
              <p className="font-bold text-lg text-blue-600">Use Current Location</p>
              <p className="text-sm text-gray-500 font-medium">GPS accuracy</p>
            </div>
          </div>
        )}

        {query.length >= 3 ? (
          loading ? (
            <div className="p-4 text-center text-gray-500 font-medium">Searching...</div>
          ) : suggestions.length > 0 ? (
            suggestions.map((s, i) => (
              <div 
                key={i}
                className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors"
                onClick={() => handleSelect(s)}
              >
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 shrink-0">
                  <Search size={18} />
                </div>
                <div className="truncate flex-1">
                  <p className="font-bold text-base truncate">{s.name || s.display_name.split(',')[0]}</p>
                  <p className="text-xs text-gray-500 font-medium truncate">{s.display_name}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500 font-medium">No results found</div>
          )
        ) : activeField === 'dropoff' ? (
          <>
            <div 
              className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors" 
              onClick={() => { 
                setDropoff('Office (BGC)'); 
                setDestinationCoords([14.5499, 121.0485]);
                setStep('select'); 
              }}
            >
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 shrink-0">
                <Clock size={20} />
              </div>
              <div className="truncate">
                <p className="font-bold text-lg">Office (BGC)</p>
                <p className="text-sm text-gray-500 font-medium">Taguig, Metro Manila</p>
              </div>
            </div>
            <div 
              className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl cursor-pointer transition-colors" 
              onClick={() => { 
                setDropoff('SM Megamall'); 
                setDestinationCoords([14.5843, 121.0565]);
                setStep('select'); 
              }}
            >
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 shrink-0">
                <Star size={20} />
              </div>
              <div className="truncate">
                <p className="font-bold text-lg">SM Megamall</p>
                <p className="text-sm text-gray-500 font-medium">Mandaluyong, Metro Manila</p>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </motion.div>
  );
};

const SelectPanel = ({ setStep, selectedRide, setSelectedRide, routeInfo }: any) => {
  const getDynamicRides = () => {
    if (!routeInfo) return RIDE_OPTIONS;
    
    const distanceKm = routeInfo.distance / 1000;
    const durationMin = routeInfo.duration / 60;
    
    return RIDE_OPTIONS.map(ride => {
      let price = ride.price;
      
      if (ride.id === 'moto') {
        price = Math.round(40 + (distanceKm * 10) + (durationMin * 2));
      } else if (ride.id === 'eco') {
        price = Math.round(60 + (distanceKm * 15) + (durationMin * 3));
      } else if (ride.id === 'premium') {
        price = Math.round(100 + (distanceKm * 25) + (durationMin * 5));
      }
      
      const etaMin = Math.round(durationMin);
      const time = `${etaMin} min`;
      
      return { ...ride, price, time };
    });
  };

  const dynamicRides = getDynamicRides();

  return (
  <motion.div
    initial={{ y: 300, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    exit={{ y: 300, opacity: 0 }}
    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    className="bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 pb-8 pointer-events-auto flex flex-col max-h-[75vh]"
  >
    <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />
    <h3 className="text-2xl font-bold mb-4 tracking-tight">Choose a ride</h3>

    <div className="flex-1 overflow-y-auto space-y-3 mb-6 pr-2 pb-2">
      {dynamicRides.map((ride) => (
        <div
          key={ride.id}
          onClick={() => setSelectedRide(ride.id)}
          className={`flex items-center p-4 rounded-3xl border-2 transition-all cursor-pointer ${
            selectedRide === ride.id 
              ? 'border-emerald-500 bg-emerald-50/30 shadow-md shadow-emerald-100' 
              : 'border-transparent bg-gray-50 hover:bg-gray-100'
          }`}
        >
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${selectedRide === ride.id ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-gray-600 shadow-sm'}`}>
            <ride.icon size={32} />
          </div>
          <div className="ml-4 flex-1">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-lg">{ride.name}</span>
              <span className="font-bold text-xl">₱{ride.price}</span>
            </div>
            <div className="flex items-center text-sm text-gray-500 font-medium">
              <Clock size={14} className="mr-1.5" /> {ride.time} away
              <span className="mx-2">•</span>
              <User size={14} className="mr-1.5" /> {ride.capacity}
            </div>
          </div>
        </div>
      ))}
    </div>

    <div className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl mb-6 border border-gray-100">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
          <CreditCard size={16} className="text-emerald-600" />
        </div>
        <span className="font-bold">GCash</span>
      </div>
      <MoreHorizontal size={20} className="text-gray-400" />
    </div>

    <button
      onClick={() => {
        setStep('searching');
        setTimeout(() => setStep('matched'), 3500);
      }}
      className="w-full bg-black text-white font-bold text-lg py-5 rounded-2xl hover:bg-gray-800 transition-transform active:scale-[0.98] shadow-xl shadow-black/20"
    >
      Book {dynamicRides.find(r => r.id === selectedRide)?.name}
    </button>
  </motion.div>
)};

const SearchingPanel = () => (
  <motion.div
    initial={{ y: 300, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    exit={{ y: 300, opacity: 0 }}
    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    className="bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-8 pb-12 pointer-events-auto flex flex-col items-center justify-center min-h-[45vh]"
  >
    <div className="relative w-28 h-28 mb-8">
      <div className="absolute inset-0 border-4 border-emerald-100 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
      <div className="absolute inset-2 border-4 border-emerald-200 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.4s' }} />
      <div className="absolute inset-4 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/40 z-10">
        <Search size={36} className="text-white" />
      </div>
    </div>
    <h3 className="text-2xl font-bold text-center tracking-tight">Finding your driver...</h3>
    <p className="text-gray-500 text-center mt-2 font-medium">Connecting to nearby drivers</p>
  </motion.div>
);

const MatchedPanel = ({ setStep, selectedRide, routeInfo }: any) => {
  const getDynamicRides = () => {
    if (!routeInfo) return RIDE_OPTIONS;
    
    const distanceKm = routeInfo.distance / 1000;
    const durationMin = routeInfo.duration / 60;
    
    return RIDE_OPTIONS.map(ride => {
      let price = ride.price;
      
      if (ride.id === 'moto') {
        price = Math.round(40 + (distanceKm * 10) + (durationMin * 2));
      } else if (ride.id === 'eco') {
        price = Math.round(60 + (distanceKm * 15) + (durationMin * 3));
      } else if (ride.id === 'premium') {
        price = Math.round(100 + (distanceKm * 25) + (durationMin * 5));
      }
      
      const etaMin = Math.round(durationMin);
      const time = `${etaMin} min`;
      
      return { ...ride, price, time };
    });
  };

  const dynamicRides = getDynamicRides();
  const ride = dynamicRides.find(r => r.id === selectedRide);
  
  return (
    <motion.div
      initial={{ y: 300, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 pb-8 pointer-events-auto"
    >
      <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />
      
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-3xl font-bold tracking-tight text-emerald-600 mb-1">Arriving in 4 min</h3>
          <p className="text-gray-500 font-medium text-lg">Toyota Vios • ABC 1234</p>
        </div>
        <div className="bg-gray-50 px-4 py-2 rounded-xl font-bold text-xl border border-gray-100">
          ₱{ride?.price}
        </div>
      </div>

      <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-3xl mb-8 border border-gray-100">
        <div className="w-16 h-16 bg-gray-300 rounded-full overflow-hidden shadow-sm">
          <img src="https://picsum.photos/seed/driver1/200/200" alt="Driver" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-xl mb-1">Juan Dela Cruz</h4>
          <div className="flex items-center text-sm text-gray-600 font-medium">
            <Star size={16} className="text-yellow-400 fill-yellow-400 mr-1.5" /> 4.9 (1.2k rides)
          </div>
        </div>
        <div className="flex gap-2">
          <button className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center text-emerald-600 hover:bg-emerald-50 transition-colors">
            <MessageSquare size={20} />
          </button>
          <button className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center text-emerald-600 hover:bg-emerald-50 transition-colors">
            <Phone size={20} />
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <button className="flex-1 bg-gray-100 text-gray-800 font-bold text-lg py-5 rounded-2xl hover:bg-gray-200 transition-colors">
          Share ETA
        </button>
        <button 
          onClick={() => setStep('home')} 
          className="flex-1 bg-red-50 text-red-600 font-bold text-lg py-5 rounded-2xl hover:bg-red-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

