import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import countries from 'i18n-iso-countries';
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

// UNCOMMENT THIS WITH THE CORRECT INFO
// const APP_ID = '6451491556';
// const ISSUER_ID = process.env.APPSTORE_ISSUER_ID;
// const KEY_ID = 'ZYL5TVH7HP';
// const PRIVATE_KEY_PATH = path.join(process.cwd(), 'app/AuthKey_ZYL5TVH7HP.p8');

if (!ISSUER_ID) {
  throw new Error('Missing required APPSTORE_ISSUER_ID');
}
if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  throw new Error(`Private key file not found: ${PRIVATE_KEY_PATH}`);
}

async function generateToken(): Promise<string> {
  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + 20 * 60; // 20 minutes
  return jwt.sign(
    {
      iss: ISSUER_ID,
      iat: nowSec,
      exp: expSec,
      aud: 'appstoreconnect-v1',
    },
    privateKey,
    {
      algorithm: 'ES256',
      header: { kid: KEY_ID, typ: 'JWT', alg: 'ES256' },
    }
  );
}

/**
 * Fetch the subscription or IAP pricePoints for the given iapId.
 * This auto-detects if the IAP is an automatically renewable subscription or not.
 */
async function fetchPricePointsForIAP(token: string, iapId: string) {
  // Step 1: fetch the inAppPurchase resource so we can see what type it is.
  const iapDetailsUrl = `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${iapId}`;
  const iapResp = await fetch(iapDetailsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!iapResp.ok) {
    const txt = await iapResp.text();
    throw new Error(`Failed to fetch inAppPurchase details: ${iapResp.status} ${txt}`);
  }
  const iapData = await iapResp.json();
  const iapType = iapData.data.attributes.inAppPurchaseType;

  let resourceId = iapId;
  let resourceType = 'inAppPurchases';

  // Step 2: If it’s an automatically renewable subscription, we need the "subscriptions" resource ID
  if (iapType === 'AUTOMATICALLY_RENEWABLE_SUBSCRIPTION') {
    const subUrl = `https://api.appstoreconnect.apple.com/v1/subscriptions/${iapId}`;
    const subResp = await fetch(subUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!subResp.ok) {
      const txt = await subResp.text();
      throw new Error(`Failed to fetch subscription resource: ${subResp.status} ${txt}`);
    }
    const subData = await subResp.json();
    resourceId = subData.data.id;     // The real subscription resource ID
    resourceType = subData.data.type; // should be "subscriptions"
  }

  // Step 3: fetch the pricePoints from the correct resource
  //    - If resourceType === 'subscriptions', use: /v1/subscriptions/{id}/pricePoints?include=territory
  //    - Else use: /v1/inAppPurchases/{id}/pricePoints?include=territory
  const pricePointsUrl =
    resourceType === 'subscriptions'
      ? `https://api.appstoreconnect.apple.com/v1/subscriptions/${resourceId}/pricePoints?include=territory`
      : `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${resourceId}/pricePoints?include=territory`;

  const pricePointsResp = await fetch(pricePointsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!pricePointsResp.ok) {
    const txt = await pricePointsResp.text();
    throw new Error(`Failed to fetch price points: ${pricePointsResp.status} ${txt}`);
  }
  const pricePointsData = await pricePointsResp.json();

  // Combine it all into a single payload (similar to your existing format)
  return {
    data: pricePointsData.data || [],
    included: pricePointsData.included || [],
    iap: {
      id: iapId,
      type: iapType === 'AUTOMATICALLY_RENEWABLE_SUBSCRIPTION' ? 'subscription' : 'inAppPurchase',
      attributes: {
        name: iapData.data.attributes.referenceName,  // or subscription's name if you want
        productId: iapData.data.attributes.productId,
        inAppPurchaseType: iapType,
        sku: '',
        state: iapData.data.attributes.state,
      },
    },
  };
}

