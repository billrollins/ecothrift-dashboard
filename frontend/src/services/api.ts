/**
 * The host seam for the shared e-sign client (src/esign, from {master}/packages/esign; D22): it imports the signed-in
 * and the public axios clients from here. Both are Eco-Thrift's own (src/api/client.ts).
 */
import api, { apiPublic } from '../api/client';

export const publicApi = apiPublic;
export default api;
