// functions/api/plans.js
export async function onRequestGet() {
  return Response.json({
    plans: [
      { id: 'p200',   name: 'Starter 200',       points: 200,   priceCents: 1500   }, // $15
      { id: 'p500',   name: 'Value 500',         points: 500,   priceCents: 3500   }, // $35
      { id: 'p2000',  name: 'Pro 2000',          points: 2000,  priceCents: 12000  }, // $120
      { id: 'p5000',  name: 'Business 5000',     points: 5000,  priceCents: 30000  }, // $300
      { id: 'p15000', name: 'Enterprise 15000',  points: 15000, priceCents: 85000  }, // $850
    ],
  });
}
