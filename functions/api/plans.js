// functions/api/plans.js
export async function onRequestGet() {
  return Response.json({
    plans: [
      { id: 'p500',   name: 'Starter 500',       points: 500,   priceCents: 100   }, // $1
      { id: 'p3000',   name: 'Value 3000',         points: 3000,   priceCents: 500   }, // $5
      { id: 'p20000',  name: 'Pro 20000',          points: 20000,  priceCents: 1500  }, // $15
      { id: 'p50000',  name: 'Business 50000',     points: 50000,  priceCents: 3500  }, // $35
      { id: 'p150000', name: 'Enterprise 150000',  points: 150000, priceCents: 10000  }, // $100
      { id: 'p500000', name: 'Enterprise 500000',  points: 500000, priceCents: 30000  }, // $300
    ],
  });
}
