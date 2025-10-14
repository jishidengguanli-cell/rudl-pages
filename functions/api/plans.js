// functions/api/plans.js
export async function onRequestGet() {
  return Response.json({
    plans: [
      { id: 'p200',   name: 'Starter 200',       points: 200,   priceCents: 100   }, // $1
      { id: 'p1000',   name: 'Value 1000',         points: 1000,   priceCents: 500   }, // $5
      { id: 'p50000',  name: 'Pro 5000',          points: 5000,  priceCents: 1500  }, // $15
      { id: 'p15000',  name: 'Business 15000',     points: 15000,  priceCents: 3500  }, // $35
      { id: 'p50000', name: 'Enterprise 50000',  points: 50000, priceCents: 10000  }, // $100
      { id: 'p100000', name: 'Enterprise 100000',  points: 100000, priceCents: 20000  }, // $200
    ],
  });
}
