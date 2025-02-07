'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';

interface TerritoryPriceInput {
  territory: string; // The territory code, e.g. "US"
  desiredPrice: number; // The user-supplied numeric price
}

interface PricePointOption {
  id: string;
  customerPrice: string;
  currency: string;
}

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  iapId: string;
  onComplete: () => Promise<void>; 
  // Called after all bulk updates succeed, to refresh the UI or do anything else.
}

export default function BulkEditModal({
  isOpen,
  onClose,
  iapId,
  onComplete,
}: BulkEditModalProps) {
  const [csvText, setCsvText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [inProgress, setInProgress] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [preserveCurrentPrice, setPreserveCurrentPrice] = useState(true);

  // Reset modal state on open/close
  useEffect(() => {
    if (!isOpen) {
      setCsvText('');
      setStatus(null);
      setErrors([]);
      setDoneCount(0);
      setTotalCount(0);
      setInProgress(false);
      setPreserveCurrentPrice(true);
    }
  }, [isOpen]);

  // Parse user input from CSV into a list of { territory, desiredPrice }
  const parseCsv = (text: string): TerritoryPriceInput[] => {
    // Basic CSV parser: each line => territory, price
    // Format: "US, 9.99"
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const result: TerritoryPriceInput[] = [];
    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length !== 2) continue;
      const territory = parts[0];
      const desiredPrice = parseFloat(parts[1]);
      if (!Number.isNaN(desiredPrice)) {
        result.push({ territory, desiredPrice });
      }
    }
    return result;
  };

  // For a given desired price, find the pricePointOption that is the closest.
  const findClosestPricePoint = (
    desiredPrice: number,
    pricePoints: PricePointOption[]
  ): PricePointOption => {
    let bestMatch = pricePoints[0];
    let bestDiff = Math.abs(desiredPrice - parseFloat(bestMatch.customerPrice));
    for (const pp of pricePoints) {
      const diff = Math.abs(desiredPrice - parseFloat(pp.customerPrice));
      if (diff < bestDiff) {
        bestMatch = pp;
        bestDiff = diff;
      }
    }
    return bestMatch;
  };

  // Fetch all price points for (iapId + territory).
  const fetchPricePoints = async (
    territory: string
  ): Promise<PricePointOption[] | null> => {
    try {
      const resp = await fetch(
        `/api/appstore/prices?iapId=${iapId}&territory=${territory}&fetch=pricePoints`
      );
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.error || 'Failed to fetch price points');
      }
      const data = await resp.json();
      return data.pricePoints as PricePointOption[];
    } catch (error) {
      return null;
    }
  };

  const updatePrice = async (
    territory: string,
    pricePointId: string
  ): Promise<void> => {
    const resp = await fetch(`/api/appstore/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        iapId,
        territory,
        pricePointId,
        preserveCurrentPrice,
      }),
    });
    if (!resp.ok) {
      const e = await resp.json();
      throw new Error(e.error || 'Bulk price update failed');
    }
  };

  const handleBulkEdit = async () => {
    setInProgress(true);
    setStatus('Parsing CSV...');
    setErrors([]);
    setDoneCount(0);

    const inputs = parseCsv(csvText);
    setTotalCount(inputs.length);

    if (!inputs.length) {
      setStatus('No valid lines found in CSV');
      setInProgress(false);
      return;
    }

    setStatus('Starting bulk updates...');

    for (let i = 0; i < inputs.length; i++) {
      const { territory, desiredPrice } = inputs[i];
      try {
        setStatus(`Processing ${i + 1} / ${inputs.length}: ${territory}`);

        // 1) fetch available price points for that territory
        const pricePoints = await fetchPricePoints(territory);
        if (!pricePoints || pricePoints.length === 0) {
          throw new Error(`No price points found for territory ${territory}`);
        }

        // 2) find the closest match
        const bestMatch = findClosestPricePoint(desiredPrice, pricePoints);

        // 3) submit the update
        await updatePrice(territory, bestMatch.id);

        // 4) increment success count
        setDoneCount((count) => count + 1);

        // Optional: add a short delay to avoid spamming Apple’s API
        await new Promise((res) => setTimeout(res, 1000));
      } catch (err: any) {
        console.error('Bulk update error:', err);
        setErrors((prev) => [
          ...prev,
          `${territory} => ${desiredPrice}: ${err?.message}`,
        ]);
      }
    }

    setInProgress(false);
    setStatus('Bulk updates complete');

    // Let parent refresh data, etc.
    await onComplete();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-semibold">Bulk Edit Prices</h3>

        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            id="preserveCurrentPrice"
            checked={preserveCurrentPrice}
            onChange={(e) => setPreserveCurrentPrice(e.target.checked)}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          />
          <label htmlFor="preserveCurrentPrice" className="ml-2 block text-sm text-gray-900">
            Keep current price for existing subscribers
          </label>
        </div>

        <p className="text-sm text-gray-700">
          Paste CSV lines with 2 columns:
        </p>
        <pre className="bg-gray-100 text-gray-800 p-2 rounded">
          US, 9.99
          <br />
          CA, 10.49
          <br />
          GB, 8.99
          <br />
          ...
        </pre>

        <textarea
          rows={8}
          className="w-full border rounded p-2"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder="US, 9.99&#10;CA, 10.49&#10;GB, 8.99"
        />

        {status && <div className="text-sm text-gray-600">{status}</div>}

        {inProgress && (
          <div className="flex items-center space-x-2 text-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
            <span>
              Processed {doneCount} of {totalCount}...
            </span>
          </div>
        )}

        {errors.length > 0 && (
          <div className="text-red-500 text-sm">
            <p>Errors:</p>
            <ul className="list-disc list-inside">
              {errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex justify-end space-x-2">
          <button
            type="button"
            disabled={inProgress}
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            disabled={inProgress}
            onClick={handleBulkEdit}
            className={`inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md ${
              inProgress
                ? 'bg-indigo-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {inProgress ? 'Working...' : 'Start Bulk Edit'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
