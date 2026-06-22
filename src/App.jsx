import { useState, useEffect, useRef, useCallback } from 'react'

/* ----------------------------------------------------------------------- */
/* Pure helpers                                                            */
/* ----------------------------------------------------------------------- */

function latLonToVector3(lat, lon, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  }
}

function vectorToLatLon(v) {
  const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  const lat = 90 - (Math.acos(v.y / r) * 180) / Math.PI
  let lon = (Math.atan2(v.z, -v.x) * 180) / Math.PI - 180
  lon = ((lon + 180) % 360 + 360) % 360 - 180
  return { lat, lon }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '🏳️'
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('')
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
function degToCompass(deg) {
  if (deg === undefined || deg === null) return '—'
  const idx = Math.round(deg / 22.5) % 16
  return `${COMPASS[idx]} ${Math.round(deg)}°`
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16)
  const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16)
  const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function aqiInfo(value) {
  if (value === null || value === undefined) return null
  if (value <= 50) return { label: 'Bonne', color: '#4ade80' }
  if (value <= 100) return { label: 'Modérée', color: '#facc15' }
  if (value <= 150) return { label: 'Mauvaise (sensibles)', color: '#fb923c' }
  if (value <= 200) return { label: 'Mauvaise', color: '#f87171' }
  if (value <= 300) return { label: 'Très mauvaise', color: '#c084fc' }
  return { label: 'Dangereuse', color: '#991b1b' }
}

/* ----------------------------------------------------------------------- */
/* WMO weather codes → icône / libellé / couleur                          */
/* ----------------------------------------------------------------------- */

const WEATHER_CODES = {
  0: { label: 'Ciel dégagé', icon: 'sun', color: '#FFD700' },
  1: { label: 'Principalement dégagé', icon: 'sun-cloud', color: '#FFC107' },
  2: { label: 'Partiellement nuageux', icon: 'sun-cloud', color: '#90A4AE' },
  3: { label: 'Couvert', icon: 'cloud', color: '#78909C' },
  45: { label: 'Brouillard', icon: 'fog', color: '#B0BEC5' },
  48: { label: 'Brouillard givrant', icon: 'fog', color: '#90A4AE' },
  51: { label: 'Bruine légère', icon: 'drizzle', color: '#64B5F6' },
  53: { label: 'Bruine modérée', icon: 'drizzle', color: '#42A5F5' },
  55: { label: 'Bruine dense', icon: 'drizzle', color: '#2196F3' },
  56: { label: 'Bruine verglaçante', icon: 'drizzle', color: '#2196F3' },
  57: { label: 'Bruine verglaçante dense', icon: 'drizzle', color: '#1976D2' },
  61: { label: 'Pluie légère', icon: 'rain', color: '#42A5F5' },
  63: { label: 'Pluie modérée', icon: 'rain', color: '#1E88E5' },
  65: { label: 'Pluie forte', icon: 'heavy-rain', color: '#1565C0' },
  66: { label: 'Pluie verglaçante', icon: 'rain', color: '#1565C0' },
  67: { label: 'Pluie verglaçante forte', icon: 'heavy-rain', color: '#0D47A1' },
  71: { label: 'Neige légère', icon: 'snow', color: '#E3F2FD' },
  73: { label: 'Neige modérée', icon: 'snow', color: '#BBDEFB' },
  75: { label: 'Neige forte', icon: 'heavy-snow', color: '#90CAF9' },
  77: { label: 'Grains de neige', icon: 'snow', color: '#E3F2FD' },
  80: { label: 'Averses légères', icon: 'shower', color: '#4FC3F7' },
  81: { label: 'Averses modérées', icon: 'shower', color: '#29B6F6' },
  82: { label: 'Averses violentes', icon: 'shower', color: '#0288D1' },
  85: { label: 'Averses de neige', icon: 'snow-shower', color: '#B3E5FC' },
  86: { label: 'Averses de neige fortes', icon: 'snow-shower', color: '#90CAF9' },
  95: { label: 'Orage', icon: 'thunder', color: '#7E57C2' },
  96: { label: 'Orage avec grêle', icon: 'thunder-hail', color: '#673AB7' },
  99: { label: 'Orage fort + grêle', icon: 'thunder-hail', color: '#512DA8' },
}

function getWeatherInfo(code) {
  return WEATHER_CODES[code] || { label: 'Inconnu', icon: 'cloud', color: '#78909C' }
}

/* ----------------------------------------------------------------------- */
/* API helpers                                                             */
/* ----------------------------------------------------------------------- */

async function searchCities(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1&accept-language=fr`,
    { headers: { 'Accept-Language': 'fr' } }
  )
  if (!res.ok) throw new Error('search failed')
  const data = await res.json()
  return data.map((item) => {
    const addr = item.address || {}
    const name = addr.city || addr.town || addr.village || addr.municipality || addr.state || item.display_name.split(',')[0]
    const region = addr.state || addr.county || ''
    return {
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      name,
      region,
      country: addr.country || '',
      countryCode: addr.country_code || '',
      displayName: item.display_name,
    }
  })
}

async function reverseGeocode(lat, lon) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr`, {
    headers: { 'Accept-Language': 'fr' },
  })
  if (!res.ok) throw new Error('reverse failed')
  const data = await res.json()
  const addr = data.address || {}
  const name = addr.city || addr.town || addr.village || addr.municipality || addr.state || addr.country || 'Lieu inconnu'
  return { name, region: addr.state || addr.county || '', country: addr.country || '', countryCode: addr.country_code || '' }
}

async function fetchWeatherApi(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code,surface_pressure,visibility` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,wind_speed_10m_max` +
    `&hourly=temperature_2m,precipitation_probability` +
    `&timezone=auto&forecast_days=7&wind_speed_unit=kmh`
  const res = await fetch(url)
  if (!res.ok) throw new Error('weather failed')
  const data = await res.json()
  return {
    current: {
      temp: data.current.temperature_2m,
      feels: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      windDir: data.current.wind_direction_10m,
      precip: data.current.precipitation,
      code: data.current.weather_code,
      pressure: data.current.surface_pressure,
      visibility: data.current.visibility,
    },
    daily: data.daily,
    hourly: data.hourly,
    timezone: data.timezone,
  }
}

