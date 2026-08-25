import { Navigate, useSearchParams } from 'react-router-dom';
import { tarsStudioRedirectTarget } from './restorationRoutes';

/** Old TARS Studio bookmarks keep working after the studio left the sidebar. */
export default function TarsStudioRedirect() {
  const [params] = useSearchParams();
  return <Navigate to={tarsStudioRedirectTarget(params.get('job'), params.get('view'))} replace />;
}
