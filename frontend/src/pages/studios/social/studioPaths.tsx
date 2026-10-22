/**
 * Where the Studio's pages live: in Dash (`/studios/social`, the desk) or in the Social Studio phone app (`/social`,
 * owner 2026-10-22, F7). The same pages serve both; the app's bottom bar replaces the Week / Photos buttons.
 */
import { createContext, useContext } from 'react';

export interface StudioPaths {
  inApp: boolean;
  week: string;
  photos: string;
  numbers: string;
  post: (id: number) => string;
}

export const DESK_PATHS: StudioPaths = {
  inApp: false,
  week: '/studios/social',
  photos: '/studios/social/photos',
  numbers: '/studios/social/numbers',
  post: (id) => `/studios/social/post/${id}`,
};

export const APP_PATHS: StudioPaths = {
  inApp: true,
  week: '/social/week',
  photos: '/social/photos',
  numbers: '/social/numbers',
  post: (id) => `/social/post/${id}`,
};

export const StudioPathsContext = createContext<StudioPaths>(DESK_PATHS);

export function useStudioPaths(): StudioPaths {
  return useContext(StudioPathsContext);
}