async function fetchAirQuality(lat, lon) {
  try {
    const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`)
    if (!res.ok) return null
    const data = await res.json()
    return data.current?.us_aqi ?? null
  } catch {
    return null
  }
}

/* ----------------------------------------------------------------------- */
/* WeatherIcon — SVG animé selon le code WMO                              */
/* ----------------------------------------------------------------------- */

function CloudShape({ color = '#cfd8dc' }) {
  return (
    <g className="wi-cloud">
      <ellipse cx="40" cy="62" rx="22" ry="14" fill={color} />
      <ellipse cx="60" cy="55" rx="18" ry="15" fill={color} />
    </g>
  )
}

function SunShape({ color = '#FFD700', cx = 50, cy = 46, r = 16 }) {
  return (
    <g className="wi-sun" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy - r - 10}
          x2={cx}
          y2={cy - r - 3}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${i * 45} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r} fill={color} />
    </g>
  )
}

function Drops({ count, color, fast }) {
  const xs = Array.from({ length: count }).map((_, i) => 20 + (i * 60) / (count - 1 || 1))
  const dur = fast ? 0.6 : 1
  return (
    <g>
      {xs.map((x, i) => (
        <line
          key={i}
          x1={x}
          y1="68"
          x2={x - 3}
          y2="80"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          className="wi-drop"
          style={{ animationDuration: `${dur}s`, animationDelay: `${(i * dur) / count}s` }}
        />
      ))}
    </g>
  )
}

function Flakes({ count, big }) {
  const xs = Array.from({ length: count }).map((_, i) => 18 + (i * 64) / (count - 1 || 1))
  return (
    <g>
      {xs.map((x, i) => (
        <circle
          key={i}
          cx={x}
          cy="70"
          r={big ? 3 : 2.2}
          fill="#ffffff"
          className="wi-flake"
          style={{ animationDelay: `${i * 0.3}s`, animationDuration: `${big ? 1.6 : 2}s` }}
        />
      ))}
    </g>
  )
}

function Lightning({ hail }) {
  return (
    <g>
      <polygon points="55,32 40,58 50,58 45,80 66,52 53,52" fill="#FFD54F" className="wi-flash" />
      {hail &&
        [28, 50, 72].map((x, i) => (
          <circle key={i} cx={x} cy="74" r="2" fill="#e0f7fa" className="wi-flake" style={{ animationDelay: `${i * 0.2}s`, animationDuration: '0.9s' }} />
        ))}
    </g>
  )
}

function WeatherIcon({ code, size = 80 }) {
  const { icon, color } = getWeatherInfo(code)
  let content
  switch (icon) {
    case 'sun':
      content = <SunShape color={color} cx={50} cy={50} r={18} />
      break
    case 'sun-cloud':
      content = (
        <>
          <SunShape color={color} cx={38} cy={38} r={13} />
          <CloudShape color="#eceff1" />
        </>
      )
      break
    case 'cloud':
      content = <CloudShape color="#90a4ae" />
      break
    case 'fog':
      content = (
        <g>
          {[34, 48, 62].map((y, i) => (
            <line key={i} x1="14" y1={y} x2="86" y2={y} stroke="#b0bec5" strokeWidth="5" strokeLinecap="round" className="wi-fog" style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </g>
      )
      break
    case 'drizzle':
      content = (
        <>
          <CloudShape color="#90a4ae" />
          <Drops count={3} color={color} />
        </>
      )
      break
    case 'rain':
      content = (
        <>
          <CloudShape color="#78909c" />
          <Drops count={4} color={color} />
        </>
      )
      break
    case 'heavy-rain':
      content = (
        <>
          <CloudShape color="#607d8b" />
          <Drops count={7} color={color} fast />
        </>
      )
      break
    case 'snow':
      content = (
        <>
          <CloudShape color="#b0bec5" />
          <Flakes count={5} />
        </>
      )
      break
    case 'heavy-snow':
      content = (
        <>
          <CloudShape color="#90a4ae" />
          <Flakes count={8} big />
        </>
      )
      break
    case 'shower':
      content = (
        <>
          <SunShape color="#FFD54F" cx={36} cy={36} r={12} />
          <CloudShape color="#90a4ae" />
          <Drops count={3} color={color} />
        </>
      )
      break
    case 'snow-shower':
      content = (
        <>
          <SunShape color="#FFD54F" cx={36} cy={36} r={12} />
          <CloudShape color="#90a4ae" />
          <Flakes count={3} />
        </>
      )
      break
    case 'thunder':
      content = (
        <>
          <CloudShape color="#546e7a" />
          <Lightning />
        </>
      )
      break
    case 'thunder-hail':
      content = (
        <>
          <CloudShape color="#455a64" />
          <Lightning hail />
        </>
      )
      break
    default:
      content = <CloudShape color="#90a4ae" />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="weather-icon">
      {content}
    </svg>
  )
}

/* ----------------------------------------------------------------------- */
/* StatCard / ForecastCard                                                */
/* ----------------------------------------------------------------------- */

function StatCard({ emoji, label, value, index = 0 }) {
  return (
    <div className="stat-card stagger-in" style={{ animationDelay: `${index * 50}ms` }}>
      <span className="stat-label">{emoji} {label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}

function ForecastCard({ label, code, max, min, index = 0 }) {
  return (
    <div className="forecast-card stagger-in" style={{ animationDelay: `${index * 50}ms` }}>
      <span className="forecast-day">{label}</span>
      <WeatherIcon code={code} size={32} />
      <span className="forecast-max">{Math.round(max)}°</span>
      <span className="forecast-min">{Math.round(min)}°</span>
    </div>
  )
}

/* ----------------------------------------------------------------------- */
/* AnimatedTemp — compteur 0 → valeur réelle                              */
/* ----------------------------------------------------------------------- */

function AnimatedTemp({ value }) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    if (value === null || value === undefined || Number.isNaN(value)) return
    const from = fromRef.current
    const to = value
    const start = performance.now()
    const duration = 800
    let raf
    function tick(now) {
      const t = Math.min((now - start) / duration, 1)
      const eased = easeOutCubic(t)
      setDisplay(from + (to - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span>{Math.round(display)}°</span>
}

/* ----------------------------------------------------------------------- */
/* SearchBar — autocomplete clavier + debounce                            */
/* ----------------------------------------------------------------------- */

function SearchBar({ onSelect, disabled }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([])
        setSearched(false)
        setSearching(false)
        return
      }
      setSearching(true)
      try {
        const data = await searchCities(query)
        setResults(data)
        setSearched(true)
        setOpen(true)
        setActiveIndex(-1)
      } catch {
        setResults([])
        setSearched(true)
      } finally {
        setSearching(false)
      }
    }, 280)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  function clear() {
    setQuery('')
    setResults([])
    setOpen(false)
    setSearched(false)
    setSearching(false)
  }

  function pick(item) {
    onSelect(item)
    clear()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (query) clear()
      else setOpen(false)
      return
    }
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0) pick(results[activeIndex])
    }
  }

  return (
    <div className="search-bar-wrap">
      <div className="search-inner">
        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          className="search-input"
          type="text"
          placeholder="Rechercher une ville dans le monde..."
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          aria-label="Rechercher une ville"
        />
        {searching && <span className="search-spinner" />}
        {!searching && query && (
          <button className="search-clear" type="button" onClick={clear} aria-label="Effacer la recherche">✕</button>
        )}
        {open && (
          <ul className="search-dropdown">
            {results.length === 0 && searched && <li className="search-empty">Aucun résultat pour « {query} »</li>}
            {results.map((item, i) => (
              <li
                key={`${item.lat}-${item.lon}-${i}`}
                className={i === activeIndex ? 'active' : ''}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={() => pick(item)}
                style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}
              >
                <span className="pin">{countryCodeToFlag(item.countryCode)}</span>
                <span className="result-name">
                  {item.name}
                  {item.region ? `, ${item.region}` : ''}
                </span>
                <span className="result-country muted">{item.country}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------- */
/* ThemeToggle                                                            */
/* ----------------------------------------------------------------------- */

function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="logo-mark" aria-hidden="true">
      <defs>
        <radialGradient id="logoSphere" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#9fe7ff" />
          <stop offset="55%" stopColor="#3b8fe0" />
          <stop offset="100%" stopColor="#0d3a73" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill="url(#logoSphere)" />
      <g stroke="rgba(255,255,255,0.5)" strokeWidth="1" fill="none">
        <ellipse cx="20" cy="20" rx="17" ry="6.4" />
        <ellipse cx="20" cy="20" rx="8.4" ry="17" />
        <line x1="3" y1="20" x2="37" y2="20" />
      </g>
      <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      <g className="logo-orbit">
        <circle cx="20" cy="1.4" r="1.7" fill="#eafeff" />
      </g>
    </svg>
  )
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button className="theme-toggle" onClick={onToggle} aria-label="Changer de thème" type="button">
      {theme === 'dark' ? '🌙' : '☀️'}
    </button>
  )
}

/* ----------------------------------------------------------------------- */
/* Toast                                                                  */
/* ----------------------------------------------------------------------- */

function Toast({ toast, onDismiss }) {
  if (!toast) return null
  return (
    <div className={`toast toast-${toast.type}`} onClick={onDismiss} role="button" tabIndex={0}>
      <span className="toast-icon">⚠️</span>
      <span>{toast.message}</span>
      <span className="toast-close">✕</span>
    </div>
  )
}

/* ----------------------------------------------------------------------- */
/* WeatherPanel                                                           */
/* ----------------------------------------------------------------------- */

function WeatherPanel({ open, city, weather, aqi, loading, error, dragOffset, onClose, onHandleDown, onHandleMove, onHandleUp }) {
  const info = weather ? getWeatherInfo(weather.current.code) : null
  const aq = aqiInfo(aqi)

  let localTime = '--:--'
  let weekday = ''
  if (weather?.timezone) {
    try {
      localTime = new Intl.DateTimeFormat('fr-FR', { timeZone: weather.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date())
      weekday = new Intl.DateTimeFormat('fr-FR', { timeZone: weather.timezone, weekday: 'short' }).format(new Date())
    } catch {
      // timezone inconnue, on garde les valeurs par défaut
    }
  }

  function fmtTime(iso) {
    if (!iso || !weather?.timezone) return '--:--'
    try {
      return new Intl.DateTimeFormat('fr-FR', { timeZone: weather.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    } catch {
      return '--:--'
    }
  }

  return (
    <aside
      className={`weather-panel ${open ? 'open' : ''}`}
      style={dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined}
    >
      <div className="panel-handle" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} />
      <button className="panel-close" onClick={onClose} aria-label="Fermer" type="button">✕</button>

      {city && (
        <div className="panel-header">
          <div className="panel-title">
            <span className="flag-emoji">{countryCodeToFlag(city.countryCode)}</span>
            {city.name === 'Recherche...' ? (
              <span className="sk sk-name-line" />
            ) : (
              <span className="city-name">
                {city.name}
                {city.country ? `, ${city.country}` : ''}
              </span>
            )}
          </div>
          {weather && (
            <div className="panel-clock muted">
              🕐 {localTime} <span className="weekday">· {weekday}</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-card">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {!error && loading && (
        <div className="skeleton">
          <div className="sk sk-icon" />
          <div className="sk sk-temp" />
          <div className="sk-row">
            <div className="sk sk-box" />
            <div className="sk sk-box" />
            <div className="sk sk-box" />
            <div className="sk sk-box" />
          </div>
        </div>
      )}

      {!error && !loading && weather && info && (
        <>
          <div className="current-block" style={{ '--mood-color': hexToRgba(info.color, 0.28) }}>
            <WeatherIcon code={weather.current.code} size={80} />
            <div className="temp-main">
              <AnimatedTemp value={weather.current.temp} />
            </div>
            <div className="condition-label muted">{info.label}</div>
          </div>

          <div className="panel-section">
            <div className="section-label">Détails</div>
            <div className="stats-grid">
              <StatCard index={0} emoji="💧" label="Humidité" value={`${Math.round(weather.current.humidity)}%`} />
              <StatCard index={1} emoji="💨" label="Vent" value={`${Math.round(weather.current.windSpeed)} km/h`} />
              <StatCard index={2} emoji="🌡" label="Ressenti" value={`${Math.round(weather.current.feels)}°C`} />
              <StatCard index={3} emoji="🌧" label="Précip." value={`${weather.current.precip} mm`} />
              <StatCard index={4} emoji="👁" label="Visibilité" value={weather.current.visibility != null ? `${Math.round(weather.current.visibility / 1000)} km` : '—'} />
              <StatCard index={5} emoji="🧭" label="Direction" value={degToCompass(weather.current.windDir)} />
            </div>
          </div>

          {weather.daily && (
            <div className="panel-section">
              <div className="section-label">Prévisions 7 jours</div>
              <div className="forecast-row">
                {weather.daily.time.map((date, i) => {
                  const label = i === 0 ? 'Auj' : new Date(date).toLocaleDateString('fr-FR', { weekday: 'short' })
                  return (
                    <ForecastCard
                      key={date}
                      index={i}
                      label={label}
                      code={weather.daily.weather_code[i]}
                      max={weather.daily.temperature_2m_max[i]}
                      min={weather.daily.temperature_2m_min[i]}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {aq && (
            <div className="panel-section">
              <div className="section-label">Qualité de l'air</div>
              <div className="aqi-row">
                <div className="aqi-bar">
                  <div className="aqi-fill" style={{ width: `${Math.min((aqi / 300) * 100, 100)}%`, background: aq.color }} />
                </div>
                <span className="aqi-text">{aq.label} · IQA {aqi}</span>
              </div>
            </div>
          )}

          {weather.daily && (
            <div className="panel-section sun-row">
              <span>🌅 Lever {fmtTime(weather.daily.sunrise[0])}</span>
              <span>🌇 Coucher {fmtTime(weather.daily.sunset[0])}</span>
            </div>
          )}
        </>
      )}
    </aside>
  )
}

/* ----------------------------------------------------------------------- */
/* WeatherApp — racine, gestion Three.js + état global                    */
/* ----------------------------------------------------------------------- */

const THEMES = {
  dark: {
    canvasBg: 'radial-gradient(circle at 50% 35%, #0d1430 0%, #04060f 100%)',
    earthUrl: 'https://unpkg.com/three-globe/example/img/earth-night.jpg',
    atmosphereColor: [0.3, 0.6, 1.0],
    starsVisible: true,
  },
  light: {
    canvasBg: 'linear-gradient(180deg, #87CEEB 0%, #E0F0FF 100%)',
    earthUrl: 'https://unpkg.com/three-globe/example/img/earth-day.jpg',
    atmosphereColor: [0.5, 0.8, 1.0],
    starsVisible: false,
  },
}

const THREE_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
const BUMP_URL = 'https://unpkg.com/three-globe/example/img/earth-topology.png'
const SPEC_URL = 'https://unpkg.com/three-globe/example/img/earth-water.png'
const CLOUDS_URL = 'https://unpkg.com/three-globe/example/clouds/clouds.png'

function loadThreeScript() {
  if (window.THREE) return Promise.resolve(window.THREE)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${THREE_JS_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.THREE))
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.src = THREE_JS_URL
    script.async = true
    script.onload = () => resolve(window.THREE)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export default function WeatherApp() {
  const [theme, setTheme] = useState(() => localStorage.getItem('ww-theme') || 'dark')
  const [sceneReady, setSceneReady] = useState(false)
  const [city, setCity] = useState(null)
  const [weather, setWeather] = useState(null)
  const [aqi, setAqi] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [dragOffset, setDragOffset] = useState(0)

  const containerRef = useRef(null)
  const threeRef = useRef(null)
  const dragState = useRef({ dragging: false, startY: 0 })
  const requestIdRef = useRef(0)
  const markerLabelRef = useRef(null)

  /* ----- Three.js scene bootstrap ----- */

  useEffect(() => {
    let disposed = false

    async function boot() {
      const THREE = await loadThreeScript()
      if (disposed) return
      const container = containerRef.current
      const width = window.innerWidth
      const height = window.innerHeight

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
      camera.position.z = 2.8

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(width, height)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      container.appendChild(renderer.domElement)

      const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.6)
      sunLight.position.set(5, 3, 5)
      sunLight.castShadow = true
      scene.add(sunLight)

      const ambientLight = new THREE.AmbientLight(0x1a2744, 0.4)
      scene.add(ambientLight)

      const pointLight = new THREE.PointLight(0x0044aa, 0.2)
      pointLight.position.set(-5, -3, -5)
      scene.add(pointLight)

      const loader = new THREE.TextureLoader()
      loader.crossOrigin = 'anonymous'

      const [earthTexture, bumpTexture, specularTexture, cloudsTexture] = await Promise.all([
        loader.loadAsync(THEMES[theme].earthUrl),
        loader.loadAsync(BUMP_URL),
        loader.loadAsync(SPEC_URL),
        loader.loadAsync(CLOUDS_URL),
      ])
      if (disposed) return

      const globeGeo = new THREE.SphereGeometry(1, 64, 64)
      const globeMat = new THREE.MeshPhongMaterial({
        map: earthTexture,
        bumpMap: bumpTexture,
        bumpScale: 0.05,
        specularMap: specularTexture,
        specular: new THREE.Color(0x333333),
        shininess: 15,
      })
      const globe = new THREE.Mesh(globeGeo, globeMat)
      globe.castShadow = true
      globe.receiveShadow = true
      scene.add(globe)

      const cloudsGeo = new THREE.SphereGeometry(1.01, 64, 64)
      const cloudsMat = new THREE.MeshLambertMaterial({ map: cloudsTexture, transparent: true, opacity: 0.4, depthWrite: false })
      const clouds = new THREE.Mesh(cloudsGeo, cloudsMat)
      scene.add(clouds)

      const atmosphereUniforms = { uColor: { value: new THREE.Color(...THEMES[theme].atmosphereColor) } }
      const atmosphereMat = new THREE.ShaderMaterial({
        uniforms: atmosphereUniforms,
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
            gl_FragColor = vec4(uColor, 1.0) * intensity;
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
      })
      const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.08, 64, 64), atmosphereMat)
      scene.add(atmosphere)

      const starPositions = []
      for (let i = 0; i < 15000; i++) {
        const t = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = 85 + Math.random() * 10
        starPositions.push(r * Math.sin(phi) * Math.cos(t), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(t))
      }
      const starsGeo = new THREE.BufferGeometry()
      starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
      const starsMat = new THREE.PointsMaterial({ size: 0.15, color: 0xffffff, sizeAttenuation: true })
      const stars = new THREE.Points(starsGeo, starsMat)
      stars.visible = THEMES[theme].starsVisible
      scene.add(stars)

      threeRef.current = {
        THREE,
        scene,
        camera,
        renderer,
        globe,
        clouds,
        atmosphere,
        atmosphereUniforms,
        stars,
        marker: null,
        autoRotate: true,
        viewOffsetOpen: false,
        container,
        loader,
      }

      const tmpVec = new THREE.Vector3()
      function animate() {
        const t = threeRef.current
        if (!t) return
        if (t.autoRotate) globe.rotation.y += 0.0006
        clouds.rotation.y += 0.0012
        const label = markerLabelRef.current
        if (t.marker) {
          const time = performance.now() / 1000
          const pulse = (Math.sin(time * 3) * 0.5 + 0.5)
          t.marker.ring.scale.setScalar(0.8 + pulse * 0.6)
          t.marker.ring.material.opacity = 0.3 + pulse * 0.7
          t.globe.updateMatrixWorld(true)
          t.marker.ring.lookAt(t.camera.position)

          if (label) {
            t.marker.dot.getWorldPosition(tmpVec)
            const dist = tmpVec.length()
            const facing = dist > 0 ? tmpVec.z / dist : 0
            if (facing > 0.08) {
              tmpVec.project(camera)
              const sx = (tmpVec.x * 0.5 + 0.5) * window.innerWidth
              const sy = (-tmpVec.y * 0.5 + 0.5) * window.innerHeight
              label.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -150%)`
              label.style.opacity = '1'
            } else {
              label.style.opacity = '0'
            }
          }
        } else if (label) {
          label.style.opacity = '0'
        }
        renderer.render(scene, camera)
        t.rafId = requestAnimationFrame(animate)
      }
      animate()
      setSceneReady(true)
    }

    boot().catch(() => setToast({ message: 'Impossible de charger le globe 3D.', type: 'error' }))

    function handleResize() {
      const t = threeRef.current
      if (!t) return
      const w = window.innerWidth
      const h = window.innerHeight
      t.camera.aspect = w / h
      t.renderer.setSize(w, h)
      if (t.viewOffsetOpen) {
        t.camera.setViewOffset(w, h, -160, 0, w, h)
      } else {
        t.camera.clearViewOffset()
      }
      t.camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', handleResize)
      const t = threeRef.current
      if (t) {
        cancelAnimationFrame(t.rafId)
        t.renderer.dispose()
        if (t.renderer.domElement.parentNode) t.renderer.domElement.parentNode.removeChild(t.renderer.domElement)
      }
      threeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ----- Theme switching (textures + atmosphere + stars) ----- */

  useEffect(() => {
    localStorage.setItem('ww-theme', theme)
    if (!sceneReady) return
    const t = threeRef.current
    if (!t) return
    const conf = THEMES[theme]
    t.loader.loadAsync(conf.earthUrl).then((tex) => {
      t.globe.material.map = tex
      t.globe.material.needsUpdate = true
    })
    t.atmosphereUniforms.uColor.value.setRGB(...conf.atmosphereColor)
    t.stars.visible = conf.starsVisible
  }, [theme, sceneReady])

  /* ----- Globe interaction helpers ----- */

  const rotateGlobeTo = useCallback((lat, lon) => {
    const t = threeRef.current
    if (!t) return
    const { THREE, globe } = t
    const targetLocal = latLonToVector3(lat, lon, 1)
    const targetVec = new THREE.Vector3(targetLocal.x, targetLocal.y, targetLocal.z).normalize()
    const destQuat = new THREE.Quaternion().setFromUnitVectors(targetVec, new THREE.Vector3(0, 0, 1))
    const startQuat = globe.quaternion.clone()
    t.autoRotate = false
    const totalFrames = 120
    let frame = 0
    function step() {
      frame += 1
      const lt = Math.min(frame / totalFrames, 1)
      const eased = easeInOutCubic(lt)
      globe.quaternion.copy(startQuat).slerp(destQuat, eased)
      if (lt < 1) requestAnimationFrame(step)
      else t.autoRotate = true
    }
    step()
  }, [])

  const animateCameraZ = useCallback((targetZ, frames) => {
    const t = threeRef.current
    if (!t) return
    const camera = t.camera
    const startZ = camera.position.z
    let frame = 0
    function step() {
      frame += 1
      const lt = Math.min(frame / frames, 1)
      const eased = easeInOutCubic(lt)
      camera.position.z = startZ + (targetZ - startZ) * eased
      if (lt < 1) requestAnimationFrame(step)
    }
    step()
  }, [])

  const applyViewOffset = useCallback((open) => {
    const t = threeRef.current
    if (!t) return
    t.viewOffsetOpen = open
    const w = window.innerWidth
    const h = window.innerHeight
    if (open) t.camera.setViewOffset(w, h, -160, 0, w, h)
    else t.camera.clearViewOffset()
    t.camera.updateProjectionMatrix()
  }, [])

  const addMarker = useCallback((lat, lon) => {
    const t = threeRef.current
    if (!t) return
    const { THREE, globe } = t
    if (t.marker) {
      globe.remove(t.marker.ring)
      globe.remove(t.marker.dot)
      t.marker.ring.geometry.dispose()
      t.marker.ring.material.dispose()
      t.marker.dot.geometry.dispose()
      t.marker.dot.material.dispose()
    }
    const ringGeo = new THREE.RingGeometry(0.01, 0.025, 32)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, side: THREE.DoubleSide, opacity: 1 })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    const dotGeo = new THREE.SphereGeometry(0.008, 8, 8)
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const dot = new THREE.Mesh(dotGeo, dotMat)
    const pos = latLonToVector3(lat, lon, 1.01)
    ring.position.set(pos.x, pos.y, pos.z)
    dot.position.set(pos.x, pos.y, pos.z)
    globe.add(ring)
    globe.add(dot)
    t.marker = { ring, dot }
  }, [])

  const removeMarker = useCallback(() => {
    const t = threeRef.current
    if (!t || !t.marker) return
    t.globe.remove(t.marker.ring)
    t.globe.remove(t.marker.dot)
    t.marker.ring.geometry.dispose()
    t.marker.ring.material.dispose()
    t.marker.dot.geometry.dispose()
    t.marker.dot.material.dispose()
    t.marker = null
  }, [])

  /* ----- City selection flow ----- */

  const loadWeatherFor = useCallback(async (lat, lon, requestId) => {
    setLoading(true)
    setError(null)
    try {
      const [weatherData, aqiValue] = await Promise.all([fetchWeatherApi(lat, lon), fetchAirQuality(lat, lon)])
      if (requestIdRef.current !== requestId) return
      setWeather(weatherData)
      setAqi(aqiValue)
    } catch {
      if (requestIdRef.current !== requestId) return
      setError('Impossible de récupérer la météo. Vérifiez votre connexion et réessayez.')
      setToast({ message: 'Erreur lors de la récupération de la météo.', type: 'error' })
    } finally {
      if (requestIdRef.current === requestId) setLoading(false)
    }
  }, [])

  const openCity = useCallback(
    (loc) => {
      const requestId = ++requestIdRef.current
      setCity(loc)
      setWeather(null)
      setAqi(null)
      setPanelOpen(true)
      rotateGlobeTo(loc.lat, loc.lon)
      addMarker(loc.lat, loc.lon)
      animateCameraZ(1.7, 100)
      applyViewOffset(true)
      loadWeatherFor(loc.lat, loc.lon, requestId)
    },
    [rotateGlobeTo, addMarker, animateCameraZ, applyViewOffset, loadWeatherFor]
  )

  const selectFromSearch = useCallback((item) => openCity(item), [openCity])

  const selectFromGlobeClick = useCallback(
    async (lat, lon) => {
      const requestId = ++requestIdRef.current
      setCity({ lat, lon, name: 'Recherche...', region: '', country: '', countryCode: '' })
      setWeather(null)
      setAqi(null)
      setPanelOpen(true)
      rotateGlobeTo(lat, lon)
      addMarker(lat, lon)
      animateCameraZ(1.7, 100)
      applyViewOffset(true)
      try {
        const addr = await reverseGeocode(lat, lon)
        if (requestIdRef.current === requestId) setCity({ lat, lon, ...addr })
      } catch {
        if (requestIdRef.current === requestId) setCity({ lat, lon, name: 'Position sélectionnée', region: '', country: '', countryCode: '' })
      }
      loadWeatherFor(lat, lon, requestId)
    },
    [rotateGlobeTo, addMarker, animateCameraZ, applyViewOffset, loadWeatherFor]
  )

  const handleCanvasClick = useCallback(
    (e) => {
      const t = threeRef.current
      if (!t) return
      const { THREE, camera, globe } = t
      const rect = t.renderer.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObject(globe, false)
      if (hits.length === 0) return
      const worldPoint = hits[0].point.clone()
      const localPoint = globe.worldToLocal(worldPoint)
      const { lat, lon } = vectorToLatLon(localPoint)
      selectFromGlobeClick(lat, lon)
    },
    [selectFromGlobeClick]
  )

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setDragOffset(0)
    animateCameraZ(2.8, 80)
    applyViewOffset(false)
    removeMarker()
    requestIdRef.current += 1
    setTimeout(() => {
      setCity(null)
      setWeather(null)
      setAqi(null)
      setError(null)
    }, 420)
  }, [animateCameraZ, applyViewOffset, removeMarker])

  /* ----- Mobile drag-to-dismiss ----- */

  function handleHandleDown(e) {
    e.target.setPointerCapture?.(e.pointerId)
    dragState.current = { dragging: true, startY: e.clientY }
  }
  function handleHandleMove(e) {
    if (!dragState.current.dragging) return
    const dy = Math.max(0, e.clientY - dragState.current.startY)
    setDragOffset(dy)
  }
  function handleHandleUp() {
    if (dragState.current.dragging && dragOffset > 80) {
      closePanel()
    } else {
      setDragOffset(0)
    }
    dragState.current.dragging = false
  }

  /* ----- Toast auto-dismiss ----- */

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  return (
    <div className="weather-app" data-theme={theme} style={{ background: THEMES[theme].canvasBg }}>
      <style>{STYLES}</style>
      <div ref={containerRef} className={`globe-host ${sceneReady ? 'ready' : ''}`} onClick={handleCanvasClick} />

      <div ref={markerLabelRef} className="globe-label" aria-hidden="true">
        {city && city.name !== 'Recherche...' ? city.name : ''}
      </div>

      <div className={`boot-overlay ${sceneReady ? 'hidden' : ''}`} aria-hidden={sceneReady}>
        <div className="boot-spinner" />
        <p>Chargement du globe…</p>
      </div>

      {sceneReady && !city && (
        <div className="idle-hint">🌍 Cliquez sur le globe ou recherchez une ville</div>
      )}

      <header className="app-header">
        <div className="brand">
          <LogoMark />
          <span className="brand-name">WeatherWorld</span>
        </div>
        <SearchBar onSelect={selectFromSearch} disabled={loading} />
        <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      </header>

      <WeatherPanel
        open={panelOpen}
        city={city}
        weather={weather}
        aqi={aqi}
        loading={loading}
        error={error}
        dragOffset={dragOffset}
        onClose={closePanel}
        onHandleDown={handleHandleDown}
        onHandleMove={handleHandleMove}
        onHandleUp={handleHandleUp}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}

