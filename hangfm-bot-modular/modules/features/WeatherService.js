/**
 * WeatherService - OpenWeather API integration
 */
const axios = require('axios');

class WeatherService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiKey = config.openweatherApiKey;
    this.enabled = this.apiKey && this.apiKey !== 'your_openweather_key_here';
  }

  async getWeather(location) {
    if (!this.enabled) {
      return null;
    }

    try {
      const baseUrl = 'https://api.openweathermap.org/data/2.5';
      
      // Determine query type
      const isZipCode = /^\d{5}$/.test(location);
      const geoQuery = isZipCode ? `zip=${location},US` : `q=${encodeURIComponent(location)}`;
      
      // Get current weather
      const currentResponse = await axios.get(`${baseUrl}/weather?${geoQuery}&appid=${this.apiKey}&units=imperial`);
      const current = currentResponse.data;
      
      // Get forecast
      const lat = current.coord.lat;
      const lon = current.coord.lon;
      const forecastResponse = await axios.get(`${baseUrl}/forecast?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=imperial&cnt=40`);
      
      // Process daily forecasts
      const dailyForecasts = [];
      const processedDays = new Set();
      
      for (const item of forecastResponse.data.list) {
        const date = new Date(item.dt * 1000);
        const dayKey = date.toISOString().split('T')[0];
        const hour = date.getHours();
        
        if (!processedDays.has(dayKey) && hour >= 12 && hour <= 15) {
          dailyForecasts.push({
            date: date,
            temp: item.main.temp,
            description: item.weather[0].description,
            icon: item.weather[0].icon,
            humidity: item.main.humidity,
            windSpeed: item.wind.speed
          });
          processedDays.add(dayKey);
          
          if (dailyForecasts.length >= 5) break;
        }
      }
      
      return {
        location: `${current.name}, ${current.sys.country}`,
        current: {
          temp: current.main.temp,
          feelsLike: current.main.feels_like,
          tempMin: current.main.temp_min,
          tempMax: current.main.temp_max,
          humidity: current.main.humidity,
          windSpeed: current.wind.speed,
          description: current.weather[0].description,
          icon: current.weather[0].icon
        },
        forecast: dailyForecasts
      };
    } catch (error) {
      this.logger.error(`Weather API error: ${error.message}`);
      return null;
    }
  }

  formatWeatherReport(data, getRandomHolidayEmoji) {
    const { location, current, forecast } = data;
    const tempC = Math.round((current.temp - 32) * 5/9);
    const feelsLikeC = Math.round((current.feelsLike - 32) * 5/9);
    
    const getWeatherIcon = (iconCode) => {
      const iconMap = {
        '01d': '☀️', '01n': '🌙', '02d': '⛅', '02n': '☁️',
        '03d': '☁️', '03n': '☁️', '04d': '☁️', '04n': '☁️',
        '09d': '🌧️', '09n': '🌧️', '10d': '🌦️', '10n': '🌧️',
        '11d': '⛈️', '11n': '⛈️', '13d': '❄️', '13n': '❄️',
        '50d': '🌫️', '50n': '🌫️'
      };
      return iconMap[iconCode] || '🌤️';
    };
    
    const currentIcon = getWeatherIcon(current.icon);
    const headerEmoji = getRandomHolidayEmoji ? getRandomHolidayEmoji() : '🌤️';
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    let report = `${headerEmoji} **matt's Weather Report** - ${location}\n`;
    report += `${currentIcon} **${Math.round(current.temp)}°F** (${tempC}°C) - ${current.description} | Feels like ${Math.round(current.feelsLike)}°F\n`;
    report += `💧 ${current.humidity}% humidity | 💨 ${Math.round(current.windSpeed)} mph | 📈 ${Math.round(current.tempMax)}°F / 📉 ${Math.round(current.tempMin)}°F\n`;
    report += `📅 `;
    
    forecast.forEach((day, index) => {
      const dayName = daysOfWeek[day.date.getDay()];
      const dateStr = `${day.date.getMonth() + 1}/${day.date.getDate()}`;
      const dayIcon = getWeatherIcon(day.icon);
      
      if (index > 0) report += ` | `;
      report += `${dayIcon}${dayName} ${dateStr} ${Math.round(day.temp)}°F`;
    });
    
    report += `\n⚡ OpenWeather API`;
    
    return report;
  }
}

module.exports = WeatherService;
