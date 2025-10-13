import { useState, useEffect, useRef } from 'react';
import { Database, Table, Search, ChevronLeft, ChevronRight, RefreshCw, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { apiUrl } from '../config';

interface TableInfo {
  name: string;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function DatabaseTab() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [schema, setSchema] = useState<ColumnInfo[]>([]);
  const [data, setData] = useState<any[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });
  const [search, setSearch] = useState('');
  const [searchColumn, setSearchColumn] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTables();
  }, []);

  useEffect(() => {
    if (selectedTable) {
      fetchSchema();
      fetchData();
    }
  }, [selectedTable, pagination.page, search, searchColumn]);

  // Check scroll position when data changes
  useEffect(() => {
    if (tableScrollRef.current && data.length > 0) {
      const element = tableScrollRef.current;
      const hasScroll = element.scrollWidth > element.clientWidth;
      setShowRightScroll(hasScroll);
      setShowLeftScroll(false);
    }
  }, [data]);

  const fetchTables = async () => {
    try {
      const response = await fetch(apiUrl('/api/database/tables'));
      if (response.ok) {
        const data = await response.json();
        setTables(data);
      }
    } catch (error) {
      console.error('Error fetching tables:', error);
    }
  };

  const fetchSchema = async () => {
    try {
      const response = await fetch(apiUrl(`/api/database/tables/${selectedTable}/schema`));
      if (response.ok) {
        const data = await response.json();
        setSchema(data);
        if (data.length > 0 && !searchColumn) {
          setSearchColumn(data[0].name);
        }
      }
    } catch (error) {
      console.error('Error fetching schema:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && searchColumn && { search, searchColumn })
      });

      const response = await fetch(apiUrl(`/api/database/tables/${selectedTable}/data?${params}`));
      if (response.ok) {
        const result = await response.json();
        setData(result.data);
        setPagination(result.pagination);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchData();
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    setShowLeftScroll(element.scrollLeft > 0);
    setShowRightScroll(element.scrollLeft < element.scrollWidth - element.clientWidth - 10);
  };

  const scrollTable = (direction: 'left' | 'right') => {
    if (tableScrollRef.current) {
      const scrollAmount = 300;
      const newScrollLeft = direction === 'left'
        ? tableScrollRef.current.scrollLeft - scrollAmount
        : tableScrollRef.current.scrollLeft + scrollAmount;
      
      tableScrollRef.current.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar - Table List */}
      <div className="w-64 bg-slate-800 border-r border-slate-700 p-4 overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">Tables</h2>
        </div>
        <div className="space-y-1">
          {tables.map(table => (
            <button
              key={table.name}
              onClick={() => setSelectedTable(table.name)}
              className={`w-full text-left px-3 py-2 rounded transition-colors flex items-center gap-2 ${
                selectedTable === table.name
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-slate-700'
              }`}
            >
              <Table className="w-4 h-4" />
              {table.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        {!selectedTable ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Database className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <p>Select a table to view its data</p>
            </div>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-white">{selectedTable}</h1>
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Search */}
            <div className="flex gap-2 mb-4">
              <select
                value={searchColumn}
                onChange={e => setSearchColumn(e.target.value)}
                className="px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              >
                {schema.map(col => (
                  <option key={col.name} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </select>
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Search..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-700 text-white rounded border border-slate-600"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
              >
                Search
              </button>
            </div>

            {/* Schema Info */}
            <div className="mb-4 p-4 bg-slate-800 rounded">
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Schema ({schema.length} columns)</h3>
              <div className="flex flex-wrap gap-2">
                {schema.map(col => (
                  <div key={col.name} className="px-3 py-1 bg-slate-700 rounded text-xs">
                    <span className="text-white font-medium">{col.name}</span>
                    <span className="text-gray-400 ml-2">{col.type}</span>
                    {col.pk === 1 && <span className="text-yellow-400 ml-2">PK</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-slate-800 rounded overflow-hidden">
              {/* Scroll Hint + Column Counter */}
              <div className="px-4 py-2 bg-slate-700/50 border-b border-slate-600 flex items-center justify-between">
                <div className="text-xs text-gray-400 flex items-center gap-2">
                  <Table className="w-4 h-4" />
                  <span>{schema.length} columns • Scroll horizontally to see more →</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => scrollTable('left')}
                    disabled={!showLeftScroll}
                    className="p-1 rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Scroll left"
                  >
                    <ChevronsLeft className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => scrollTable('right')}
                    disabled={!showRightScroll}
                    className="p-1 rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Scroll right"
                  >
                    <ChevronsRight className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Table Container with Scroll Shadows */}
              <div className="relative">
                {/* Left Shadow */}
                {showLeftScroll && (
                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-800 to-transparent pointer-events-none z-10" />
                )}
                
                {/* Right Shadow */}
                {showRightScroll && (
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-800 to-transparent pointer-events-none z-10" />
                )}

                {/* Scrollable Table */}
                <div 
                  ref={tableScrollRef}
                  onScroll={handleScroll}
                  className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  <table className="w-full">
                    <thead className="bg-slate-700 sticky top-0 z-20 shadow-md">
                      <tr>
                        {schema.map(col => (
                          <th key={col.name} className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap border-r border-slate-600 last:border-r-0">
                            {col.name}
                            {col.pk === 1 && <span className="ml-1 text-yellow-400">🔑</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700 bg-slate-800">
                      {loading ? (
                        <tr>
                          <td colSpan={schema.length} className="px-4 py-8 text-center text-gray-400">
                            Loading...
                          </td>
                        </tr>
                      ) : data.length === 0 ? (
                        <tr>
                          <td colSpan={schema.length} className="px-4 py-8 text-center text-gray-400">
                            No data found
                          </td>
                        </tr>
                      ) : (
                        data.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-700/50">
                            {schema.map(col => (
                              <td key={col.name} className="px-4 py-3 text-sm text-gray-300 border-r border-slate-700/50 last:border-r-0 whitespace-nowrap">
                                {row[col.name] === null ? (
                                  <span className="text-gray-500 italic">NULL</span>
                                ) : typeof row[col.name] === 'object' ? (
                                  <span className="text-xs text-purple-400">{JSON.stringify(row[col.name])}</span>
                                ) : String(row[col.name]).length > 50 ? (
                                  <span className="text-xs" title={String(row[col.name])}>
                                    {String(row[col.name]).slice(0, 50)}...
                                  </span>
                                ) : (
                                  String(row[col.name])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              <div className="px-4 py-3 bg-slate-700 flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} rows
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                    className="px-3 py-1 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-800 disabled:text-gray-600 text-white rounded flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <span className="px-3 py-1 text-white">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-800 disabled:text-gray-600 text-white rounded flex items-center gap-1"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
