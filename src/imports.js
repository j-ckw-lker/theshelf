// One-time import of Jack's Orbit DVD and Amazon wishlists (Oct 2026). Merged into the want list
// once per device; after that the app's Wishlist is the list he keeps.
const O = "https://www.orbitdvd.com/products/";
const A = "https://www.amazon.com/dp/";
export const IMPORT_ID = "orbit-amazon-2026-10";
export const IMPORTED_WANTS = [
  { film: "Sirāt", year: "2025", label: "4K UHD, Region Free", store: "Orbit", price: 36.99, url: O + "sirat-4k-uhd-region-free" },
  { film: "Primer", year: "2004", label: "Blu-ray w/ slipcover", store: "Orbit", price: 30.99, url: O + "primer-region-free", note: "Sold out at Orbit last check." },
  { film: "Terminator Salvation", year: "2009", label: "4K UHD, Region Free/B", store: "Orbit", price: 26.99, url: O + "terminator-salvation-4k-uhd-region-free-b" },
  { film: "To Catch a Thief", year: "1955", label: "4K UHD Limited Edition w/ slip", store: "Orbit", price: 36.99, url: O + "to-catch-a-thief-4k-uhd-limited-edition-w-slip" },
  { film: "Poltergeist", year: "1982", label: "4K UHD", store: "Orbit", price: 26.99, url: O + "poltergeist-4k-uhd" },
  { film: "The Crazies", year: "1973", label: "Blu-ray", store: "Orbit", price: 24.99, url: O + "the-crazies" },
  { film: "J-Horror Rising", year: "", set: true, label: "Box set, Standard Edition", store: "Orbit", price: 69.99, url: O + "j-horror-rising-standard-edition" },
  { film: "Blood and Black Lace", year: "1964", label: "4K UHD, Region Free", store: "Orbit", price: 29.99, url: O + "blood-and-black-lace-4k-uhd-standard-edition-region-free", note: "Also on your Amazon list." },
  { film: "Torso", year: "1973", label: "4K UHD", store: "Orbit", price: 33.99, url: O + "torso-4k-uhd", note: "Also on your Amazon list." },
  { film: "Giallo Essentials: Yellow Edition", year: "", set: true, label: "Box set", store: "Orbit", price: 69.99, url: O + "giallo-essentials-yellow-edition-standard-edition" },
  { film: "Giallo Essentials: Red Edition", year: "", set: true, label: "Box set", store: "Orbit", price: 69.99, url: O + "giallo-essentials-red-edition-standard-edition" },
  { film: "Tenebrae", year: "1982", label: "UK 4K UHD, Region Free", store: "Orbit", price: 28.99, url: O + "tenebrae-uk-4k-uhd-region-free", note: "Also on your Amazon list." },
  { film: "Possession", year: "1981", label: "Umbrella 4K UHD, Region Free", store: "Orbit", price: 31.99, url: O + "possession-4k-uhd-umbrella-region-free" },
  { film: "Eighteen Years in Prison", year: "1967", label: "US Limited Edition", store: "Orbit", price: 20.99, url: O + "eighteen-years-in-prison-us-limited-edition" },
  { film: "Tokijiro: Lone Yakuza", year: "1966", label: "US Limited Edition", store: "Orbit", price: 19.59, url: O + "tokijiro-lone-yakuza-us-limited-edition" },
  { film: "Red Peony Gambler I–III", year: "", set: true, label: "Box set", store: "Orbit", price: 32.99, url: O + "red-peony-gambler-i-iii-w-slip" },
  { film: "Rulers of the City", year: "1976", label: "Limited Edition, Region Free", store: "Orbit", price: 17.49, url: O + "rulers-of-the-city-limited-edition-region-free" },
  { film: "Daughters of Darkness", year: "1971", label: "4K UHD Limited Edition", store: "Orbit", price: 27.29, url: O + "daughters-of-darkness-4k-uhd-limited-edition-region-free" },
  { film: "The Pornographers", year: "1966", label: "4K UHD, UK Limited Edition", store: "Orbit", price: 31.99, url: O + "the-pornographers-4k-uhd-uk-limited-edition-region-free-region-b" },
  { film: "Battle Royale", year: "2000", label: "4K UHD, Region Free", store: "Orbit", price: 29.99, url: O + "battle-royale-4k-uhd-region-free-b" },
  { film: "Invasion of the Body Snatchers", year: "1978", label: "4K UHD, Region Free", store: "Orbit", price: 29.99, url: O + "invasion-of-the-body-snatchers-1978-4k-uhd-standard-edition-region-free", note: "You saved two editions: this standard 4K ($29.99) and the Imprint Special Edition ($58.99)." },
  { film: "Inseminoid", year: "1981", label: "Blu-ray, Region Free", store: "Orbit", price: 13.59, url: O + "dont-publish-inseminoid-region-free" },
  { film: "Christine", year: "1983", label: "Blu-ray, Region Free", store: "Orbit", price: 19.99, url: O + "christine-region-free" },
  { film: "Visitor Q", year: "2001", label: "Radiance Limited Edition", store: "Orbit", price: 27.99, url: O + "visitor-q-limited-edition-radiance-films" },
  { film: "Popeye", year: "1980", label: "4K UHD w/ slip", store: "Orbit", price: 33.99, url: O + "popeye-4k-uhd" },
  { film: "Angel Heart", year: "1987", label: "4K UHD, Region Free", store: "Orbit", price: 27.99, url: O + "angelheartregionfree" },
  { film: "Fantastique: The Dreams and Nightmares of French Cinema", year: "", set: true, label: "Limited Edition box set", store: "Orbit", price: 82.99, url: O + "fantastique-the-dreams-and-nightmares-of-french-cinema-limited-edition" },
  { film: "Manhunter", year: "1986", label: "The Final Cut 4K, UK Collector's Edition", store: "Orbit", price: 48.99, url: O + "manhunter-the-final-cut-4k-uhd-uk-collectors-edition-region-free-b" },
  { film: "The Last Boy Scout", year: "1991", label: "4K UHD Limited Edition", store: "Orbit", price: 33.99, url: O + "the-last-boy-scout-4k-uhd-limited-edition" },
  { film: "Looney Tunes: Collector's Vault Volume 3", year: "", set: true, label: "Box set", store: "Orbit", price: 24.99, url: O + "looney-tunes-collectors-vault-volume-3" },
  { film: "To Live and Die in L.A.", year: "1985", label: "Arrow 4K Limited Edition w/ slip", store: "Orbit", price: 29.99, url: O + "to-live-and-die-in-l-a-4k-uhd-limited-edition-region-free" },
  { film: "Phenomena", year: "1985", label: "UK 4K UHD, Region Free", store: "Orbit", price: 25.99, url: O + "phenomena-uk-4k-uhd-region-free" },
  { film: "King of New York", year: "1990", label: "4K UHD, Region Free", store: "Orbit", price: 28.99, url: O + "king-of-new-york-4k-uhd-region-free" },
  { film: "Cinema Paradiso", year: "1988", label: "4K UHD, Region Free", store: "Orbit", price: 28.99, url: O + "cinema-paradiso-4k-uhd-region-free" },
  { film: "Basket Case", year: "1982", label: "UK 4K Limited Edition w/ slip", store: "Orbit", price: 36.99, url: O + "basket-case-uk-4k-uhd-limited-edition-region-free" },
  { film: "Hardboiled: Three Pulp Thrillers by Alain Corneau", year: "", set: true, label: "UK Limited Edition box set", store: "Orbit", price: 49.99, url: O + "hardboiled-three-pulp-thrillers-by-alain-corneau-uk-limited-edition-region-free" },
  { film: "New Rose Hotel", year: "1998", label: "UK Limited Edition, Region B", store: "Orbit", price: 24.99, url: O + "new-rose-hotel-uk-limited-edition-region-b" },
  { film: "Bugonia", year: "2025", label: "4K German Steelbook", store: "Orbit", price: 49.99, url: O + "bugonia-4k-uhd-limited-edition-german-steelbook-region-free-b" },
  { film: "World Noir Vol. 5", year: "", set: true, label: "Limited Edition box set, Region B", store: "Orbit", price: 57.99, url: O + "world-noir-vol-5-limited-edition-region-b" },
  { film: "World Noir Vol. 4", year: "", set: true, label: "Limited Edition box set, Region B", store: "Orbit", price: 62.99, url: O + "world-noir-vol-4-limited-edition-region-b-1" },
  { film: "A Nightmare on Elm Street 1–7", year: "", set: true, label: "Blu-ray collection", store: "Amazon", price: 14.99, url: A + "B00AZ7V0W0", note: "Also saved: the 7-film 4K Steelbook library case (Amazon exclusive)." },
  { film: "Friday the 13th 8-Movie Collection", year: "", set: true, label: "Limited Edition Steelbook Blu-ray", store: "Amazon", price: 36.78, url: A + "B097CC1CPC" },
  { film: "Body Double", year: "1984", label: "4K Steelbook", store: "Amazon", price: 29.99, url: A + "B0D9JFMCGM" },
  { film: "Eddie Murphy Raw", year: "1987", label: "Blu-ray", store: "Amazon", price: 20.84, url: A + "B0CPP64P11" },
  { film: "Forbidden Planet", year: "1956", label: "4K Limited Edition", store: "Amazon", price: 31.99, url: A + "B0H6QP7D98" },
  { film: "Demolition Man", year: "1993", label: "4K Special Edition", store: "Amazon", price: 32.47, url: A + "B0DZPG4D8Z" },
  { film: "White Christmas", year: "1954", label: "4K UHD", store: "Amazon", price: 19.95, url: A + "B0DBX87QS3" },
  { film: "The Omen Collection", year: "", set: true, label: "Blu-ray collection", store: "Amazon" },
  { film: "Boxcar Bertha", year: "1972", label: "Blu-ray", store: "Amazon" },
  { film: "Eyes of Laura Mars", year: "1978", label: "Blu-ray", store: "Amazon" },
  { film: "Happy Birthday to Me", year: "1981", label: "Blu-ray", store: "Amazon" },
  { film: "The Psychic", year: "1977", label: "4K UHD", store: "Amazon" },
  { film: "Eyeball", year: "1975", label: "Blu-ray", store: "Amazon" },
];

