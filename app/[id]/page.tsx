import { use } from 'react';
import IAPPricingClient from './IAPPricingClient';

export default function IAPPricingPage({ params }: { params: { id: string } }) {
  const id = use(params).id;
  return <IAPPricingClient id={id} />;
}
