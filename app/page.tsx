'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface InAppPurchase {
  id: string;
  type: string;
  attributes: {
    name: string;
    productId: string;
    inAppPurchaseType: string;
    state: string;
    usPrice: string;
  };
}

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

interface IAPPricing {
  prices: Price[];
  iap: {
    id: string;
    type: string;
  };
}

interface EditPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  price: Price;
  iapId: string;
  onSave: (data: {
    iapId: string;
    territory: string;
    pricePointId: string;
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
}

function Modal({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const modal = (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-4xl">
        <div className="relative bg-white rounded-lg shadow-xl max-h-[90vh] m-4 overflow-hidden">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
            <h3 className="text-xl font-bold">IAP Pricing Details</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-full"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div
            className="p-6 overflow-y-auto"
            style={{ maxHeight: 'calc(90vh - 80px)' }}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );

  return modal;
}

function EditPriceModal({ isOpen, onClose, price, iapId, onSave }: EditPriceModalProps) {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      await onSave({
        iapId,
        territory: price.territory.id,
        pricePointId: price.id,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update price');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4">
          Edit Price for {price.territory.name}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">Current Price:</p>
            <p className="text-lg font-medium">
              {new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: price.territory.currency,
              }).format(parseFloat(price.customerPrice))}
            </p>
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:mt-0 sm:text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`inline-flex w-full justify-center rounded-md border border-transparent px-4 py-2 text-base font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 sm:text-sm ${
                loading
                  ? 'bg-indigo-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
              }`}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export default function PricesPage() {
  const router = useRouter();
  const [inAppPurchases, setInAppPurchases] = useState<InAppPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIAP, setSelectedIAP] = useState<InAppPurchase | null>(null);
  const [iapPricing, setIAPPricing] = useState<IAPPricing | null>(null);
  const [loadingIAP, setLoadingIAP] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<Price | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/appstore/prices');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch data');
      }
      const data = await response.json();
      setInAppPurchases(data.inAppPurchases);
    } catch (err) {
      console.error('Error fetching pricing:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchIAPPricing = async (iap: InAppPurchase) => {
    setLoadingIAP(true);
    setError(null);
    try {
      const response = await fetch(`/api/appstore/prices?iapId=${iap.id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch IAP pricing');
      }
      const data: IAPPricing = await response.json();
      setIAPPricing(data);
    } catch (err) {
      console.error('Error fetching IAP pricing:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoadingIAP(false);
    }
  };

  const handleViewPricing = (iap: InAppPurchase) => {
    setSelectedIAP(iap);
    setShowModal(true);
    fetchIAPPricing(iap);
  };

  const handleUpdatePrice = async (data: {
    iapId: string;
    territory: string;
    pricePointId: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const response = await fetch('/api/appstore/prices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update price');
    }

    // Refresh the prices after update
    if (selectedIAP) {
      await fetchIAPPricing(selectedIAP);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-2">Loading pricing data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-8">
        <div className="bg-red-50 text-red-500 p-4 rounded-lg text-center">
          {error}
        </div>
      </div>
    );
  }

  if (!inAppPurchases.length) {
    return (
      <div className="min-h-screen p-8">
        <div className="bg-yellow-50 text-yellow-700 p-4 rounded-lg text-center">
          No in-app purchases found.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">App Store Pricing</h1>
        <div className="flex gap-2">
          <button 
            onClick={() => fetchPricing()} 
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-8">
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">In-App Purchases</h2>
            <div className="text-sm text-gray-500">
              {inAppPurchases.length} {inAppPurchases.length === 1 ? 'item' : 'items'}
            </div>
          </div>
          
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      US Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {inAppPurchases.map((iap) => (
                    <tr key={iap.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {iap.attributes.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          ID: {iap.id}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {iap.attributes.productId}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {iap.attributes.inAppPurchaseType}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {iap.attributes.usPrice || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          iap.attributes.state === 'APPROVED'
                            ? 'bg-green-100 text-green-800'
                            : iap.attributes.state === 'DEVELOPER_REMOVED_FROM_SALE'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {iap.attributes.state}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() => router.push(`/${iap.id}`)}
                          className="inline-flex items-center text-indigo-600 hover:text-indigo-900"
                        >
                          <span className="font-medium">View Pricing</span>
                          <svg className="ml-1.5 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
