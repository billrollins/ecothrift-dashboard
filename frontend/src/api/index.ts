/**
 * Eco-Thrift Dashboard API layer
 * Re-exports the configured client and all API modules
 */

export { default as api } from './client';
export * from './accounts.api';
export * from './hr.api';
export * from './inventory.api';
export * from './pos.api';
export * from './consignment.api';
export * from './core.api';
