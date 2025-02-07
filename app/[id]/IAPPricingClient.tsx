'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import EditPriceModal from '../_components/EditPriceModal';
import BulkEditModal from '../_components/BulkEditModal';

interface Price {
  id: string;
  customerPrice: string;
  proceeds: string;
  pricePointId: string;
  startDate?: string;
  territory: {
    id: string;
    name: string;
    currency: string;
  };
}

interface Pagination {
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
  hasMore: boolean;
}

interface IAPPricing {
  prices: Price[];
  pagination: Pagination;
  iap: {
    id: string;
    type: string;
    attributes: {
      name: string;
      productId: string;
      inAppPurchaseType: string;
      state: string;
    };
  };
}

export default function IAPPricingClient({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iapPricing, setIAPPricing] = useState<IAPPricing | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<Price | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);

  useEffect(() => {
    fetchIAPPricing(null);
    setCurrentCursor(null);
  }, [id]);

  const fetchIAPPricing = async (cursor: string | null = null) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`/api/appstore/prices`, window.location.origin);
      url.searchParams.set('iapId', id);
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch IAP pricing');
      }
      const data: IAPPricing = await response.json();
      setIAPPricing(data);
      setCurrentCursor(cursor);
    } catch (err) {
      console.error('Error fetching IAP pricing:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePrice = async (data: {
    iapId: string;
    territory: string;
    pricePointId: string;
    startDate?: string;
    endDate?: string;
  }) => {
    try {
      const response = await fetch('/api/appstore/prices', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update price');
      }

      // Refresh the data
      await fetchIAPPricing(currentCursor);
      setEditModalOpen(false);
      setSelectedPrice(null);
    } catch (err) {
      console.error('Error updating price:', err);
      setError(err instanceof Error ? err.message : 'Failed to update price');
    }
  };

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !iapPricing) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => router.push('/')}
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to IAP List
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-6">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            {iapPricing.iap.attributes.name}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Product ID: {iapPricing.iap.attributes.productId}
          </p>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setBulkModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Bulk Edit Prices
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Territory
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Proceeds
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Start Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {iapPricing.prices.map((price) => (
              <tr key={price.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{price.territory.name}</div>
                  <div className="text-sm text-gray-500">{price.territory.id}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {price.customerPrice} {price.territory.currency}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {price.proceeds} {price.territory.currency}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {price.startDate ? new Date(price.startDate).toLocaleDateString() : 'N/A'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => {
                      setSelectedPrice(price);
                      setEditModalOpen(true);
                    }}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {iapPricing.pagination.hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => fetchIAPPricing(iapPricing.pagination.nextCursor)}
            className="bg-white text-blue-600 px-4 py-2 rounded border border-blue-600 hover:bg-blue-50"
          >
            Load More
          </button>
        </div>
      )}

      {editModalOpen && selectedPrice && (
        <EditPriceModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedPrice(null);
          }}
          price={selectedPrice}
          iapId={id}
          onUpdate={handleUpdatePrice}
        />
      )}

      {bulkModalOpen && (
        <BulkEditModal
          isOpen={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          iapId={id}
          onUpdate={() => fetchIAPPricing(currentCursor)}
        />
      )}
    </div>
  );
}
