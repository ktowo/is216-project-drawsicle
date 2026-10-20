// Files in client/public, addressed from the site's base path: '/demo-art/x.jpg' becomes
// '/is216-project-drawsicle/demo-art/x.jpg' on GitHub Pages and stays '/demo-art/x.jpg' elsewhere.
export const sitePath = (path) => (String(path).startsWith('/') ? `${import.meta.env.BASE_URL}${String(path).slice(1)}` : path);
