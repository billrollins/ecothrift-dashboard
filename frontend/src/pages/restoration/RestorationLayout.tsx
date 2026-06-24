import { Outlet } from 'react-router-dom';
import { TarsMockProvider } from './tars/TarsMockStore';

/** Shared mock state across Restoration routes (Queue + TARS). */
export default function RestorationLayout() {
  return (
    <TarsMockProvider>
      <Outlet />
    </TarsMockProvider>
  );
}
