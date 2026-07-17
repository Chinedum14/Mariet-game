// Top-10 major supplier (producer) countries per commodity, ranked #1..#10.
// Country ids are ISO A3 codes matching worldmap.js. Figures are based on
// recent global production rankings and are meant as a research reference.

// Each entry: match keywords (lowercased, tested against a market's name,
// symbol and Yahoo quote), a display label, and the ranked supplier list.
export const COMMODITIES = [
  {
    label: "Crude Oil",
    keys: ["crude", "oil", "wti", "brent", "cl=f", "bz=f", "petrol"],
    suppliers: [
      ["USA", "United States"], ["SAU", "Saudi Arabia"], ["RUS", "Russia"],
      ["CAN", "Canada"], ["IRQ", "Iraq"], ["CHN", "China"],
      ["ARE", "UAE"], ["IRN", "Iran"], ["BRA", "Brazil"], ["KWT", "Kuwait"],
    ],
  },
  {
    label: "Natural Gas",
    keys: ["natural gas", "nat gas", "ng=f", "henry hub", "lng"],
    suppliers: [
      ["USA", "United States"], ["RUS", "Russia"], ["IRN", "Iran"],
      ["CHN", "China"], ["CAN", "Canada"], ["QAT", "Qatar"],
      ["AUS", "Australia"], ["NOR", "Norway"], ["SAU", "Saudi Arabia"], ["DZA", "Algeria"],
    ],
  },
  {
    label: "Gold",
    keys: ["gold", "gc=f", "xau"],
    suppliers: [
      ["CHN", "China"], ["AUS", "Australia"], ["RUS", "Russia"],
      ["CAN", "Canada"], ["USA", "United States"], ["KAZ", "Kazakhstan"],
      ["MEX", "Mexico"], ["GHA", "Ghana"], ["PER", "Peru"], ["IDN", "Indonesia"],
    ],
  },
  {
    label: "Silver",
    keys: ["silver", "si=f", "xag"],
    suppliers: [
      ["MEX", "Mexico"], ["CHN", "China"], ["PER", "Peru"],
      ["CHL", "Chile"], ["POL", "Poland"], ["AUS", "Australia"],
      ["RUS", "Russia"], ["BOL", "Bolivia"], ["USA", "United States"], ["ARG", "Argentina"],
    ],
  },
  {
    label: "Copper",
    keys: ["copper", "hg=f", "xcu"],
    suppliers: [
      ["CHL", "Chile"], ["PER", "Peru"], ["COD", "DR Congo"],
      ["CHN", "China"], ["USA", "United States"], ["RUS", "Russia"],
      ["AUS", "Australia"], ["ZMB", "Zambia"], ["MEX", "Mexico"], ["KAZ", "Kazakhstan"],
    ],
  },
  {
    label: "Platinum",
    keys: ["platinum", "pl=f", "xpt"],
    suppliers: [
      ["ZAF", "South Africa"], ["RUS", "Russia"], ["ZWE", "Zimbabwe"],
      ["CAN", "Canada"], ["USA", "United States"], ["ZMB", "Zambia"],
      ["AUS", "Australia"], ["CHN", "China"], ["COL", "Colombia"], ["FIN", "Finland"],
    ],
  },
  {
    label: "Wheat",
    keys: ["wheat", "zw=f", "ke=f"],
    suppliers: [
      ["CHN", "China"], ["IND", "India"], ["RUS", "Russia"],
      ["USA", "United States"], ["FRA", "France"], ["CAN", "Canada"],
      ["DEU", "Germany"], ["PAK", "Pakistan"], ["UKR", "Ukraine"], ["AUS", "Australia"],
    ],
  },
  {
    label: "Corn",
    keys: ["corn", "maize", "zc=f"],
    suppliers: [
      ["USA", "United States"], ["CHN", "China"], ["BRA", "Brazil"],
      ["ARG", "Argentina"], ["UKR", "Ukraine"], ["IND", "India"],
      ["MEX", "Mexico"], ["IDN", "Indonesia"], ["ZAF", "South Africa"], ["RUS", "Russia"],
    ],
  },
  {
    label: "Soybeans",
    keys: ["soybean", "soy", "zs=f"],
    suppliers: [
      ["BRA", "Brazil"], ["USA", "United States"], ["ARG", "Argentina"],
      ["CHN", "China"], ["IND", "India"], ["PRY", "Paraguay"],
      ["CAN", "Canada"], ["RUS", "Russia"], ["UKR", "Ukraine"], ["BOL", "Bolivia"],
    ],
  },
  {
    label: "Coffee",
    keys: ["coffee", "kc=f"],
    suppliers: [
      ["BRA", "Brazil"], ["VNM", "Vietnam"], ["COL", "Colombia"],
      ["IDN", "Indonesia"], ["ETH", "Ethiopia"], ["HND", "Honduras"],
      ["IND", "India"], ["UGA", "Uganda"], ["MEX", "Mexico"], ["PER", "Peru"],
    ],
  },
  {
    label: "Sugar",
    keys: ["sugar", "sb=f"],
    suppliers: [
      ["BRA", "Brazil"], ["IND", "India"], ["THA", "Thailand"],
      ["CHN", "China"], ["USA", "United States"], ["PAK", "Pakistan"],
      ["MEX", "Mexico"], ["RUS", "Russia"], ["AUS", "Australia"], ["GTM", "Guatemala"],
    ],
  },
  {
    label: "Cotton",
    keys: ["cotton", "ct=f"],
    suppliers: [
      ["CHN", "China"], ["IND", "India"], ["USA", "United States"],
      ["BRA", "Brazil"], ["PAK", "Pakistan"], ["AUS", "Australia"],
      ["UZB", "Uzbekistan"], ["TUR", "Turkey"], ["TKM", "Turkmenistan"], ["GRC", "Greece"],
    ],
  },
  {
    label: "Cocoa",
    keys: ["cocoa", "cacao", "cc=f"],
    suppliers: [
      ["CIV", "Ivory Coast"], ["GHA", "Ghana"], ["IDN", "Indonesia"],
      ["ECU", "Ecuador"], ["NGA", "Nigeria"], ["CMR", "Cameroon"],
      ["BRA", "Brazil"], ["PER", "Peru"], ["DOM", "Dominican Rep."], ["COL", "Colombia"],
    ],
  },
  {
    label: "Coal",
    keys: ["coal"],
    suppliers: [
      ["CHN", "China"], ["IND", "India"], ["IDN", "Indonesia"],
      ["USA", "United States"], ["AUS", "Australia"], ["RUS", "Russia"],
      ["ZAF", "South Africa"], ["DEU", "Germany"], ["KAZ", "Kazakhstan"], ["POL", "Poland"],
    ],
  },
  {
    label: "Iron Ore",
    keys: ["iron", "iron ore", "tio=f"],
    suppliers: [
      ["AUS", "Australia"], ["BRA", "Brazil"], ["CHN", "China"],
      ["IND", "India"], ["RUS", "Russia"], ["ZAF", "South Africa"],
      ["UKR", "Ukraine"], ["CAN", "Canada"], ["USA", "United States"], ["KAZ", "Kazakhstan"],
    ],
  },
  {
    label: "Aluminum",
    keys: ["aluminum", "aluminium", "ali=f"],
    suppliers: [
      ["CHN", "China"], ["IND", "India"], ["RUS", "Russia"],
      ["CAN", "Canada"], ["ARE", "UAE"], ["AUS", "Australia"],
      ["BHR", "Bahrain"], ["NOR", "Norway"], ["USA", "United States"], ["ISL", "Iceland"],
    ],
  },
  {
    label: "Nickel",
    keys: ["nickel"],
    suppliers: [
      ["IDN", "Indonesia"], ["PHL", "Philippines"], ["RUS", "Russia"],
      ["AUS", "Australia"], ["CAN", "Canada"], ["CHN", "China"],
      ["BRA", "Brazil"], ["USA", "United States"], ["CUB", "Cuba"], ["COL", "Colombia"],
    ],
  },
  {
    label: "Lithium",
    keys: ["lithium"],
    suppliers: [
      ["AUS", "Australia"], ["CHL", "Chile"], ["CHN", "China"],
      ["ARG", "Argentina"], ["ZWE", "Zimbabwe"], ["BRA", "Brazil"],
      ["PRT", "Portugal"], ["USA", "United States"], ["CAN", "Canada"], ["NAM", "Namibia"],
    ],
  },
  {
    label: "Uranium",
    keys: ["uranium"],
    suppliers: [
      ["KAZ", "Kazakhstan"], ["CAN", "Canada"], ["AUS", "Australia"],
      ["NAM", "Namibia"], ["NER", "Niger"], ["RUS", "Russia"],
      ["UZB", "Uzbekistan"], ["CHN", "China"], ["USA", "United States"], ["UKR", "Ukraine"],
    ],
  },
  {
    label: "Rice",
    keys: ["rice", "zr=f"],
    suppliers: [
      ["CHN", "China"], ["IND", "India"], ["BGD", "Bangladesh"],
      ["IDN", "Indonesia"], ["VNM", "Vietnam"], ["THA", "Thailand"],
      ["MMR", "Myanmar"], ["PHL", "Philippines"], ["PAK", "Pakistan"], ["KHM", "Cambodia"],
    ],
  },
  {
    label: "Palladium",
    keys: ["palladium", "pa=f", "xpd"],
    suppliers: [
      ["RUS", "Russia"], ["ZAF", "South Africa"], ["CAN", "Canada"],
      ["USA", "United States"], ["ZWE", "Zimbabwe"], ["FIN", "Finland"],
      ["AUS", "Australia"], ["CHN", "China"], ["COL", "Colombia"], ["BWA", "Botswana"],
    ],
  },
];

// Normalise a market into the strings we test keywords against.
function haystack(market) {
  return [market.name, market.symbol, market.quote, market.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// Returns the best-matching commodity for a market, or null. Longer keywords
// win so "natural gas" beats a stray "gas", and specific beats generic.
export function matchCommodity(market) {
  const hay = haystack(market);
  let best = null;
  let bestLen = 0;
  for (const c of COMMODITIES) {
    for (const k of c.keys) {
      if (hay.includes(k) && k.length > bestLen) {
        best = c;
        bestLen = k.length;
      }
    }
  }
  return best;
}
