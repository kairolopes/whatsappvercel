/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        wa: {
          primary: '#128C7E',
          secondary: '#25D366',
          dark: '#075E54',
          bg: '#EFEAE2',
          panel: '#F0F2F5',
          chat: '#FFEECD',
          header: '#F0F2F5',
          search: '#F0F2F5',
          text: '#111B21',
          muted: '#667781',
          border: '#E9EDEF'
        }
      },
      fontFamily: {
        sans: ['"Segoe UI"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