/* ----------------------------------------------------------------------- */
/* Styles                                                                  */
/* ----------------------------------------------------------------------- */

const STYLES = `
.weather-app[data-theme="dark"] {
  --header-bg: rgba(8, 12, 28, 0.75);
  --panel-bg: rgba(6, 10, 26, 0.88);
  --card-bg: rgba(255, 255, 255, 0.06);
  --text: #f1f5f9;
  --muted: rgba(255,255,255,0.5);
  --border: rgba(255,255,255,0.1);
  --accent: #4fc3f7;
  --dropdown-bg: rgba(8, 12, 35, 0.97);
}
.weather-app[data-theme="light"] {
  --header-bg: rgba(235, 245, 255, 0.88);
  --panel-bg: rgba(255, 255, 255, 0.92);
  --card-bg: rgba(0, 100, 200, 0.06);
  --text: #0a1628;
  --muted: #4a6080;
  --border: rgba(0, 100, 200, 0.12);
  --accent: #1e88e5;
  --dropdown-bg: rgba(255, 255, 255, 0.98);
}

.weather-app { position: relative; width: 100%; height: 100vh; overflow: hidden; color: var(--text); transition: background 0.5s ease; }
.weather-app * { box-sizing: border-box; }
.globe-host { position: absolute; inset: 0; z-index: 0; cursor: pointer; opacity: 0; transition: opacity 0.8s ease; }
.globe-host.ready { opacity: 1; }
.globe-host canvas { display: block; }

.globe-label {
  position: fixed; left: 0; top: 0; z-index: 4; pointer-events: none; opacity: 0;
  padding: 5px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600; white-space: nowrap;
  background: rgba(8,12,28,0.78); backdrop-filter: blur(10px); border: 1px solid rgba(79,195,247,0.35);
  color: #e6f7ff; box-shadow: 0 6px 18px rgba(0,0,0,0.35); transition: opacity 0.25s ease;
}
.weather-app[data-theme="light"] .globe-label { background: rgba(255,255,255,0.92); color: #0a1628; }

.boot-overlay {
  position: fixed; inset: 0; z-index: 6; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 16px; color: var(--text); transition: opacity 0.6s ease, visibility 0.6s;
}
.boot-overlay.hidden { opacity: 0; visibility: hidden; pointer-events: none; }
.boot-overlay p { font-size: 13px; color: var(--muted); letter-spacing: 0.04em; }
.boot-spinner {
  width: 40px; height: 40px; border-radius: 50%; border: 3px solid rgba(79,195,247,0.2);
  border-top-color: var(--accent); animation: spin 0.9s linear infinite;
}

.idle-hint {
  position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 40;
  padding: 10px 20px; border-radius: 999px; font-size: 13px; color: var(--text);
  background: var(--header-bg); backdrop-filter: blur(16px); border: 1px solid var(--border);
  animation: fadeIn 0.6s ease both; pointer-events: none; white-space: nowrap;
}

/* ---------- Header ---------- */
.app-header {
  position: fixed; top: 0; left: 0; right: 0; height: 60px; z-index: 100;
  display: flex; align-items: center; gap: 18px; padding: 0 22px;
  background: var(--header-bg); backdrop-filter: blur(24px) saturate(180%);
  border-bottom: 1px solid var(--border);
}
.brand { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.logo-mark { display: block; flex-shrink: 0; filter: drop-shadow(0 2px 8px rgba(79,195,247,0.45)); }
.logo-orbit { transform-box: fill-box; transform-origin: center; animation: spin 7s linear infinite; }
.brand-name {
  font-family: 'Orbitron', sans-serif; font-size: 19px; font-weight: 700; letter-spacing: 0.01em;
  background: linear-gradient(135deg, #9fe7ff, #4fc3f7 45%, #1e88e5);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

/* ---------- Search ---------- */
.search-bar-wrap { flex: 1; display: flex; justify-content: center; }
.search-inner { position: relative; width: 420px; max-width: 100%; }
.search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; z-index: 1; }
.search-input {
  width: 100%; padding: 10px 42px 10px 42px; border-radius: 24px;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
  color: var(--text); font-size: 14px; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
}
.weather-app[data-theme="light"] .search-input { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.12); }
.search-input::placeholder { color: var(--muted); }
.search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,195,247,0.18); }
.search-input:disabled { opacity: 0.6; cursor: not-allowed; }
.search-clear {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  width: 22px; height: 22px; border-radius: 50%; border: none; background: rgba(255,255,255,0.12);
  color: var(--text); font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.search-clear:hover { background: rgba(255,255,255,0.22); }
.search-spinner {
  position: absolute; right: 16px; top: 50%; width: 14px; height: 14px; margin-top: -7px;
  border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite;
}

.search-dropdown {
  position: absolute; top: calc(100% + 8px); width: 100%;
  background: var(--dropdown-bg); backdrop-filter: blur(20px); border: 1px solid var(--border);
  border-radius: 16px; list-style: none; margin: 0; padding: 4px; overflow: hidden; max-height: 320px; overflow-y: auto;
  box-shadow: 0 16px 40px rgba(0,0,0,0.4); z-index: 110;
  scrollbar-width: thin; scrollbar-color: rgba(79,195,247,0.35) transparent;
}
.search-dropdown::-webkit-scrollbar { width: 6px; }
.search-dropdown::-webkit-scrollbar-track { background: transparent; }
.search-dropdown::-webkit-scrollbar-thumb { background: rgba(79,195,247,0.3); border-radius: 999px; }
.search-dropdown li {
  display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px;
  border-radius: 12px; cursor: pointer; font-size: 13.5px; color: var(--text);
  animation: fadeInUp 0.25s ease both;
}
.search-dropdown li.active, .search-dropdown li:hover { background: rgba(79,195,247,0.12); }
.search-dropdown li.active .result-name, .search-dropdown li:hover .result-name { color: var(--accent); }
.result-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-country { font-size: 12px; flex-shrink: 0; }
.search-empty { cursor: default; color: var(--muted); justify-content: center; }
.pin { font-size: 16px; }

/* ---------- Theme toggle ---------- */
.theme-toggle {
  width: 40px; height: 40px; border-radius: 50%; border: none; flex-shrink: 0;
  background: rgba(255,255,255,0.1); color: var(--text); font-size: 18px; cursor: pointer;
  transition: all 0.3s; display: flex; align-items: center; justify-content: center;
}
.theme-toggle:hover { background: rgba(255,255,255,0.18); transform: scale(1.05); }

/* ---------- Weather panel ---------- */
.weather-panel {
  position: fixed; top: 0; right: 0; height: 100vh; width: 340px; z-index: 90;
  background: var(--panel-bg); backdrop-filter: blur(32px) saturate(150%);
  border-left: 1px solid rgba(79,195,247,0.15);
  box-shadow: -24px 0 60px rgba(0,0,0,0.35);
  transform: translateX(100%); transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
  overflow-y: auto; padding: 82px 20px 32px;
  scrollbar-width: thin; scrollbar-color: rgba(79,195,247,0.35) transparent;
}
.weather-panel::-webkit-scrollbar { width: 6px; }
.weather-panel::-webkit-scrollbar-track { background: transparent; }
.weather-panel::-webkit-scrollbar-thumb { background: rgba(79,195,247,0.3); border-radius: 999px; }
.weather-panel::-webkit-scrollbar-thumb:hover { background: rgba(79,195,247,0.5); }
.weather-panel.open { transform: translateX(0); }
.panel-handle { display: none; }
.panel-close {
  position: absolute; top: 72px; right: 16px; width: 30px; height: 30px; border-radius: 50%;
  background: none; border: none; color: var(--muted); font-size: 14px; cursor: pointer; z-index: 5;
  display: flex; align-items: center; justify-content: center; transition: background 0.2s, color 0.2s;
}
.panel-close:hover { background: rgba(255,255,255,0.1); color: var(--text); }

.panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 0 26px 18px 0; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
.panel-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.flag-emoji { font-size: 26px; line-height: 1; flex-shrink: 0; }
.city-name { font-size: 20px; font-weight: 700; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; }
.panel-clock { font-size: 12.5px; white-space: nowrap; padding-top: 4px; }
.weekday { text-transform: capitalize; }

.current-block {
  text-align: center; padding: 22px 10px 24px; border-radius: 20px; margin-bottom: 8px;
  background: radial-gradient(circle at 50% 0%, var(--mood-color, transparent) 0%, transparent 70%);
}
.temp-main {
  font-size: 66px; font-weight: 200; line-height: 1;
  background: linear-gradient(180deg, var(--text), var(--accent));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.condition-label { font-size: 14px; margin-top: 6px; }

.panel-section { margin-top: 14px; }
.section-label { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--text); opacity: 0.75; margin: 0 0 12px; }

.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; transition: transform 0.2s, border-color 0.2s; }
.stat-card:hover { transform: translateY(-2px); border-color: rgba(79,195,247,0.3); }
.stat-label { font-size: 12.5px; color: var(--muted); }
.stat-value { font-size: 21px; font-weight: 600; }

.forecast-row {
  display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;
  -webkit-mask-image: linear-gradient(to right, black 92%, transparent 100%);
  mask-image: linear-gradient(to right, black 92%, transparent 100%);
}
.stagger-in { animation: fadeInUp 0.4s ease both; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.forecast-card {
  flex: 0 0 auto; width: 76px; background: rgba(255,255,255,0.05); border: 1px solid var(--border);
  border-radius: 14px; padding: 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 6px;
  transition: transform 0.2s, border-color 0.2s;
}
.forecast-card:hover { transform: translateY(-2px); border-color: rgba(79,195,247,0.3); }
.weather-app[data-theme="light"] .forecast-card { background: rgba(0,100,200,0.05); }
.forecast-day { font-size: 11.5px; color: var(--muted); text-transform: capitalize; font-weight: 500; }
.forecast-max { font-size: 14.5px; font-weight: 700; }
.forecast-min { font-size: 12px; color: var(--muted); }

.aqi-row {
  display: flex; align-items: center; gap: 12px; background: var(--card-bg); border: 1px solid var(--border);
  border-radius: 16px; padding: 14px 16px;
}
.aqi-bar { flex: 1; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
.aqi-fill { height: 100%; border-radius: 999px; transition: width 0.6s ease; }
.aqi-text { font-size: 12px; color: var(--muted); white-space: nowrap; }

.sun-row {
  display: flex; justify-content: space-between; font-size: 13px; color: var(--muted);
  background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 14px 16px;
}

.error-card { text-align: center; padding: 50px 10px; color: var(--muted); }
.error-icon { font-size: 32px; display: block; margin-bottom: 10px; }

.skeleton { padding-top: 30px; }
.sk { background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.05) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 12px; }
.sk-icon { width: 80px; height: 80px; margin: 0 auto 18px; border-radius: 50%; }
.sk-temp { width: 50%; height: 48px; margin: 0 auto 22px; }
.sk-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sk-box { height: 64px; }
.sk-name-line { display: inline-block; width: 130px; height: 18px; vertical-align: middle; }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

/* ---------- Weather icon animations ---------- */
.weather-icon { display: block; }
.wi-sun { transform-box: fill-box; transform-origin: center; animation: spin 8s linear infinite; }
.wi-cloud { animation: float 3s ease-in-out infinite; }
.wi-fog { opacity: 0.5; animation: fadeInOut 2s ease-in-out infinite alternate; }
.wi-drop { animation: fall 1s ease-in infinite; opacity: 0; }
.wi-flake { animation: snowDrift 2s ease-in-out infinite; opacity: 0.9; }
.wi-flash { animation: flash 1.5s ease-in-out infinite; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes fadeInOut { 0%, 100% { opacity: 0.3 } 50% { opacity: 1 } }
@keyframes fall { 0% { transform: translateY(-10px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(20px); opacity: 0; } }
@keyframes snowDrift { 0% { transform: translate(0,0) rotate(0deg); opacity: 0.9 } 100% { transform: translate(5px, 20px) rotate(180deg); opacity: 0.2 } }
@keyframes flash { 0%, 90%, 100% { opacity: 1; } 92%, 96% { opacity: 0.1; } }

/* ---------- Toast ---------- */
.toast {
  position: fixed; top: 76px; left: 50%; transform: translateX(-50%); z-index: 200;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 40px 12px 16px; border-radius: 14px; font-size: 13.5px; backdrop-filter: blur(16px);
  animation: fadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; box-shadow: 0 14px 34px rgba(0,0,0,0.4); cursor: pointer;
}
.toast-icon { font-size: 15px; flex-shrink: 0; }
.toast-error { background: rgba(60, 16, 20, 0.92); color: #fee2e2; border: 1px solid rgba(248,113,113,0.4); }
.toast-close { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 11px; opacity: 0.7; }
@keyframes fadeIn { from { opacity: 0; transform: translate(-50%, -10px); } to { opacity: 1; transform: translate(-50%, 0); } }

@media (prefers-reduced-motion: reduce) {
  .wi-sun, .wi-cloud, .wi-fog, .wi-drop, .wi-flake, .wi-flash, .boot-spinner, .search-spinner,
  .stagger-in, .idle-hint, .toast, .search-dropdown li { animation: none !important; }
}

.muted { color: var(--muted); }

/* ---------- Responsive ---------- */
@media (max-width: 1200px) and (min-width: 769px) {
  .weather-panel { width: 300px; }
  .search-inner { width: 320px; }
}

@media (max-width: 768px) {
  .app-header { flex-wrap: wrap; height: auto; padding: 10px 16px; gap: 8px; }
  .search-bar-wrap { order: 3; flex-basis: 100%; }
  .search-inner { width: 100%; }
  .toast { top: 108px; max-width: calc(100% - 32px); }

  .weather-panel {
    top: auto; bottom: 0; left: 0; right: 0; width: 100%; height: 60vh;
    border-radius: 20px 20px 0 0; border-left: none; border-top: 1px solid rgba(79,195,247,0.15);
    transform: translateY(100%); transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
    padding: 28px 20px 32px;
  }
  .weather-panel.open { transform: translateY(0); }
  .panel-close { top: 16px; }
  .panel-handle {
    display: block; width: 40px; height: 4px; border-radius: 999px; background: var(--muted);
    margin: 0 auto 14px; opacity: 0.4; touch-action: none;
  }
}
`
