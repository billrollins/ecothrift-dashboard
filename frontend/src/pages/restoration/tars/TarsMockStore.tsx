import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { TARS_GRADE_SCALES } from './tarsConstants';
import { costField, knownCost } from './tarsCostUtils';
import {
  canSendItem,
  createInitialMockItems,
  emptyValuesForScale,
  evaluatePaths,
  itemNeedsSetup,
  syncPathValuesFromGrades,
} from './tarsProfit';
import type {
  TarsCostField,
  TarsItem,
  TarsPath,
  TarsStage,
  TarsVerb,
} from './tarsTypes';
import { TARS_DEFAULT_HOURLY_RATE, TARS_DEFAULT_TIME_PREMIUM } from './tarsConstants';

interface TarsMockStoreValue {
  items: TarsItem[];
  scales: Record<string, string[]>;
  mruScales: string[];
  selectedIntakeSku: string | null;
  setSelectedIntakeSku: (sku: string | null) => void;
  activeBenchSku: string | null;
  setActiveBenchSku: (sku: string | null) => void;
  intakeScanInput: string;
  setIntakeScanInput: (v: string) => void;
  benchScanInput: string;
  setBenchScanInput: (v: string) => void;
  selectedPathBySku: Record<string, number>;
  hourlyRate: number;
  timePremium: number;
  setScale: (sku: string, scale: string) => void;
  setRetail: (sku: string, grade: string, value: number) => void;
  sendToRestoration: (sku: string) => void;
  scanToAddQueue: () => void;
  scanIn: (sku: string) => void;
  scanNext: () => void;
  submitBenchScan: () => void;
  setPathCostField: (
    sku: string,
    pathIdx: number,
    field: 'parts' | 'hours' | 'value',
    cost: TarsCostField,
  ) => void;
  selectPath: (sku: string, pathIdx: number) => void;
  performPath: (sku: string, pathIdx: number) => void;
  completeJob: (sku: string) => void;
  intakeItems: TarsItem[];
  sentItems: TarsItem[];
  benchItems: TarsItem[];
  executingItems: TarsItem[];
  getItem: (sku: string) => TarsItem | undefined;
  evaluateItem: (sku: string) => ReturnType<typeof evaluatePaths> | null;
  itemNeedsSetup: (item: TarsItem) => boolean;
  lastPerformedSku: string | null;
  focusEvaluationItem: TarsItem | null;
}

const TarsMockContext = createContext<TarsMockStoreValue | null>(null);

const SCAN_ADD_CATALOG: Record<
  string,
  Pick<
    TarsItem,
    'name' | 'source' | 'category' | 'brand' | 'model' | 'upc' | 'productNumber' | 'condition' | 'retail' | 'price'
  > & { scale?: string }
> = {
  'ET-1001': {
    name: 'Mixer A',
    source: 'Target',
    category: 'Kitchen',
    productNumber: 'PRD-WS-1',
    upc: '111',
    condition: 'good',
    retail: 40,
    price: 15,
    scale: 'Functional',
  },
  'ET-1002': {
    name: 'Controller line 40',
    source: 'Amazon',
    category: 'Electronics',
    brand: 'Microsoft',
    retail: 49.99,
    price: 19.99,
    condition: 'good',
    scale: 'Functional',
  },
};

function defaultPathsForScale(scale: string, scales: Record<string, string[]>): TarsPath[] {
  const grades = scales[scale] ?? [];
  if (grades.length === 0) {
    return [
      {
        verb: 'Repair',
        grade: 'Working',
        parts: costField('unknown', 0),
        hours: costField('unknown', 0),
        value: costField('unknown', 0),
      },
    ];
  }
  const [primary, secondary] = grades;
  const paths: TarsPath[] = [];
  if (primary) {
    paths.push({
      verb: 'Repair',
      grade: primary,
      parts: costField('unknown', 0),
      hours: costField('unknown', 0),
      value: costField('unknown', 0),
    });
  }
  if (secondary) {
    paths.push({
      verb: 'As-is',
      grade: secondary,
      parts: costField('zero', 0),
      hours: costField('estimate', 0.1),
      value: costField('unknown', 0),
    });
  }
  return paths;
}

function updateItem(items: TarsItem[], sku: string, fn: (item: TarsItem) => TarsItem): TarsItem[] {
  return items.map((it) => (it.sku === sku ? fn({ ...it }) : it));
}

