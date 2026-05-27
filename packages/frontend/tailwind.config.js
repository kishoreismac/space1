/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          s: '#2563eb', // Satisfaction
          p: '#16a34a', // Performance
          a: '#7c3aed', // Activity
          c: '#0891b2', // Collaboration
          e: '#ea580c', // Efficiency
        },
        band: {
          critical: '#dc2626',
          significant: '#f97316',
          moderate: '#eab308',
          healthy: '#22c55e',
          excellent: '#15803d',
        },
      },
    },
  },
  plugins: [],
};
