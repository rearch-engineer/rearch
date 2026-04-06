import { tool } from 'ai';
import { z } from 'zod';

export const getWeather = tool({
  description: 'Get the current weather for a location',
  inputSchema: z.object({
    location: z.string().describe('The city name'),
  }),
  execute: async ({ location }) => {
    console.log(`Fetching weather for location: ${location}`);
    // Random weather conditions
    const conditions = ['sunny', 'cloudy', 'rainy', 'snowy', 'partly cloudy'];
    const temp = Math.floor(Math.random() * 35) + 5; // 5-40°C
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    
    return {
      location,
      temperature: temp,
      condition,
      humidity: Math.floor(Math.random() * 60) + 40, // 40-100%
      windSpeed: Math.floor(Math.random() * 30), // 0-30 km/h
    };
  }
});

export const metadata = {
  category: 'weather',
  description: 'Get current weather information for a specified location.',
};
