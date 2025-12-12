
import { WeatherData } from '../types';

// Map WMO Weather Codes to descriptions
const getWeatherDescription = (code: number): string => {
  const codes: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return codes[code] || 'Unknown';
};

export const fetchWeatherData = async (lat: number, lon: number): Promise<WeatherData | null> => {
  try {
    // 1. Fetch Weather (Short timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=kn`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!weatherRes.ok) throw new Error('Weather API failed');

    const weatherData = await weatherRes.json();
    
    // SAFETY CHECK: Ensure data exists before accessing properties
    if (!weatherData || !weatherData.current) {
        return null;
    }
    
    const current = weatherData.current;

    // 2. Reverse Geocode for Location Name (Using OpenStreetMap Nominatim)
    // We treat this as optional. If it fails, we default to coordinates.
    let locationName = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    try {
      const geoController = new AbortController();
      const geoTimeout = setTimeout(() => geoController.abort(), 4000);

      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`,
        { signal: geoController.signal }
      );
      clearTimeout(geoTimeout);

      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData && geoData.address) {
            // Prioritize: City -> Town -> Village -> County -> Display Name
            locationName = geoData.address.city || 
                        geoData.address.town || 
                        geoData.address.village || 
                        geoData.address.county || 
                        geoData.address.state ||
                        locationName;
        }
      }
    } catch (e) {
      // Non-fatal error
    }

    return {
      temperature: current.temperature_2m ?? 0,
      windSpeed: current.wind_speed_10m ?? 0,
      condition: getWeatherDescription(current.weather_code ?? 0),
      unit: 'F',
      location: locationName
    };
  } catch (error) {
    // Fail silently to prevent app crash
    return null;
  }
};
