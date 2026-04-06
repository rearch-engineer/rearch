import React from 'react';
import './WeatherCard.css';

const WeatherCard = ({ toolInvocation }) => {
  const { args, result, state } = toolInvocation;

  const getWeatherEmoji = (condition) => {
    const emojiMap = {
      'sunny': '☀️',
      'cloudy': '☁️',
      'rainy': '🌧️',
      'snowy': '❄️',
      'partly cloudy': '⛅'
    };
    return emojiMap[condition] || '🌤️';
  };

  const getTemperatureColor = (temp) => {
    if (temp < 10) return '#6eb5ff';
    if (temp < 20) return '#7dd3c0';
    if (temp < 30) return '#ffa94d';
    return '#ff6b6b';
  };

  if (state === 'call') {
    return (
      <div className="weather-card loading">
        <div className="weather-header">
          <span className="tool-icon">🔧</span>
          <span>Getting weather for {args.location}...</span>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="weather-card error">
        <div className="weather-header">
          <span className="tool-icon">❌</span>
          <span>Failed to get weather data</span>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="weather-card">
      <div className="weather-header">
        <span className="tool-icon">🌍</span>
        <span className="location">{result.location}</span>
      </div>
      <div className="weather-content">
        <div className="weather-main">
          <span className="weather-emoji">{getWeatherEmoji(result.condition)}</span>
          <div className="temperature" style={{ color: getTemperatureColor(result.temperature) }}>
            {result.temperature}°C
          </div>
        </div>
        <div className="weather-condition">{result.condition}</div>
        <div className="weather-details">
          <div className="weather-detail">
            <span className="detail-icon">💧</span>
            <span>{result.humidity}%</span>
          </div>
          <div className="weather-detail">
            <span className="detail-icon">💨</span>
            <span>{result.windSpeed} km/h</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherCard;
