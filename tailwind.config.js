/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./aprende.html",
        "./js/**/*.js",
    ],
    theme: {
        extend: {},
    },
    plugins: [],
    corePlugins: {
        preflight: false, // Desabilitar para evitar conflictos con Bootstrap
    },
}