// Second pass (Oct 12): the rest of the Amazon wishlist (the first pass only saw the first page),
// plus prices and links for Amazon wants that came in without them.
export const IMPORT2_ID = "amazon-full-2026-10-12";
export const IMPORT2_ADD = [
{
"film": "Branded to Kill",
"year": "1967",
"label": "Criterion 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0BVY7KBFK",
"price": 39.24
},
{
"film": "The Angry River",
"year": "1971",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0GKQSLMRZ",
"price": 14.99
},
{
"film": "Licorice Pizza",
"year": "2021",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0CZ7DBMYG",
"price": 11.15
},
{
"film": "Inherent Vice",
"year": "2014",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B00QKS2EKK",
"price": 22.59
},
{
"film": "The Verdict",
"year": "1982",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B00BQLEHA6",
"price": 21.98
},
{
"film": "Shawscope Vol. 4",
"year": "",
"label": "Limited Edition box set",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FSSS1HQW",
"set": true,
"price": 105.0
},
{
"film": "Shawscope Volume Three",
"year": "",
"label": "Limited Edition box set",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0D6NZ9D5P",
"set": true,
"price": 192.06
},
{
"film": "Shawscope Volume Two",
"year": "",
"label": "Limited Edition box set",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0GPY4FY21",
"set": true
},
{
"film": "Troy",
"year": "2004",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0H3C3476F",
"price": 35.86
},
{
"film": "Traffic",
"year": "2000",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B005VU9LVI",
"price": 32.28
},
{
"film": "80's Horror 5-Film Steelbook Library Case",
"year": "",
"label": "4K Steelbook set",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0H98B4WXD",
"set": true,
"price": 144.99
},
{
"film": "Jade",
"year": "1995",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FBMMZV8Q"
},
{
"film": "Stephen King 5-Movie Collection",
"year": "",
"label": "Blu-ray collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0H1SKDYFP",
"set": true,
"price": 16.99
},
{
"film": "Evil Dead Burn",
"year": "2025",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0H42KZBF7",
"price": 27.95,
"note": "Also saved: the Limited Edition Steelbook ($39.98)."
},
{
"film": "City on Fire",
"year": "1987",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0F8M6WB32",
"price": 30.73
},
{
"film": "Matinee",
"year": "1993",
"label": "Collector's Edition 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0CZ4GFDZK",
"price": 29.21
},
{
"film": "Death Becomes Her",
"year": "1992",
"label": "Collector's Edition 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0D9MGJYHW",
"price": 23.99
},
{
"film": "Prince of Darkness",
"year": "1987",
"label": "Collector's Edition",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07GNTX417",
"price": 25.54
},
{
"film": "The Stepfather",
"year": "1987",
"label": "Collector's Edition 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0D7D983C1",
"price": 23.99
},
{
"film": "Timecop",
"year": "1994",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DTJ6DMS7",
"price": 23.99
},
{
"film": "Once a Thief",
"year": "1991",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FWF96K5V",
"price": 30.72
},
{
"film": "Escape from New York",
"year": "1981",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B09SVPRN6X",
"price": 22.19
},
{
"film": "The Holdovers",
"year": "2023",
"label": "Collector's Edition 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DGXYQ19L",
"price": 27.99
},
{
"film": "Pirates of the Caribbean 5-Movie Collection",
"year": "",
"label": "4K collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FRYFCYXZ",
"set": true,
"price": 137.99
},
{
"film": "Disney Classics: Ultimate Complete 62 Movie Collection",
"year": "",
"label": "Blu-ray collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0GCGRYP2B",
"set": true,
"price": 599.99
},
{
"film": "Spy Kids 3-Movie Collection",
"year": "",
"label": "Blu-ray collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B08D4H2Z2C",
"set": true,
"price": 11.75
},
{
"film": "Primer + Upstream Color",
"year": "",
"label": "Blu-ray, two films",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B08QBQL15J",
"set": true,
"price": 24.7,
"note": "Orbit has Primer alone with a slipcover."
},
{
"film": "That's Entertainment! The Complete Collection",
"year": "",
"label": "Blu-ray collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B08BF2PF35",
"set": true,
"price": 24.99
},
{
"film": "Invasion of the Body Snatchers",
"year": "1956",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0D3JDT3NZ",
"price": 17.99
},
{
"film": "In Bruges",
"year": "2008",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0B644QLVV",
"price": 19.99
},
{
"film": "Eternal Sunshine of the Spotless Mind",
"year": "2004",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B09YS4QPYH",
"price": 26.29
},
{
"film": "Bonnie and Clyde",
"year": "1967",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B002VWNIAE",
"price": 11.28
},
{
"film": "The Conversation",
"year": "1974",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DNXXP1Y5",
"price": 49.95
},
{
"film": "Pleasantville",
"year": "1998",
"label": "Collector's Edition 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0GWTHLKQJ",
"price": 31.99
},
{
"film": "The Human Condition",
"year": "",
"label": "Criterion box set",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B08Z1ZPQDW",
"set": true,
"price": 46.19
},
{
"film": "The Adventures of Antoine Doinel",
"year": "",
"label": "Criterion box set",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0F4YDQPXQ",
"set": true,
"price": 93.45
},
{
"film": "John Cassavetes: Five Films",
"year": "",
"label": "Criterion box set",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B00DZP1C2M",
"set": true,
"price": 93.45
},
{
"film": "The Complete Jacques Tati",
"year": "",
"label": "Criterion box set",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B00LUSUWSQ",
"set": true,
"price": 124.99
},
{
"film": "The Super Mario Galaxy Movie",
"year": "2026",
"label": "Limited Edition",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0GQTC3CDN"
},
{
"film": "Office Space",
"year": "1999",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B001JNNDEW"
},
{
"film": "Avatar: Fire and Ash",
"year": "2025",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0GVBG563M",
"price": 41.79
},
{
"film": "Mission: Impossible - The Final Reckoning",
"year": "2025",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0F8W6CMR9",
"price": 24.96
},
{
"film": "The Band Wagon",
"year": "1953",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B00P9E5NJA",
"price": 10.81
},
{
"film": "Ben-Hur",
"year": "1959",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FY3RSSV9",
"price": 19.96
},
{
"film": "Funny Face",
"year": "1957",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B09ZPTHWKG",
"price": 16.99
},
{
"film": "My Fair Lady",
"year": "1964",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B08SZ1HYMB",
"price": 13.26
},
{
"film": "Irma la Douce",
"year": "1963",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07CXBXRBX"
},
{
"film": "Kinds of Kindness",
"year": "2024",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DCK3P6GS",
"price": 22.74
},
{
"film": "Rocky 6-Film Collection",
"year": "",
"label": "4K collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0D4VRGCFY",
"set": true,
"price": 82.99
},
{
"film": "Creed II",
"year": "2018",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07J35G5GM",
"price": 14.99
},
{
"film": "Creed",
"year": "2015",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B01G3MBQYM"
},
{
"film": "Hamnet",
"year": "2025",
"label": "Collector's Edition 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0GH236MK7",
"price": 22.45
},
{
"film": "Gangs of New York",
"year": "2002",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B08D4Y4ZXT",
"price": 11.75
},
{
"film": "Dog Day Afternoon",
"year": "1975",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B00ZVC2R5S",
"price": 13.19
},
{
"film": "Serpico",
"year": "1973",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0BVSLRH56",
"price": 26.29
},
{
"film": "Monty Python's Life of Brian",
"year": "1979",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0GHPS7FJ1",
"price": 39.24
},
{
"film": "Predator: Badlands",
"year": "2025",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0GF9TL8BQ",
"price": 25.27
},
{
"film": "Meet the Parents",
"year": "2000",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FC35FJZN",
"price": 18.99
},
{
"film": "Shrek 2",
"year": "2004",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0BFXMDLBF",
"price": 17.39
},
{
"film": "Shrek",
"year": "2001",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B08Y49YYQ7",
"price": 14.99
},
{
"film": "About Time",
"year": "2013",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B084NZ8W48",
"price": 16.46
},
{
"film": "28 Years Later: The Bone Temple",
"year": "2026",
"label": "4K Steelbook",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0GGRB5KFF"
},
{
"film": "One Flew Over the Cuckoo's Nest",
"year": "1975",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FR9HGQ11",
"price": 21.88
},
{
"film": "Catch Me If You Can",
"year": "2002",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FQR5NKVC",
"price": 19.99,
"note": "You saved two editions; the other was $30.96."
},
{
"film": "Inside Llewyn Davis",
"year": "2013",
"label": "Criterion Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B016R7C354",
"price": 33.2
},
{
"film": "The Shape of Water",
"year": "2017",
"label": "Criterion 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DDCYQNS4",
"price": 39.24
},
{
"film": "Thelma & Louise",
"year": "1991",
"label": "Criterion 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0BVXTHPNH",
"price": 37.76
},
{
"film": "Bound",
"year": "1996",
"label": "Criterion 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0CY73GHLP",
"price": 39.24
},
{
"film": "Full Metal Jacket",
"year": "1987",
"label": "4K Steelbook",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DZ8763K1"
},
{
"film": "The Killing of a Sacred Deer",
"year": "2017",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B077SK4GRB",
"price": 14.0
},
{
"film": "The Favourite",
"year": "2018",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07HSKMMXV",
"price": 34.75
},
{
"film": "Three Amigos!",
"year": "1986",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B005ERX1UU",
"price": 8.12
},
{
"film": "The Addams Family",
"year": "1991",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B00KBSWXCE",
"price": 11.54
},
{
"film": "Addams Family Values",
"year": "1993",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DB7G6S4W",
"price": 19.95
},
{
"film": "Braindead",
"year": "1992",
"label": "Blu-ray import",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B01CIFBA7Q",
"price": 9.61
},
{
"film": "Rogue One: A Star Wars Story",
"year": "2016",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B083XR4F6F",
"price": 27.49
},
{
"film": "Point Break",
"year": "1991",
"label": "4K Steelbook",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0D133TJCZ",
"price": 26.48
},
{
"film": "Hot Rod",
"year": "2007",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B072ZLVP6S",
"price": 11.95
},
{
"film": "Dracula: Dead and Loving It",
"year": "1995",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07GNTJ3D5",
"price": 17.99
},
{
"film": "Saw II",
"year": "2005",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FHL598RL"
},
{
"film": "O Brother, Where Art Thou?",
"year": "2000",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0054PSY2W",
"price": 8.99
},
{
"film": "Incendies",
"year": "2010",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0056NEK20",
"price": 16.4
},
{
"film": "The Prestige",
"year": "2006",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0776K3MCC",
"price": 18.99
},
{
"film": "Spotlight",
"year": "2015",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FNBQVT7J",
"price": 24.99
},
{
"film": "The Big Short",
"year": "2015",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0177ZM3LO"
},
{
"film": "Star Wars: Episode III - Revenge of the Sith",
"year": "2005",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B083XTZBYX",
"price": 27.99
},
{
"film": "Star Wars: Episode II - Attack of the Clones",
"year": "2002",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B083XX2537",
"price": 27.99
},
{
"film": "Star Wars: Episode I - The Phantom Menace",
"year": "1999",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B083XM24HB",
"price": 27.99
},
{
"film": "Gremlins",
"year": "1984",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07SJY25GB"
},
{
"film": "Split",
"year": "2017",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B073D25WQT",
"price": 13.59
},
{
"film": "Die Hard",
"year": "1988",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07BF2SPZ3",
"price": 20.29
},
{
"film": "V for Vendetta",
"year": "2006",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B08F6MVHRR",
"price": 17.13
},
{
"film": "Harry Potter 8-Film Collection",
"year": "",
"label": "4K collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B075W1LFWP",
"set": true,
"price": 68.75
},
{
"film": "James Bond Connery 6-Film Collection",
"year": "",
"label": "4K collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0F25P21DZ",
"set": true
},
{
"film": "Easy Rider",
"year": "1969",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B01BUX7YUO",
"price": 32.28
},
{
"film": "Resident Evil: The Complete Collection",
"year": "",
"label": "Blu-ray collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B06XR8KV8L",
"set": true,
"price": 37.18
},
{
"film": "Twister",
"year": "1996",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0D49X2P79",
"price": 18.6
},
{
"film": "Lara Croft: Tomb Raider",
"year": "2001",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B077Y6RBZ8",
"price": 19.63
},
{
"film": "Little Women",
"year": "2019",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B082BYRPLT",
"price": 11.71
},
{
"film": "A Mighty Wind",
"year": "2003",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B019HPJD10",
"price": 20.84
},
{
"film": "Clueless",
"year": "1995",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0F33TQZLP",
"price": 19.95
},
{
"film": "Miracle Mile",
"year": "1989",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DLLJFZZQ",
"price": 18.4
},
{
"film": "In a Violent Nature",
"year": "2024",
"label": "Collector's Edition 4K",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0F5J1JJF1",
"price": 27.99
},
{
"film": "The Monkey",
"year": "2025",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DYHBW7GW"
},
{
"film": "Hereditary",
"year": "2018",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0FKKHW3XZ"
},
{
"film": "Aliens",
"year": "1986",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0CSZC9GLJ",
"price": 19.99
},
{
"film": "The Wind Rises",
"year": "2013",
"label": "Limited Edition Steelbook",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B08YDTLMXJ"
},
{
"film": "Nausicaä of the Valley of the Wind",
"year": "1984",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0889YZ2K7"
},
{
"film": "Kiki's Delivery Service",
"year": "1989",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B088B4MVZ1",
"price": 29.95
},
{
"film": "Howl's Moving Castle",
"year": "2004",
"label": "Limited Edition Steelbook",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B084FDZS3T"
},
{
"film": "Frank Herbert's Dune Collection",
"year": "",
"label": "Blu-ray collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0CYKFQXSB",
"set": true,
"price": 49.99
},
{
"film": "Fast & Furious 8-Movie Collection",
"year": "",
"label": "4K collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07QGLB3DH",
"set": true
},
{
"film": "Smile 2",
"year": "2024",
"label": "4K Steelbook",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DK1W6MG3",
"price": 35.69
},
{
"film": "American Hustle",
"year": "2013",
"label": "4K Steelbook",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0CXLYMWG1",
"price": 23.99
},
{
"film": "The Usual Suspects",
"year": "1995",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0B8W7DKMG",
"price": 26.29
},
{
"film": "Insidious",
"year": "2011",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0BYPCTJWH",
"price": 29.95
}
];
export const IMPORT2_PATCH = [
{
"film": "The Omen Collection",
"year": "",
"label": "Blu-ray collection",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07TPYXV95",
"set": true,
"price": 48.99
},
{
"film": "Boxcar Bertha",
"year": "1972",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0BK5CDTXP",
"price": 22.62
},
{
"film": "Eyes of Laura Mars",
"year": "1978",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07BTL7CCG",
"price": 37.98
},
{
"film": "Happy Birthday to Me",
"year": "1981",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B07BS2WK9B"
},
{
"film": "The Psychic",
"year": "1977",
"label": "4K UHD",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0CN7F1VKS",
"price": 30.44
},
{
"film": "Eyeball",
"year": "1975",
"label": "Blu-ray",
"store": "Amazon",
"url": "https://www.amazon.com/dp/B0DFZ5K2C6",
"price": 30.93
}
];