/**
 * Fetch the subscription or IAP pricePoints for the given iapId.
 * This auto-detects if the IAP is an automatically renewable subscription or not.
 */
async function getCurrentPrices(token: string, iapId: string) {
  // Step 1: Get IAP details (without invalid include parameter)
  const iapDetailsUrl = `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${iapId}`;
  const iapResp = await fetch(iapDetailsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!iapResp.ok) {
    const txt = await iapResp.text();
    throw new Error(`Failed to fetch IAP details: ${iapResp.status} ${txt}`);
  }
  const iapData = await iapResp.json();
  const iapType = iapData.data.attributes.inAppPurchaseType;

  // For subscriptions, find the associated subscription group
  let resourceId = iapId;
  let resourceType = 'inAppPurchases';
  
  if (iapType === 'AUTOMATICALLY_RENEWABLE_SUBSCRIPTION') {
    // Step 2: Get subscription groups for the app
    const groupsUrl = `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/subscriptionGroups`;
    const groupsResp = await fetch(groupsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!groupsResp.ok) {
      const txt = await groupsResp.text();
      throw new Error(`Failed to fetch subscription groups: ${groupsResp.status} ${txt}`);
    }
    const groupsData = await groupsResp.json();

    // Step 3: Find the group containing our IAP
    let subscriptionId = '';
    for (const group of groupsData.data) {
      const subsUrl = `https://api.appstoreconnect.apple.com/v1/subscriptionGroups/${group.id}/subscriptions`;
      const subsResp = await fetch(subsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!subsResp.ok) continue;
      
      const subsData = await subsResp.json();
      const matchingSub = subsData.data.find(
        (sub: any) => sub.attributes.productId === iapData.data.attributes.productId
      );
      
      if (matchingSub) {
        resourceId = matchingSub.id;
        resourceType = 'subscriptions';
        break;
      }
    }

    if (!resourceId) {
      throw new Error('Could not find associated subscription for this IAP');
    }
  }

  // Step 4: Get prices using correct resource type and ID
  const pricesUrl = resourceType === 'subscriptions'
    ? `https://api.appstoreconnect.apple.com/v1/subscriptions/${resourceId}/prices?include=subscriptionPricePoint,territory&limit=200`
    : `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${resourceId}/prices?include=inAppPurchasePricePoint,territory&limit=200`;

  console.log('Fetching prices from:', pricesUrl);
  const response = await fetch(pricesUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Failed to fetch current prices: ${response.status} ${txt}`);
  }
  
  const priceData = await response.json();
  return {
    data: priceData.data || [],
    included: priceData.included || [],
    type: iapType
  };
}

async function fetchPricePointsForIAPAndTerritory(token: string, iapId: string, territory: string) {
  // Get IAP details to determine type
  const iapDetailsUrl = `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${iapId}`;
  const iapResp = await fetch(iapDetailsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!iapResp.ok) throw new Error('Failed to fetch IAP details');
  const iapData = await iapResp.json();
  const isSubscription = iapData.data.attributes.inAppPurchaseType === 'AUTOMATICALLY_RENEWABLE_SUBSCRIPTION';

  let resourceId = iapId;
  // Handle subscriptions
  if (isSubscription) {
    const groupsUrl = `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/subscriptionGroups`;
    const groupsResp = await fetch(groupsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!groupsResp.ok) throw new Error('Failed to fetch subscription groups');
    
    const groupsData = await groupsResp.json();
    for (const group of groupsData.data) {
      const subsUrl = `https://api.appstoreconnect.apple.com/v1/subscriptionGroups/${group.id}/subscriptions`;
      const subsResp = await fetch(subsUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!subsResp.ok) continue;
      
      const subsData = await subsResp.json();
      const matchingSub = subsData.data.find(
        (sub: any) => sub.attributes.productId === iapData.data.attributes.productId
      );
      if (matchingSub) {
        resourceId = matchingSub.id;
        break;
      }
    }
  }

  // Build the correct endpoint URL with pagination parameters
  const endpoint = isSubscription
  ? `https://api.appstoreconnect.apple.com/v1/subscriptions/${resourceId}/pricePoints?filter[territory]=${territory}&limit=200`
  : `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${iapId}/pricePoints?filter[territory]=${territory}&limit=200`;

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Failed to fetch price points: ${response.status}`);
  
  const data = await response.json();
  let allPricePoints = data.data;

  // Handle pagination if there are more pages
  let nextUrl = data.links?.next;
  while (nextUrl) {
    const nextResponse = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!nextResponse.ok) break;
    
    const nextData = await nextResponse.json();
    allPricePoints = [...allPricePoints, ...nextData.data];
    nextUrl = nextData.links?.next;
  }

  return allPricePoints.map((pp: any) => ({
    id: pp.id,
    customerPrice: pp.attributes.customerPrice,
    currency: pp.attributes.currency || pp.attributes.territory?.attributes?.currency,
  }));
}

/**
 * Fetch the subscription or IAP pricePoints for the given iapId.
 * This auto-detects if the IAP is an automatically renewable subscription or not.
 */
async function updatePrice(
  token: string, 
  iapId: string, 
  territory: string, 
  pricePointId: string,
  preserveCurrentPrice: boolean = false
) {
  // Calculate start date as 2 days from now
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 2);
  const formattedStartDate = startDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD

  // First determine if this is a subscription
  const iapDetailsUrl = `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${iapId}`;
  const iapResp = await fetch(iapDetailsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!iapResp.ok) {
    const txt = await iapResp.text();
    throw new Error(`Failed to fetch IAP details: ${iapResp.status} ${txt}`);
  }
  const iapData = await iapResp.json();
  const isSubscription = iapData.data.attributes.inAppPurchaseType === 'AUTOMATICALLY_RENEWABLE_SUBSCRIPTION';

  // For subscriptions, we need to find the subscription ID through groups
  let subscriptionId = '';
  if (isSubscription) {
    // Get all subscription groups for the app
    const groupsUrl = `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/subscriptionGroups`;
    const groupsResp = await fetch(groupsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!groupsResp.ok) {
      const txt = await groupsResp.text();
      throw new Error(`Failed to fetch subscription groups: ${groupsResp.status} ${txt}`);
    }
    const groupsData = await groupsResp.json();

    // Search through groups to find matching subscription
    for (const group of groupsData.data) {
      const subsUrl = `https://api.appstoreconnect.apple.com/v1/subscriptionGroups/${group.id}/subscriptions`;
      const subsResp = await fetch(subsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!subsResp.ok) continue;
      
      const subsData = await subsResp.json();
      const matchingSub = subsData.data.find(
        (sub: any) => sub.attributes.productId === iapData.data.attributes.productId
      );
      
      if (matchingSub) {
        subscriptionId = matchingSub.id;
        break;
      }
    }

    if (!subscriptionId) {
      throw new Error('Could not find associated subscription for this IAP');
    }
  }

  // Construct the base price point data
  const pricePointData = {
    startDate: formattedStartDate,
    territory: territory
  };

  // Different endpoints and payloads for subscriptions vs one-time purchases
  const endpoint = isSubscription
    ? `https://api.appstoreconnect.apple.com/v1/subscriptionPrices`
    : `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${iapId}/prices`;

  const payload = isSubscription ? {
    data: {
      type: "subscriptionPrices",
      attributes: {
        startDate: formattedStartDate,
        preserveCurrentPrice
      },
      relationships: {
        subscription: {
          data: {
            id: subscriptionId,
            type: "subscriptions"
          }
        },
        subscriptionPricePoint: {
          data: {
            id: pricePointId,
            type: "subscriptionPricePoints"
          }
        }
      }
    }
  } : {
    data: {
      type: "inAppPurchasePrices",
      attributes: {
        startDate: formattedStartDate,
        territory: territory,
        pricePoint: {
          id: pricePointId
        }
      }
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Failed to update price: ${response.status} ${txt}`);
  }
  return response.json();
}

// Finally, your GET handler
// In app/api/appstore/prices/route.ts - Update the GET handler
// In app/api/appstore/prices/route.ts - Update the GET handler section
export async function GET(request: NextRequest) {
  try {
    console.log('Received GET request');
    const token = await generateToken();
    console.log('Generated token successfully');
    const searchParams = new URL(request.url).searchParams;
    const iapId = searchParams.get('iapId');
    const territory = searchParams.get('territory');
    const fetchPricePoints = searchParams.get('fetch') === 'pricePoints';

    if (iapId && territory && fetchPricePoints) {
      const pricePoints = await fetchPricePointsForIAPAndTerritory(token, iapId, territory);
      return NextResponse.json({ pricePoints });
    }

    if (iapId) {
      console.log('Fetching IAP details for:', iapId);
      // 1. Get IAP details without invalid include parameter
      const iapDetailsUrl = `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${iapId}`;
      const iapResp = await fetch(iapDetailsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!iapResp.ok) {
        const txt = await iapResp.text();
        throw new Error(`Failed to fetch IAP details: ${iapResp.status} ${txt}`);
      }
      const iapData = await iapResp.json();
      const iapType = iapData.data.attributes.inAppPurchaseType;

      console.log('IAP type:', iapType);

      // 2. Find subscription ID through subscription groups if needed
      let resourceId = iapId;
      let resourceType = 'inAppPurchases';
      let isSubscription = false;

      if (iapType === 'AUTOMATICALLY_RENEWABLE_SUBSCRIPTION') {
        isSubscription = true;
        console.log('Finding subscription group for:', iapId);
        // Get all subscription groups for the app
        const groupsUrl = `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/subscriptionGroups`;
        const groupsResp = await fetch(groupsUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!groupsResp.ok) {
          const txt = await groupsResp.text();
          throw new Error(`Failed to fetch subscription groups: ${groupsResp.status} ${txt}`);
        }
        const groupsData = await groupsResp.json();

        console.log('Subscription groups count:', groupsData.data.length);

        // Search through groups to find matching subscription
        for (const group of groupsData.data) {
          const subsUrl = `https://api.appstoreconnect.apple.com/v1/subscriptionGroups/${group.id}/subscriptions`;
          const subsResp = await fetch(subsUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!subsResp.ok) continue;
          
          const subsData = await subsResp.json();
          const matchingSub = subsData.data.find(
            (sub: any) => sub.attributes.productId === iapData.data.attributes.productId
          );
          
          if (matchingSub) {
            resourceId = matchingSub.id;
            resourceType = 'subscriptions';
            break;
          }
        }

        if (resourceId === iapId) {
          throw new Error('Could not find associated subscription for this IAP');
        }
      }

      console.log('Fetching prices for:', resourceId);

      // Get pagination cursor if provided
      const cursor = searchParams.get('cursor');
      const limit = 200; // Max allowed by API

      // 3. Fetch active prices using correct endpoint with pagination
      let pricesUrl = resourceType === 'subscriptions'
        ? `https://api.appstoreconnect.apple.com/v1/subscriptions/${resourceId}/prices?include=subscriptionPricePoint,territory&limit=${limit}`
        : `https://api.appstoreconnect.apple.com/v1/inAppPurchases/${resourceId}/prices?include=inAppPurchasePricePoint,territory&limit=${limit}`;
      
      // Add cursor if provided
      if (cursor) {
        pricesUrl += `&cursor=${cursor}`;
      }

      const pricesResp = await fetch(pricesUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!pricesResp.ok) {
        const txt = await pricesResp.text();
        throw new Error(`Failed to fetch active prices: ${pricesResp.status} ${txt}`);
      }
      const pricesData = await pricesResp.json();
      
      console.log('Prices API Response:', {
        url: pricesUrl,
        status: pricesResp.status,
        dataCount: pricesData.data?.length || 0,
        includedCount: pricesData.included?.length || 0
      });

      // Log the raw response data
      console.log('Raw API Response Structure:', {
        links: pricesData.links,
        meta: pricesData.meta,
        dataTypes: pricesData.data?.map((d: any) => d.type).slice(0, 5),
        includedTypes: pricesData.included?.map((i: any) => i.type).slice(0, 5),
      });

      // Log first item of each type in included
      if (pricesData.included) {
        const typeGroups = pricesData.included.reduce((acc: any, item: any) => {
          if (!acc[item.type]) {
            acc[item.type] = item;
          }
          return acc;
        }, {});
        
        console.log('Sample of each included type:', typeGroups);
      }

      // Log first price data item complete structure
      if (pricesData.data?.[0]) {
        console.log('First price data item complete:', {
          data: pricesData.data[0],
          relatedTerritory: pricesData.included?.find((i: any) => 
            i.id === pricesData.data[0].relationships?.territory?.data?.id
          ),
          relatedPricePoint: pricesData.included?.find((i: any) => 
            i.id === pricesData.data[0].relationships?.[
              isSubscription ? 'subscriptionPricePoint' : 'inAppPurchasePricePoint'
            ]?.data?.id
          )
        });
      }

      // Log sample of included data to see structure
      if (pricesData.included && pricesData.included.length > 0) {
        console.log('Sample included territory data:', 
          pricesData.included
            .filter((item: any) => item.type === 'territories')
            .slice(0, 2)
            .map((t: any) => ({
              type: t.type,
              id: t.id,
              attributes: t.attributes
            }))
        );
      }

      // Log sample of price data to see structure
      if (pricesData.data && pricesData.data.length > 0) {
        console.log('Sample price data:', 
          pricesData.data.slice(0, 2).map((p: any) => ({
            id: p.id,
            type: p.type,
            attributes: p.attributes,
            relationships: {
              territory: p.relationships.territory,
              pricePoint: isSubscription 
                ? p.relationships.subscriptionPricePoint 
                : p.relationships.inAppPurchasePricePoint
            }
          }))
        );
      }

      // Map to consistent format
      const prices = pricesData.data
        ?.map((price: any) => {
          // Log the raw relationships for debugging
          console.log('Raw price relationships:', {
            priceId: price.id,
            territoryRel: price.relationships.territory,
            pricePointRel: price.relationships[isSubscription ? 'subscriptionPricePoint' : 'inAppPurchasePricePoint']
          });

          const territoryId = price.relationships.territory?.data?.id;
          const pricePointId = price.relationships[isSubscription ? 'subscriptionPricePoint' : 'inAppPurchasePricePoint']?.data?.id;

          // Find the territory in included data
          const territory = pricesData.included?.find(
            (item: any) => item.type === 'territories' && 
              item.id === territoryId
          );

          // Find the price point in included data
          const pricePoint = pricesData.included?.find(
            (item: any) => item.type === (isSubscription ? 'subscriptionPricePoints' : 'inAppPurchasePricePoints') && 
              item.id === pricePointId
          );

          if (!territory || !pricePoint) {
            console.log('Missing data for price:', {
              priceId: price.id,
              hasTerritory: !!territory,
              hasPricePoint: !!pricePoint,
              territoryId,
              pricePointId,
              foundTerritory: territory,
              territoryTypes: pricesData.included?.filter((i: any) => i.type === 'territories').map((t: any) => t.id)
            });
            return null;
          }

          const mappedPrice = {
            id: price.id,
            customerPrice: pricePoint.attributes.customerPrice,
            proceeds: isSubscription 
              ? pricePoint.attributes.proceeds 
              : pricePoint.attributes.developerProceeds,
            startDate: price.attributes.startDate,
            territory: {
              id: territory.id,
              name: countries.getName(territory.id, 'en') || territory.id,
              currency: territory.attributes.currency
            },
            pricePointId: pricePoint.id // Add this line
          };

          console.log('Territory mapping:', {
            id: territory.id,
            rawAttributes: territory.attributes,
            mappedTerritory: mappedPrice.territory
          });

          return mappedPrice;
        })
        .filter(Boolean);

      console.log('Final prices count:', prices.length);

      return NextResponse.json({
        prices: prices || [],
        pagination: {
          nextCursor: pricesData.links?.next ? new URL(pricesData.links.next).searchParams.get('cursor') : null,
          prevCursor: pricesData.links?.prev ? new URL(pricesData.links.prev).searchParams.get('cursor') : null,
          total: pricesData.meta?.paging?.total || prices.length,
          hasMore: Boolean(pricesData.links?.next)
        },
        iap: {
          id: iapId,
          type: isSubscription ? 'subscription' : 'inAppPurchase',
          attributes: iapData.data.attributes
        }
      });
    }

    console.log('Fetching list of all IAPs');

    // Get list of all IAPs
    const iapsUrl = `https://api.appstoreconnect.apple.com/v1/apps/${APP_ID}/inAppPurchases`;
    const iapsResponse = await fetch(iapsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!iapsResponse.ok) {
      throw new Error(`Failed to fetch IAPs: ${iapsResponse.status}`);
    }
    const iapsData = await iapsResponse.json();

    console.log('IAPs count:', iapsData.data.length);

    // Group IAPs by state for debugging
    const iapsByState = iapsData.data.reduce((acc: any, iap: any) => {
      const state = iap.attributes.state;
      if (!acc[state]) {
        acc[state] = [];
      }
      acc[state].push({
        id: iap.id,
        name: iap.attributes.name,
        productId: iap.attributes.productId
      });
      return acc;
    }, {});
    console.log('IAPs by state:', iapsByState);

    // Fetch US prices for all IAPs
    const iapsWithUsPrices = await Promise.all(iapsData.data.map(async (iap: any) => {
      try {
        // Only fetch prices if IAP is in a state that would have prices
        if (iap.attributes.state === 'DEVELOPER_REMOVED_FROM_SALE' || 
            iap.attributes.state === 'DEVELOPER_ACTION_NEEDED' ||
            iap.attributes.state === 'DELETED') {
          return {
            ...iap,
            attributes: {
              ...iap.attributes,
              usPrice: '-'
            }
          };
        }

        // For active IAPs, try to fetch the price
        try {
          const { data, included, type } = await getCurrentPrices(token, iap.id);
          
          console.log(`Processing IAP ${iap.id} (${iap.attributes.name})`);
          
          const usPrice = findUSPrice(data, included);
          const usPricePoint = findUSPricePoint(usPrice, included);

          return {
            ...iap,
            attributes: {
              ...iap.attributes,
              usPrice: usPricePoint ? `$${usPricePoint.attributes.customerPrice}` : '-'
            }
          };
        } catch (priceError) {
          // If we can't fetch prices for this IAP, just show a dash
          console.log(`No prices available for IAP ${iap.id} (${iap.attributes.state})`);
          return {
            ...iap,
            attributes: {
              ...iap.attributes,
              usPrice: '-'
            }
          };
        }
      } catch (error) {
        console.error(`Failed to process IAP ${iap.id}:`, error);
        return {
          ...iap,
          attributes: {
            ...iap.attributes,
            usPrice: '-'
          }
        };
      }
    }));

    return NextResponse.json({
      inAppPurchases: iapsWithUsPrices || []
    });
  } catch (error) {
    console.error('Error in GET handler:', error);
    return NextResponse.json({ error: String(error) || String(error) }, { status: 500 });
  }
}

