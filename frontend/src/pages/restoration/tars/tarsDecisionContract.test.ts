import { describe, expect, it } from 'vitest';
import contract from './tarsDecisionContract.json';
import { TARS_MANDATORY_STOP_OUTS, TARS_UNIVERSAL_TEST_CATALOG } from './tarsDecisionCatalog';
import {
  TARS_DECISION_EFFECTIVE_LABOR_RATE,
  TARS_MINIMUM_HANDLING_MINUTES,
} from './tarsDecisionEngine';
import { TARS_DECISION_CATALOG_VERSION, TARS_DECISION_SCHEMA_VERSION } from './tarsDecisionTypes';

/**
 * The server is the authority on what a decision may contain and what it earns.
 * This suite fails if the browser offers a test the server would reject, shows a
 * stop-out the server does not enforce, or prices labor differently. The mirror
 * of this file is apps/inventory/tests/test_tars_catalog_contract.py.
 */
describe('TARS decision contract', () => {
  it('uses the contract versions', () => {
    expect(TARS_DECISION_SCHEMA_VERSION).toBe(contract.schemaVersion);
    expect(TARS_DECISION_CATALOG_VERSION).toBe(contract.catalogVersion);
  });

  it('prices labor at the contract rate rather than deriving its own', () => {
    expect(TARS_DECISION_EFFECTIVE_LABOR_RATE).toBe(contract.effectiveLaborRate);
  });

  it('floors zero-work paths with the contract handling minutes', () => {
    expect(TARS_MINIMUM_HANDLING_MINUTES).toEqual(contract.minimumHandlingMinutes);
  });

  it('offers exactly the tests the server accepts', () => {
    const offered = TARS_UNIVERSAL_TEST_CATALOG.map((entry) => entry.id).sort();
    expect(offered).toEqual([...contract.testIds].sort());
  });

  it('enforces the same stop-out blocking rules as the server', () => {
    const normalize = (entry: {
      id: string;
      blocksAllSelections?: boolean;
      blockedActions?: readonly string[];
      blockedSaleStates?: readonly string[];
    }) => ({
      id: entry.id,
      blocksAllSelections: entry.blocksAllSelections === true,
      blockedActions: [...(entry.blockedActions ?? [])].sort(),
      blockedSaleStates: [...(entry.blockedSaleStates ?? [])].sort(),
    });
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

    expect(TARS_MANDATORY_STOP_OUTS.map(normalize).sort(byId)).toEqual(
      contract.stopOuts.map(normalize).sort(byId),
    );
  });
});
