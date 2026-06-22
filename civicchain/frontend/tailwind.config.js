export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0A0F1E",
        panel: "#111827",
        cyan: "#00D4FF",
        success: "#00FF88",
        danger: "#FF4444",
      },
      boxShadow: {
        glow: "0 0 30px rgba(0, 212, 255, 0.18)",
      },
    },
  },
  plugins: [],
};