function findUSPrice(data: any, included: any) {
  // Log all territories for debugging
  const territories = included
    .filter((inc: any) => inc.type === 'territories')
    .map((t: { id: string; attributes: any }) => ({ id: t.id, attributes: t.attributes }));
  console.log('Available territories:', territories);

  // Log all prices with their territories
  const pricesWithTerritories = data.map((price: any) => {
    const territory = included.find((inc: any) => 
      inc.type === 'territories' && 
      inc.id === price.relationships.territory.data.id
    );
    return {
      priceId: price.id,
      territoryId: territory?.id,
      territoryName: territory?.attributes?.name,
      relationships: price.relationships // Add this to see the full relationships
    };
  });
  console.log('Prices with territories:', pricesWithTerritories);

  // Check if there is a territory with 'USA' or 'US' ID
  const allTerritoryIds = territories.map((t: { id: string }) => t.id);
  console.log('All territory IDs:', allTerritoryIds);
  
  const usPrice = data.find((price: any) => {
    const territory = included.find((inc: any) => 
      inc.type === 'territories' && 
      inc.id === price.relationships.territory.data.id
    );
    // Try both 'USA' and 'US'
    const isUSTerritory = territory?.id === 'USA' || territory?.id === 'US';
    if (isUSTerritory) {
      console.log('Found US territory:', territory);
    }
    return isUSTerritory;
  });

  if (!usPrice) {
    console.log('No US price found in data. Territory IDs available:', allTerritoryIds);
  } else {
    console.log('Found US price:', {
      priceId: usPrice.id,
      relationships: usPrice.relationships,
      attributes: usPrice.attributes
    });
  }

  return usPrice;
}