export function TarsMockProvider({ children }: { children: ReactNode }) {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const [items, setItems] = useState<TarsItem[]>(() => createInitialMockItems());
  const [scales] = useState<Record<string, string[]>>(() => ({ ...TARS_GRADE_SCALES }));
  const [mruScales, setMruScales] = useState<string[]>(['Functional', 'Completeness', 'Assembly']);
  const [lastPerformedSku, setLastPerformedSku] = useState<string | null>('TGT-4821');
  const [selectedIntakeSku, setSelectedIntakeSku] = useState<string | null>('TGT-9015');
  const [activeBenchSku, setActiveBenchSku] = useState<string | null>('TGT-4821');
  const [intakeScanInput, setIntakeScanInput] = useState('');
  const [benchScanInput, setBenchScanInput] = useState('');
  const [selectedPathBySku, setSelectedPathBySku] = useState<Record<string, number>>({});
  const [hourlyRate] = useState(TARS_DEFAULT_HOURLY_RATE);
  const [timePremium] = useState(TARS_DEFAULT_TIME_PREMIUM);

  const getItem = useCallback((sku: string) => items.find((i) => i.sku === sku), [items]);

  const needsSetup = useCallback(
    (item: TarsItem) => itemNeedsSetup(item, scales),
    [scales],
  );

  const setScale = useCallback(
    (sku: string, scale: string) => {
      setItems((prev) =>
        updateItem(prev, sku, (it) => {
          const values = emptyValuesForScale(scale, scales, it.values);
          const paths = defaultPathsForScale(scale, scales);
          return syncPathValuesFromGrades({ ...it, scale, values, paths });
        }),
      );
    },
    [scales],
  );

  const setRetail = useCallback((sku: string, grade: string, value: number) => {
    setItems((prev) =>
      updateItem(prev, sku, (it) => {
        const values = { ...it.values, [grade]: Number.isFinite(value) ? value : 0 };
        const paths = it.paths.map((p) =>
          p.grade === grade ? { ...p, value: knownCost(values[grade] ?? 0) } : p,
        );
        return { ...it, values, paths };
      }),
    );
  }, []);

  const sendToRestoration = useCallback(
    (sku: string) => {
      const item = items.find((i) => i.sku === sku);
      if (!item || !canSendItem(item, scales)) return;
      setItems((prev) => updateItem(prev, sku, (it) => ({ ...it, stage: 'sent' as TarsStage })));
      setMruScales((prev) => [item.scale, ...prev.filter((s) => s !== item.scale)].slice(0, 5));
      enqueueSnackbar(`${sku} sent to Restoration`, { variant: 'success' });
    },
    [items, scales, enqueueSnackbar],
  );

  const scanToAddQueue = useCallback(() => {
    const v = intakeScanInput.trim().toUpperCase();
    if (!v) {
      enqueueSnackbar('Scan or enter a SKU', { variant: 'warning' });
      return;
    }
    const existing = items.find((i) => i.sku.toUpperCase() === v);
    if (existing) {
      if (existing.stage === 'intake') {
        setSelectedIntakeSku(existing.sku);
        enqueueSnackbar(`${existing.sku} already in queue`, { variant: 'info' });
      } else {
        enqueueSnackbar(`${existing.sku} is already past intake`, { variant: 'warning' });
      }
      setIntakeScanInput('');
      return;
    }
    const template = SCAN_ADD_CATALOG[v];
    const scale = template?.scale ?? '';
    const newItem: TarsItem = {
      sku: v,
      name: template?.name ?? `Scanned item ${v}`,
      source: template?.source ?? 'Target',
      category: template?.category ?? 'General',
      brand: template?.brand,
      model: template?.model,
      upc: template?.upc,
      productNumber: template?.productNumber,
      condition: template?.condition,
      retail: template?.retail,
      price: template?.price,
      stage: 'intake',
      scale,
      values: scale ? emptyValuesForScale(scale, scales) : {},
      paths: defaultPathsForScale(scale, scales),
    };
    setItems((prev) => [...prev, syncPathValuesFromGrades(newItem)]);
    setSelectedIntakeSku(v);
    setIntakeScanInput('');
    enqueueSnackbar(`${v} added to queue`, { variant: 'success' });
  }, [intakeScanInput, items, scales, enqueueSnackbar]);

  const scanIn = useCallback(
    (sku: string) => {
      const item = items.find((i) => i.sku === sku);
      if (!item || item.stage !== 'sent') {
        enqueueSnackbar(item ? `${sku} is not in the send queue` : `Unknown SKU ${sku}`, {
          variant: 'warning',
        });
        return;
      }
      setItems((prev) => updateItem(prev, sku, (it) => ({ ...it, stage: 'workstation' as TarsStage })));
      setActiveBenchSku(sku);
      setBenchScanInput('');
      setMruScales((prev) => [item.scale, ...prev.filter((s) => s !== item.scale)].slice(0, 5));
      enqueueSnackbar(`${sku} checked in for evaluation`, { variant: 'info' });
    },
    [items, enqueueSnackbar],
  );

  const scanNext = useCallback(() => {
    const next = items.find((i) => i.stage === 'sent');
    if (next) scanIn(next.sku);
    else enqueueSnackbar('Nothing to check in', { variant: 'info' });
  }, [items, scanIn, enqueueSnackbar]);

  const submitBenchScan = useCallback(() => {
    const v = benchScanInput.trim().toUpperCase();
    const match = items.find((i) => i.stage === 'sent' && i.sku.toUpperCase() === v);
    if (match) scanIn(match.sku);
    else enqueueSnackbar(v ? `No sent item matching ${v}` : 'Enter a SKU', { variant: 'warning' });
  }, [benchScanInput, items, scanIn, enqueueSnackbar]);

  const setPathCostField = useCallback(
    (sku: string, pathIdx: number, field: 'parts' | 'hours' | 'value', cost: TarsCostField) => {
      setItems((prev) =>
        updateItem(prev, sku, (it) => ({
          ...it,
          paths: it.paths.map((p, i) => (i === pathIdx ? { ...p, [field]: cost } : p)),
          values:
            field === 'value' && cost.state !== 'unknown'
              ? {
                  ...it.values,
                  [it.paths[pathIdx].grade]: cost.amount,
                }
              : it.values,
        })),
      );
    },
    [],
  );

  const selectPath = useCallback((sku: string, pathIdx: number) => {
    setSelectedPathBySku((prev) => ({ ...prev, [sku]: pathIdx }));
  }, []);

  const performPath = useCallback(
    (sku: string, pathIdx: number) => {
      const item = items.find((i) => i.sku === sku);
      if (!item) return;
      const evalResult = evaluatePaths(item, pathIdx, hourlyRate, timePremium);
      const row = evalResult.rows[pathIdx];
      if (!row) return;

      setItems((prev) =>
        updateItem(prev, sku, (it) => ({
          ...it,
          stage: 'executing' as TarsStage,
          chosen: { verb: row.verb, grade: row.grade },
        })),
      );

      const nextBench = items.find((i) => i.stage === 'workstation' && i.sku !== sku);
      setActiveBenchSku(nextBench?.sku ?? null);
      setLastPerformedSku(sku);
      enqueueSnackbar(`Perform ${row.verb} → ${row.grade}`, { variant: 'success' });
      navigate('/restoration/tars');
    },
    [items, hourlyRate, timePremium, enqueueSnackbar, navigate],
  );

  const completeJob = useCallback(
    (sku: string) => {
      setItems((prev) => updateItem(prev, sku, (it) => ({ ...it, stage: 'done' as TarsStage })));
      enqueueSnackbar(`${sku} complete — ready for floor`, { variant: 'success' });
    },
    [enqueueSnackbar],
  );

  const intakeItems = useMemo(() => items.filter((i) => i.stage === 'intake'), [items]);
  const sentItems = useMemo(() => items.filter((i) => i.stage === 'sent'), [items]);
  const benchItems = useMemo(() => items.filter((i) => i.stage === 'workstation'), [items]);
  const executingItems = useMemo(() => items.filter((i) => i.stage === 'executing'), [items]);

  const evaluateItem = useCallback(
    (sku: string) => {
      const item = items.find((i) => i.sku === sku);
      if (!item) return null;
      return evaluatePaths(item, selectedPathBySku[sku], hourlyRate, timePremium);
    },
    [items, selectedPathBySku, hourlyRate, timePremium],
  );

  const focusEvaluationItem = useMemo(() => {
    if (lastPerformedSku) {
      const last = items.find((i) => i.sku === lastPerformedSku);
      if (last && (last.stage === 'executing' || last.stage === 'workstation')) return last;
    }
    return executingItems[0] ?? benchItems[0] ?? null;
  }, [items, lastPerformedSku, executingItems, benchItems]);

  const value: TarsMockStoreValue = {
    items,
    scales,
    mruScales,
    selectedIntakeSku,
    setSelectedIntakeSku,
    activeBenchSku,
    setActiveBenchSku,
    intakeScanInput,
    setIntakeScanInput,
    benchScanInput,
    setBenchScanInput,
    selectedPathBySku,
    hourlyRate,
    timePremium,
    setScale,
    setRetail,
    sendToRestoration,
    scanToAddQueue,
    scanIn,
    scanNext,
    submitBenchScan,
    setPathCostField,
    selectPath,
    performPath,
    completeJob,
    intakeItems,
    sentItems,
    benchItems,
    executingItems,
    getItem,
    evaluateItem,
    itemNeedsSetup: needsSetup,
    lastPerformedSku,
    focusEvaluationItem,
  };

  return <TarsMockContext.Provider value={value}>{children}</TarsMockContext.Provider>;
}

export function useTarsMock(): TarsMockStoreValue {
  const ctx = useContext(TarsMockContext);
  if (!ctx) throw new Error('useTarsMock must be used within TarsMockProvider');
  return ctx;
}

export type { TarsVerb };
