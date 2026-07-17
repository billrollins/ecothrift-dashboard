# Frontend layering

- Vite port **5173**; proxy `/api` → `http://127.0.0.1:8000`
- Axios `baseURL: '/api'`
- Layers: **types → api → hooks → pages**
- React Query for server state; Context for auth only
- See `source_patterns/frontend/`