function findUSPricePoint(usPrice: any, included: any) {
  if (!usPrice) {
    console.log('No US price provided to findUSPricePoint');
    return null;
  }

  // Log the price point relationship we're looking for
  console.log('Looking for price point with relationships:', usPrice.relationships);
  
  const pricePoint = included.find((inc: any) => {
    const isMatch = (
      (inc.type === 'subscriptionPricePoints' || inc.type === 'inAppPurchasePricePoints') &&
      inc.id === (
        usPrice.relationships.subscriptionPricePoint?.data?.id || 
        usPrice.relationships.inAppPurchasePricePoint?.data?.id
      )
    );
    
    if (isMatch) {
      console.log('Found matching price point:', inc);
    }
    
    return isMatch;
  });

  if (!pricePoint) {
    console.log('No price point found in included data for US price. Available price points:', 
      included
        .filter((inc: any) => 
          inc.type === 'subscriptionPricePoints' || 
          inc.type === 'inAppPurchasePricePoints'
        )
        .map((pp: any) => ({
          id: pp.id,
          type: pp.type,
          customerPrice: pp.attributes.customerPrice
        }))
    );
  }

  return pricePoint;
}

export async function POST(request: NextRequest) {
  try {
    console.log('Received POST request');
    const token = await generateToken();
    console.log('Generated token successfully');
    const body = await request.json();
    const { iapId, territory, pricePointId, preserveCurrentPrice } = body;

    if (!iapId || !territory || !pricePointId) {
      return NextResponse.json(
        { error: 'Missing required fields: iapId, territory, pricePointId' },
        { status: 400 }
      );
    }

    console.log('Updating price for:', iapId);

    const result = await updatePrice(token, iapId, territory, pricePointId, preserveCurrentPrice);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating price:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    console.log('Received PATCH request');
    const token = await generateToken();
    console.log('Generated token successfully');
    const body = await request.json();
    const { iapId, territory, pricePointId, preserveCurrentPrice } = body;

    if (!iapId || !territory || !pricePointId) {
      return NextResponse.json(
        { error: 'Missing required fields: iapId, territory, pricePointId' },
        { status: 400 }
      );
    }

    console.log('Updating price for:', iapId);

    const result = await updatePrice(token, iapId, territory, pricePointId, preserveCurrentPrice);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating price:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
