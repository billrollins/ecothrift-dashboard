import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Box, Typography } from '@mui/material';
import { getProducts } from '../../api/inventory.api';
import { ProcessingScanBar } from './processing/ProcessingScanBar';
import { CatalogFilterRow } from './manage/CatalogFilterRow';
import { ProductCatalogTable } from './manage/ProductCatalogTable';

const PRODUCT_CATALOG_PAGE_SIZE = 200;

export default function ManageProductsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

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
        search: querySearch || undefined,
        page_size: PRODUCT_CATALOG_PAGE_SIZE,
      });
      return page;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const products = data?.results ?? [];
  const totalCount = data?.count ?? products.length;

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
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          Manage products
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Search the catalog — same look as the processing queue.
        </Typography>
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

      <ProductCatalogTable products={products} search={querySearch} />
    </Box>
  );
}
