import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import { Box, Button, Typography } from '@mui/material';
import { getProducts } from '../../api/inventory.api';
import type { Product } from '../../types/inventory.types';
import { productManageCatalogSearchTerm, productSearchParams } from '../../utils/productCatalog';
import { ProcessingScanBar } from './processing/ProcessingScanBar';
import { CatalogFilterRow } from './manage/CatalogFilterRow';
import { ProductCatalogTable } from './manage/ProductCatalogTable';
import { ProductManagePanel } from './manage/ProductManageDrawer';

const PRODUCT_CATALOG_PAGE_SIZE = 200;

export default function ManageProductsPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editorActive, setEditorActive] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  const applyCatalogSearch = useCallback((raw: string) => {
    const q = raw.trim();
    setSearch(q);
    setDebouncedSearch(q);
  }, []);

  useEffect(() => {
    const q = (searchParams.get('q') || searchParams.get('search') || '').trim();
    if (q) applyCatalogSearch(q);
  }, [searchParams, applyCatalogSearch]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 450);
    return () => window.clearTimeout(t);
  }, [search]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (!value.trim()) setDebouncedSearch('');
  }, []);

  const handleSearchEnter = useCallback(() => {
    const q = search.trim();
    if (!q) return;
    setDebouncedSearch(q);
  }, [search]);

  const querySearch = debouncedSearch.trim();

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ['products', 'manage-catalog', querySearch],
    queryFn: async () => {
      const { data: page } = await getProducts({
        ...productSearchParams(querySearch, PRODUCT_CATALOG_PAGE_SIZE),
      });
      return page;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const products = data?.results ?? [];
  const totalCount = data?.count ?? products.length;

  const openCreate = () => {
    setActiveProduct(null);
    setEditorActive(true);
  };

  const openEdit = (product: Product) => {
    setActiveProduct(product);
    setEditorActive(true);
  };

  const resetEditor = () => {
    setActiveProduct(null);
    setEditorActive(false);
  };

  const handleProductSaved = useCallback(
    (product: Product, ctx: { created: boolean }) => {
      if (!ctx.created) return;
      applyCatalogSearch(productManageCatalogSearchTerm(product));
    },
    [applyCatalogSearch],
  );

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        alignSelf: 'stretch',
        m: -3,
        p: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          px: 2,
          py: 1.5,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Manage products
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Product owns catalog identity: title, brand, model, category, identifiers, tags, and specs.
            </Typography>
          </Box>
          <Button startIcon={<AddOutlinedIcon />} variant="contained" onClick={openCreate}>
            New product
          </Button>
        </Box>
      </Box>

      <Box sx={{ flexShrink: 0 }}>
        <ProcessingScanBar
          search={search}
          onSearchChange={handleSearchChange}
          onSearchEnter={handleSearchEnter}
          isFetching={isFetching && !isLoading}
          mode="queue"
          placeholder="Search product #, title, brand, model, category, UPC..."
          ariaLabel="Search products"
        />
      </Box>

      <Box sx={{ flexShrink: 0 }}>
        <CatalogFilterRow
          totalCount={totalCount}
          shownCount={products.length}
          search={querySearch}
          isFetching={isFetching && !isLoading}
          entityPlural="products"
        />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex' }}>
        <ProductCatalogTable products={products} search={querySearch} onOpenProduct={openEdit} />
      </Box>

      <ProductManagePanel
        open={editorActive}
        initialProduct={activeProduct}
        onClose={resetEditor}
        onProductSaved={handleProductSaved}
      />
    </Box>
  );
}
