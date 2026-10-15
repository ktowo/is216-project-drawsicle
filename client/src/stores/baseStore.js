import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useBaseStore = defineStore('base', () => {
    const API_URL = `${window.location.origin}/api/`;

    return {API_URL}
})