import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useBaseStore = defineStore('base', () => {
    // API url
    let base_url = window.location.origin;
    base_url = base_url.includes('5173')? "http://localhost:8000" : base_url; // server on port 8000 if developer runs vite (5173) instead of vercel.
    const API_URL = `${base_url}/api/`;

    return {API_URL}
})