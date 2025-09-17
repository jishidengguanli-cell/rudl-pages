// functions/api/plans.js
export async function onRequestGet() {
  return Response.json({
    plans: [
      { id: 'p100',   name: 'Starter 100',      points: 100,   priceCents: 1000   },
      { id: 'p500',   name: 'Value 500',        points: 500,   priceCents: 4500   },
      { id: 'p2000',  name: 'Pro 2000',         points: 2000,  priceCents: 15000  },
      { id: 'p5000',  name: 'Business 5000',    points: 5000,  priceCents: 40000  },
      { id: 'p15000', name: 'Enterprise 15000', points: 15000, priceCents: 110000 },
    ],
  });
}
