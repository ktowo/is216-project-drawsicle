import { createRouter, createWebHistory } from 'vue-router'

// Pageviews
import HomeView from '@/views/HomeView.vue';
import NotFoundPage from '@/views/NotFoundPage.vue';

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            component: HomeView
        },
        { 
			// Catch-all route for any unmatched paths
			path: '/:pathMatch(.*)*',
			component: NotFoundPage, 
		}
    ]
});

export default router;