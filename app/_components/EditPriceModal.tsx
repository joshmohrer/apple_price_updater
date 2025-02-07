'use client';

import { useState, useEffect } from 'react';
import { Modal } from './Modal';

interface Price {
  id: string;
  customerPrice: string;
  proceeds: string;
  territory: {
    id: string;
    name: string;
    currency: string;
  };
  pricePointId: string;
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
    preserveCurrentPrice: boolean;
  }) => Promise<void>;
}

function EditPriceModal({ isOpen, onClose, price, iapId, onSave }: EditPriceModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availablePricePoints, setAvailablePricePoints] = useState<any[]>([]);
  const [selectedPricePointId, setSelectedPricePointId] = useState(price.pricePointId);
  const [loadingPricePoints, setLoadingPricePoints] = useState(false);
  const [preserveCurrentPrice, setPreserveCurrentPrice] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchPricePoints();
    }
  }, [isOpen]);

  const fetchPricePoints = async () => {
    setLoadingPricePoints(true);
    try {
      const response = await fetch(
        `/api/appstore/prices?iapId=${iapId}&territory=${price.territory.id}&fetch=pricePoints`
      );
      if (!response.ok) throw new Error('Failed to fetch price points');
      const data = await response.json();
      setAvailablePricePoints(data.pricePoints);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch price points');
    } finally {
      setLoadingPricePoints(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      await onSave({
        iapId,
        territory: price.territory.id,
        pricePointId: selectedPricePointId,
        preserveCurrentPrice
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
              New Price
            </label>
            <select
              value={selectedPricePointId}
              onChange={(e) => setSelectedPricePointId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              disabled={loadingPricePoints}
            >
              {loadingPricePoints ? (
                <option>Loading available prices...</option>
              ) : (
                availablePricePoints.map((pp) => (
                  <option key={pp.id} value={pp.id}>
                    {new Intl.NumberFormat(undefined, {
                      style: 'currency',
                      currency: pp.currency || price.territory.currency,
                    }).format(parseFloat(pp.customerPrice))}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={preserveCurrentPrice}
                onChange={(e) => setPreserveCurrentPrice(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Keep current price for existing subscribers
              </span>
            </label>
            <p className="text-sm text-gray-500 ml-6">
              When checked, only new subscribers will get the new price. Existing subscribers will keep their current price.
            </p>
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

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
                loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
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

export default EditPriceModal;
