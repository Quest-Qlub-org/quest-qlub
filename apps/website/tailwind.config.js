const brandAmber = {
  50: "#fdf8f3",
  100: "#f7ebe0",
  200: "#edd5be",
  300: "#dfb692",
  400: "#cf9665",
  500: "#bf783a",
  600: "#bf783a",
  700: "#9e5f2b",
  800: "#7f4b22",
  900: "#663d1d",
  950: "#371f0e",
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        blue: brandAmber,
        brand: brandAmber,
      },
    },
  },
  plugins: [],
};
