/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ParkQuest Forest palette — mirrors globals.css design tokens
        bg:          '#F2EBDB',
        surface:     '#FFFBF1',
        'surface-alt': '#F7F0DE',
        ink:         '#1B1A16',
        'ink-soft':  '#3C3A33',
        'ink-mute':  '#7A746A',
        primary:     '#1F3D2E',
        'primary-deep': '#152A20',
        accent:      '#C56B3D',
        'accent-2':  '#D89A3A',
        visited:     '#2F7A4A',
        bucket:      '#D89A3A',
        unvisited:   '#A8A29A',
        // Badge tiers
        'tier-bronze':    '#B27339',
        'tier-silver':    '#A8A39B',
        'tier-gold':      '#D4A93F',
        'tier-platinum':  '#6E97A3',
        'tier-legendary': '#8B5DBF',
      },
    },
  },
  plugins: [],
};
