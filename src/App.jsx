import { useState, useEffect, useMemo, useRef } from "react";

// ════════════════════════════════════════════════════════════════════════
//  THE SHELF — j_ck's physical collection
//  Design: "The Rep House" — 70s repertory-cinema / Vinegar Syndrome slipcase
// ════════════════════════════════════════════════════════════════════════

const SEED_COLLECTION = [{"name":"12 Angry Men","year":"1957","edition":"","rating":5.0,"lastWatched":"2026-04-22"},{"name":"1917","year":"2019","edition":"","rating":4.0,"lastWatched":"2023-06-12"},{"name":"2001: A Space Odyssey","year":"1968","edition":"4k blu ray, the film vault 4k steelbook","rating":5.0,"lastWatched":"2023-06-19"},{"name":"28 Years Later","year":"2025","edition":"","rating":4.0,"lastWatched":"2026-01-10"},{"name":"Ace Ventura: Pet Detective","year":"1994","edition":"","rating":4.0,"lastWatched":null},{"name":"Aftersun","year":"2022","edition":"","rating":4.0,"lastWatched":"2023-06-14"},{"name":"Airplane!","year":"1980","edition":"","rating":5.0,"lastWatched":"2025-07-28"},{"name":"Akira","year":"1988","edition":"","rating":5.0,"lastWatched":"2025-03-04"},{"name":"Alien","year":"1979","edition":"","rating":5.0,"lastWatched":"2025-08-23"},{"name":"Alien: Covenant","year":"2017","edition":"","rating":3.0,"lastWatched":"2025-08-26"},{"name":"Alien Resurrection","year":"1997","edition":"","rating":3.0,"lastWatched":"2024-08-27"},{"name":"Alien: Romulus","year":"2024","edition":"","rating":4.0,"lastWatched":"2025-08-24"},{"name":"Alien\u00b3","year":"1992","edition":"","rating":3.0,"lastWatched":"2025-10-12"},{"name":"Aliens","year":"1986","edition":"","rating":4.5,"lastWatched":"2025-03-18"},{"name":"All That Jazz","year":"1979","edition":"","rating":4.5,"lastWatched":"2026-03-08"},{"name":"All the President's Men","year":"1976","edition":"","rating":5.0,"lastWatched":"2025-09-10"},{"name":"Almost Famous","year":"2000","edition":"","rating":4.5,"lastWatched":"2026-03-25"},{"name":"Altered States","year":"1980","edition":"","rating":4.0,"lastWatched":"2025-10-27"},{"name":"Amadeus","year":"1984","edition":"","rating":4.0,"lastWatched":"2024-04-20"},{"name":"Am\u00e9lie","year":"2001","edition":"","rating":4.5,"lastWatched":"2024-08-14"},{"name":"American Gangster","year":"2007","edition":"","rating":4.5,"lastWatched":"2025-04-04"},{"name":"American Psycho","year":"2000","edition":"","rating":5.0,"lastWatched":"2025-10-17"},{"name":"Anatomy of a Fall","year":"2023","edition":"","rating":4.0,"lastWatched":"2024-12-23"},{"name":"Anatomy of a Murder","year":"1959","edition":"","rating":4.0,"lastWatched":"2024-07-29"},{"name":"Animal House","year":"1978","edition":"","rating":4.0,"lastWatched":"2023-03-07"},{"name":"Annihilation","year":"2018","edition":"","rating":4.0,"lastWatched":"2024-03-01"},{"name":"Anora","year":"2024","edition":"","rating":4.5,"lastWatched":"2025-04-02"},{"name":"Antichrist","year":"2009","edition":"","rating":null,"lastWatched":null},{"name":"The Apartment","year":"1960","edition":"","rating":5.0,"lastWatched":"2025-02-18"},{"name":"Apocalypse Now","year":"1979","edition":"","rating":5.0,"lastWatched":"2023-11-22"},{"name":"Army of Darkness","year":"1992","edition":"","rating":4.5,"lastWatched":"2026-04-25"},{"name":"Army of Shadows","year":"1969","edition":"","rating":null,"lastWatched":null},{"name":"Arrival","year":"2016","edition":"2 copies. 4k blu ray, blu ray steelbook","rating":5.0,"lastWatched":"2025-07-14"},{"name":"As the Gods Will","year":"2014","edition":"","rating":3.0,"lastWatched":"2024-08-19"},{"name":"Austin Powers in Goldmember","year":"2002","edition":"","rating":4.5,"lastWatched":null},{"name":"Austin Powers: International Man of Mystery","year":"1997","edition":"","rating":4.5,"lastWatched":null},{"name":"Austin Powers: The Spy Who Shagged Me","year":"1999","edition":"","rating":4.0,"lastWatched":null},{"name":"Avatar","year":"2009","edition":"","rating":4.0,"lastWatched":null},{"name":"Avatar: The Way of Water","year":"2022","edition":"","rating":3.5,"lastWatched":"2023-02-28"},{"name":"The Avengers","year":"2012","edition":"","rating":3.0,"lastWatched":null},{"name":"The Aviator","year":"2004","edition":"","rating":4.0,"lastWatched":"2026-04-11"},{"name":"Baby Driver","year":"2017","edition":"","rating":4.0,"lastWatched":"2023-08-02"},{"name":"Babylon","year":"2022","edition":"","rating":4.0,"lastWatched":"2025-09-09"},{"name":"Back to the Future","year":"1985","edition":"","rating":5.0,"lastWatched":"2024-01-16"},{"name":"Back to the Future Part II","year":"1989","edition":"","rating":3.5,"lastWatched":"2025-05-14"},{"name":"Back to the Future Part III","year":"1990","edition":"","rating":4.0,"lastWatched":"2024-01-17"},{"name":"Barry Lyndon","year":"1975","edition":"","rating":null,"lastWatched":null},{"name":"Batman","year":"1989","edition":"","rating":3.5,"lastWatched":"2026-05-21"},{"name":"Batman & Robin","year":"1997","edition":"","rating":3.0,"lastWatched":"2024-06-12"},{"name":"The Batman","year":"2022","edition":"","rating":5.0,"lastWatched":"2026-01-18"},{"name":"Batman Begins","year":"2005","edition":"","rating":4.0,"lastWatched":"2025-11-09"},{"name":"Batman Forever","year":"1995","edition":"","rating":3.5,"lastWatched":"2023-05-15"},{"name":"Batman Returns","year":"1992","edition":"","rating":3.5,"lastWatched":"2023-04-21"},{"name":"Beau Is Afraid","year":"2023","edition":"","rating":3.5,"lastWatched":"2023-04-25"},{"name":"Beetlejuice","year":"1988","edition":"","rating":4.5,"lastWatched":"2025-10-22"},{"name":"Before Midnight","year":"2013","edition":"","rating":4.5,"lastWatched":"2024-11-04"},{"name":"Before Sunrise","year":"1995","edition":"","rating":5.0,"lastWatched":"2025-09-12"},{"name":"Before Sunset","year":"2004","edition":"","rating":4.5,"lastWatched":"2025-09-15"},{"name":"Being John Malkovich","year":"1999","edition":"","rating":4.0,"lastWatched":"2024-08-09"},{"name":"Best in Show","year":"2000","edition":"","rating":3.5,"lastWatched":"2025-11-27"},{"name":"A Better Tomorrow","year":"1986","edition":"","rating":3.5,"lastWatched":"2026-05-24"},{"name":"A Better Tomorrow II","year":"1987","edition":"","rating":null,"lastWatched":null},{"name":"A Better Tomorrow III: Love and Death in Saigon","year":"1989","edition":"","rating":null,"lastWatched":null},{"name":"The Big Chill","year":"1983","edition":"","rating":3.5,"lastWatched":"2024-07-22"},{"name":"The Big Lebowski","year":"1998","edition":"2 copies. steelbook & collector\u2019s edition","rating":5.0,"lastWatched":"2026-04-03"},{"name":"Black Hawk Down","year":"2001","edition":"","rating":4.0,"lastWatched":"2023-11-09"},{"name":"Blade","year":"1998","edition":"","rating":3.5,"lastWatched":"2025-08-14"},{"name":"Blade Runner","year":"1982","edition":"","rating":5.0,"lastWatched":"2025-03-01"},{"name":"Blade Runner 2049","year":"2017","edition":"2 copies. 4k blu ray and 4k steelbook","rating":5.0,"lastWatched":"2025-04-16"},{"name":"Blazing Saddles","year":"1974","edition":"","rating":3.5,"lastWatched":null},{"name":"Blood Simple","year":"1984","edition":"","rating":3.5,"lastWatched":"2025-07-21"},{"name":"Blow Out","year":"1981","edition":"","rating":5.0,"lastWatched":"2025-09-26"},{"name":"Body Heat","year":"1981","edition":"","rating":3.0,"lastWatched":"2025-07-20"},{"name":"Boogie Nights","year":"1997","edition":"","rating":4.5,"lastWatched":"2026-02-06"},{"name":"The Bourne Identity","year":"2002","edition":"","rating":3.5,"lastWatched":"2023-12-26"},{"name":"The Bourne Legacy","year":"2012","edition":"","rating":2.5,"lastWatched":"2024-02-13"},{"name":"The Bourne Supremacy","year":"2004","edition":"","rating":3.5,"lastWatched":"2026-03-09"},{"name":"The Bourne Ultimatum","year":"2007","edition":"","rating":3.5,"lastWatched":"2024-11-25"},{"name":"Brazil","year":"1985","edition":"","rating":4.0,"lastWatched":"2026-01-03"},{"name":"Bring Her Back","year":"2025","edition":"","rating":4.0,"lastWatched":"2025-08-19"},{"name":"The Brutalist","year":"2024","edition":"","rating":4.5,"lastWatched":"2026-01-13"},{"name":"Bullet Train","year":"2022","edition":"","rating":4.0,"lastWatched":"2026-01-11"},{"name":"The 'Burbs","year":"1989","edition":"","rating":3.5,"lastWatched":"2025-10-06"},{"name":"Burn After Reading","year":"2008","edition":"","rating":4.0,"lastWatched":"2026-02-03"},{"name":"The Cabin in the Woods","year":"2011","edition":"","rating":4.0,"lastWatched":"2026-05-08"},{"name":"Caddyshack","year":"1980","edition":"","rating":4.0,"lastWatched":null},{"name":"Cape Fear","year":"1991","edition":"","rating":4.0,"lastWatched":"2026-03-29"},{"name":"Carlito's Way","year":"1993","edition":"","rating":4.5,"lastWatched":"2025-12-20"},{"name":"Casablanca","year":"1942","edition":"","rating":5.0,"lastWatched":"2026-04-07"},{"name":"Casino","year":"1995","edition":"","rating":5.0,"lastWatched":"2026-05-26"},{"name":"Casino Royale","year":"2006","edition":"","rating":4.0,"lastWatched":"2025-08-28"},{"name":"Challengers","year":"2024","edition":"","rating":4.5,"lastWatched":"2025-08-31"},{"name":"Charade","year":"1963","edition":"","rating":4.0,"lastWatched":"2025-11-16"},{"name":"Chinatown","year":"1974","edition":"","rating":4.5,"lastWatched":"2024-05-28"},{"name":"Chungking Express","year":"1994","edition":"","rating":4.5,"lastWatched":"2025-07-09"},{"name":"A Clockwork Orange","year":"1971","edition":"","rating":4.5,"lastWatched":null},{"name":"Close Encounters of the Third Kind","year":"1977","edition":"","rating":3.5,"lastWatched":"2024-06-16"},{"name":"Clue","year":"1985","edition":"","rating":4.5,"lastWatched":"2026-03-01"},{"name":"Coherence","year":"2013","edition":"","rating":4.0,"lastWatched":"2026-04-22"},{"name":"Collateral","year":"2004","edition":"","rating":3.5,"lastWatched":"2026-01-23"},{"name":"The Color of Money","year":"1986","edition":"","rating":4.0,"lastWatched":"2026-04-29"},{"name":"Con Air","year":"1997","edition":"","rating":3.5,"lastWatched":"2025-03-03"},{"name":"Constantine","year":"2005","edition":"","rating":4.0,"lastWatched":"2025-06-14"},{"name":"Cowboy Bebop","year":"1998","edition":"","rating":5.0,"lastWatched":null},{"name":"Crank","year":"2006","edition":"","rating":3.5,"lastWatched":"2023-05-28"},{"name":"Creed III","year":"2023","edition":"","rating":4.0,"lastWatched":"2023-03-13"},{"name":"Creepshow","year":"1982","edition":"","rating":3.5,"lastWatched":"2025-10-18"},{"name":"Cure","year":"1997","edition":"","rating":4.0,"lastWatched":"2025-07-02"},{"name":"The Dark Knight","year":"2008","edition":"","rating":5.0,"lastWatched":"2024-06-14"},{"name":"The Dark Knight Rises","year":"2012","edition":"","rating":4.0,"lastWatched":"2024-06-14"},{"name":"Days of Heaven","year":"1978","edition":"","rating":4.5,"lastWatched":"2026-04-12"},{"name":"Days of Thunder","year":"1990","edition":"","rating":3.0,"lastWatched":"2025-06-21"},{"name":"Dazed and Confused","year":"1993","edition":"","rating":4.0,"lastWatched":"2024-07-09"},{"name":"Decision to Leave","year":"2022","edition":"","rating":4.5,"lastWatched":"2025-11-30"},{"name":"The Departed","year":"2006","edition":"","rating":5.0,"lastWatched":"2025-11-02"},{"name":"Diabolique","year":"1955","edition":"","rating":4.5,"lastWatched":"2024-08-11"},{"name":"Dim Sum: A Little Bit of Heart","year":"1985","edition":"","rating":3.5,"lastWatched":"2025-07-31"},{"name":"Dirty Dancing","year":"1987","edition":"","rating":4.0,"lastWatched":"2023-11-10"},{"name":"Dirty Harry","year":"1971","edition":"","rating":4.0,"lastWatched":"2023-05-24"},{"name":"Doctor Strange","year":"2016","edition":"","rating":3.0,"lastWatched":null},{"name":"Dogtooth","year":"2009","edition":"","rating":3.0,"lastWatched":"2026-01-25"},{"name":"Donnie Darko","year":"2001","edition":"","rating":4.5,"lastWatched":"2023-08-28"},{"name":"Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb","year":"1964","edition":"","rating":4.5,"lastWatched":"2025-11-06"},{"name":"Dreams","year":"1990","edition":"","rating":4.0,"lastWatched":"2024-08-16"},{"name":"Dressed to Kill","year":"1980","edition":"","rating":4.0,"lastWatched":"2026-03-24"},{"name":"Drive","year":"2011","edition":"2 copies. 4k steelbook & blu ray steelbook","rating":5.0,"lastWatched":"2024-08-27"},{"name":"Dune","year":"2021","edition":"4k blu ray & 4k steelbook","rating":5.0,"lastWatched":"2025-03-07"},{"name":"Dune: Part Two","year":"2024","edition":"","rating":5.0,"lastWatched":"2025-03-07"},{"name":"Dunkirk","year":"2017","edition":"","rating":5.0,"lastWatched":"2025-02-24"},{"name":"The Empire Strikes Back","year":"1980","edition":"","rating":4.5,"lastWatched":"2026-05-05"},{"name":"Encanto","year":"2021","edition":"","rating":4.5,"lastWatched":"2025-11-05"},{"name":"Enter the Dragon","year":"1973","edition":"","rating":4.0,"lastWatched":"2024-08-16"},{"name":"The Equalizer","year":"2014","edition":"","rating":3.5,"lastWatched":"2023-11-14"},{"name":"The Equalizer 2","year":"2018","edition":"","rating":3.0,"lastWatched":"2025-02-23"},{"name":"The Equalizer 3","year":"2023","edition":"","rating":3.5,"lastWatched":"2023-11-18"},{"name":"Everything Everywhere All at Once","year":"2022","edition":"4k blu ray, nova steelbook, a24 collectors edition","rating":5.0,"lastWatched":"2024-08-28"},{"name":"Evil Dead","year":"2013","edition":"4k collector\u2019s edition, 4k steelbook","rating":5.0,"lastWatched":"2024-10-11"},{"name":"The Evil Dead","year":"1981","edition":"","rating":3.5,"lastWatched":"2026-04-24"},{"name":"Evil Dead II","year":"1987","edition":"","rating":4.5,"lastWatched":"2025-03-23"},{"name":"Evil Dead Rise","year":"2023","edition":"","rating":3.0,"lastWatched":"2023-06-28"},{"name":"Ex Machina","year":"2015","edition":"","rating":4.0,"lastWatched":"2025-11-04"},{"name":"Excalibur","year":"1981","edition":"","rating":4.0,"lastWatched":"2026-02-25"},{"name":"The Exorcist","year":"1973","edition":"","rating":5.0,"lastWatched":"2025-10-03"},{"name":"The Exorcist: Believer","year":"2023","edition":"","rating":2.5,"lastWatched":"2023-10-05"},{"name":"Exotica","year":"1994","edition":"","rating":4.5,"lastWatched":"2025-07-15"},{"name":"Expend4bles","year":"2023","edition":"","rating":null,"lastWatched":null},{"name":"The Expendables 2","year":"2012","edition":"","rating":null,"lastWatched":null},{"name":"The Expendables 3","year":"2014","edition":"","rating":null,"lastWatched":null},{"name":"Eyes Wide Shut","year":"1999","edition":"","rating":4.0,"lastWatched":"2025-11-29"},{"name":"F1","year":"2025","edition":"","rating":3.5,"lastWatched":"2025-12-27"},{"name":"Face/Off","year":"1997","edition":"","rating":4.0,"lastWatched":"2023-05-21"},{"name":"Fantastic Mr. Fox","year":"2009","edition":"","rating":5.0,"lastWatched":"2025-11-03"},{"name":"Fargo","year":"1996","edition":"","rating":5.0,"lastWatched":"2026-01-25"},{"name":"Fear and Loathing in Las Vegas","year":"1998","edition":"","rating":4.5,"lastWatched":"2025-03-09"},{"name":"Ferris Bueller's Day Off","year":"1986","edition":"","rating":5.0,"lastWatched":"2026-01-10"},{"name":"The Fifth Element","year":"1997","edition":"","rating":4.5,"lastWatched":"2025-04-08"},{"name":"Fight Club","year":"1999","edition":"","rating":4.5,"lastWatched":"2026-01-26"},{"name":"Fist of Fury","year":"1972","edition":"","rating":4.0,"lastWatched":"2026-04-28"},{"name":"The Fog","year":"1980","edition":"","rating":3.5,"lastWatched":"2025-10-16"},{"name":"Forgetting Sarah Marshall","year":"2008","edition":"","rating":4.0,"lastWatched":"2024-06-14"},{"name":"Friday","year":"1995","edition":"","rating":5.0,"lastWatched":"2025-09-29"},{"name":"Friday the 13th","year":"1980","edition":"","rating":3.0,"lastWatched":"2024-10-29"},{"name":"From Dusk Till Dawn","year":"1996","edition":"","rating":3.5,"lastWatched":"2024-06-29"},{"name":"Furiosa: A Mad Max Saga","year":"2024","edition":"4k steelbook, mad max collection w/ black & chrome edition","rating":4.0,"lastWatched":"2024-08-23"},{"name":"The Game","year":"1997","edition":"","rating":3.0,"lastWatched":"2023-07-11"},{"name":"Game of Death","year":"1978","edition":"","rating":null,"lastWatched":null},{"name":"Get Out","year":"2017","edition":"","rating":5.0,"lastWatched":"2026-03-18"},{"name":"Ghost in the Shell","year":"1995","edition":"3 blu ray steelbooks","rating":4.5,"lastWatched":"2025-11-12"},{"name":"The Girl with the Dragon Tattoo","year":"2011","edition":"","rating":4.5,"lastWatched":"2026-04-09"},{"name":"Gladiator","year":"2000","edition":"","rating":4.0,"lastWatched":"2024-11-12"},{"name":"Glengarry Glen Ross","year":"1992","edition":"","rating":3.5,"lastWatched":"2026-03-08"},{"name":"The Godfather","year":"1972","edition":"","rating":5.0,"lastWatched":"2026-01-26"},{"name":"The Godfather Part II","year":"1974","edition":"","rating":5.0,"lastWatched":"2026-01-28"},{"name":"The Godfather Part III","year":"1990","edition":"","rating":3.0,"lastWatched":"2025-02-21"},{"name":"Godzilla","year":"1998","edition":"","rating":1.5,"lastWatched":"2023-11-29"},{"name":"Gone Girl","year":"2014","edition":"","rating":4.5,"lastWatched":"2026-02-22"},{"name":"Good Time","year":"2017","edition":"","rating":4.0,"lastWatched":"2026-02-27"},{"name":"Good Will Hunting","year":"1997","edition":"","rating":5.0,"lastWatched":"2026-04-05"},{"name":"GoodFellas","year":"1990","edition":"","rating":5.0,"lastWatched":"2026-01-29"},{"name":"Gran Turismo","year":"2023","edition":"","rating":3.0,"lastWatched":"2025-05-20"},{"name":"The Grand Budapest Hotel","year":"2014","edition":"","rating":5.0,"lastWatched":"2024-12-22"},{"name":"The Great Escape","year":"1963","edition":"","rating":4.0,"lastWatched":"2024-08-11"},{"name":"Green Room","year":"2015","edition":"","rating":4.0,"lastWatched":"2025-01-03"},{"name":"Grindhouse","year":"2007","edition":"","rating":4.0,"lastWatched":null},{"name":"Halloween","year":"1978","edition":"","rating":4.0,"lastWatched":"2025-10-31"},{"name":"Harakiri","year":"1962","edition":"","rating":4.5,"lastWatched":"2024-05-30"},{"name":"Hard Boiled","year":"1992","edition":"","rating":4.5,"lastWatched":"2026-03-28"},{"name":"Heat","year":"1995","edition":"","rating":5.0,"lastWatched":"2025-11-10"},{"name":"Hellbound: Hellraiser II","year":"1988","edition":"","rating":3.5,"lastWatched":"2024-09-22"},{"name":"Hellraiser","year":"1987","edition":"","rating":4.0,"lastWatched":"2023-10-06"},{"name":"Hellraiser: Bloodline","year":"1996","edition":"","rating":3.0,"lastWatched":"2025-10-19"},{"name":"Hellraiser III: Hell on Earth","year":"1992","edition":"","rating":3.5,"lastWatched":"2025-03-29"},{"name":"Hereditary","year":"2018","edition":"","rating":5.0,"lastWatched":"2024-04-24"},{"name":"High and Low","year":"1963","edition":"","rating":5.0,"lastWatched":"2024-08-07"},{"name":"The Hills Have Eyes","year":"1977","edition":"","rating":3.5,"lastWatched":"2023-09-02"},{"name":"A History of Violence","year":"2005","edition":"","rating":3.5,"lastWatched":"2025-11-11"},{"name":"The Hitchhiker's Guide to the Galaxy","year":"2005","edition":"","rating":5.0,"lastWatched":"2025-08-05"},{"name":"House","year":"1977","edition":"","rating":4.5,"lastWatched":"2024-10-04"},{"name":"House of 1000 Corpses","year":"2003","edition":"","rating":4.0,"lastWatched":"2025-10-29"},{"name":"How to Get Ahead in Advertising","year":"1989","edition":"","rating":4.0,"lastWatched":"2025-07-23"},{"name":"Hundreds of Beavers","year":"2022","edition":"","rating":4.5,"lastWatched":"2025-04-13"},{"name":"The Hurt Locker","year":"2008","edition":"","rating":4.0,"lastWatched":"2024-06-23"},{"name":"I Am Legend","year":"2007","edition":"","rating":3.0,"lastWatched":"2026-02-04"},{"name":"Ikiru","year":"1952","edition":"","rating":5.0,"lastWatched":"2023-07-11"},{"name":"In the Mood for Love","year":"2000","edition":"","rating":4.5,"lastWatched":"2025-08-02"},{"name":"Inception","year":"2010","edition":"","rating":4.5,"lastWatched":"2025-04-11"},{"name":"Infernal Affairs","year":"2002","edition":"","rating":4.0,"lastWatched":"2026-01-30"},{"name":"Infernal Affairs II","year":"2003","edition":"","rating":null,"lastWatched":null},{"name":"Infernal Affairs III","year":"2003","edition":"","rating":null,"lastWatched":null},{"name":"Infinity Pool","year":"2023","edition":"","rating":4.0,"lastWatched":"2025-04-01"},{"name":"Inglourious Basterds","year":"2009","edition":"","rating":5.0,"lastWatched":"2025-09-19"},{"name":"Innerspace","year":"1987","edition":"","rating":3.5,"lastWatched":"2026-05-09"},{"name":"Interstellar","year":"2014","edition":"4k blu ray & 10th anniversary collector\u2019s edition","rating":5.0,"lastWatched":"2025-11-01"},{"name":"The Invasion","year":"2007","edition":"","rating":3.0,"lastWatched":null},{"name":"The Irishman","year":"2019","edition":"","rating":4.0,"lastWatched":"2023-09-28"},{"name":"It Follows","year":"2014","edition":"","rating":4.5,"lastWatched":"2024-10-23"},{"name":"Jackie Brown","year":"1997","edition":"","rating":5.0,"lastWatched":"2026-03-27"},{"name":"Jason Bourne","year":"2016","edition":"","rating":2.5,"lastWatched":"2026-05-25"},{"name":"JFK","year":"1991","edition":"","rating":5.0,"lastWatched":"2026-02-15"},{"name":"John Wick","year":"2014","edition":"","rating":4.5,"lastWatched":"2025-05-31"},{"name":"John Wick: Chapter 2","year":"2017","edition":"","rating":4.0,"lastWatched":"2025-06-01"},{"name":"John Wick: Chapter 3 \u2013 Parabellum","year":"2019","edition":"","rating":4.0,"lastWatched":"2025-06-03"},{"name":"John Wick: Chapter 4","year":"2023","edition":"","rating":4.5,"lastWatched":"2025-06-04"},{"name":"Joker","year":"2019","edition":"","rating":3.5,"lastWatched":"2023-06-14"},{"name":"Jujutsu Kaisen 0","year":"2021","edition":"","rating":3.0,"lastWatched":"2023-05-26"},{"name":"Jurassic Park","year":"1993","edition":"","rating":5.0,"lastWatched":"2025-06-06"},{"name":"Kill Bill: Vol. 1","year":"2003","edition":"","rating":5.0,"lastWatched":"2024-12-23"},{"name":"Kill Bill: Vol. 2","year":"2004","edition":"","rating":4.5,"lastWatched":"2024-12-23"},{"name":"The Kill Room","year":"2023","edition":"","rating":3.0,"lastWatched":"2024-05-02"},{"name":"The Killer","year":"1989","edition":"","rating":5.0,"lastWatched":"2026-04-30"},{"name":"Killers of the Flower Moon","year":"2023","edition":"","rating":4.0,"lastWatched":"2026-04-19"},{"name":"Kingsman: The Golden Circle","year":"2017","edition":"","rating":3.0,"lastWatched":"2025-05-22"},{"name":"Kingsman: The Secret Service","year":"2014","edition":"","rating":3.5,"lastWatched":"2024-02-08"},{"name":"La Haine","year":"1995","edition":"","rating":5.0,"lastWatched":"2025-07-12"},{"name":"La La Land","year":"2016","edition":"","rating":5.0,"lastWatched":"2026-03-30"},{"name":"Lady Snowblood","year":"1973","edition":"","rating":4.0,"lastWatched":"2024-08-12"},{"name":"Lady Snowblood 2: Love Song of Vengeance","year":"1974","edition":"","rating":3.0,"lastWatched":"2024-08-14"},{"name":"The Last Picture Show","year":"1971","edition":"","rating":4.0,"lastWatched":"2024-07-06"},{"name":"Late Night with the Devil","year":"2023","edition":"","rating":3.5,"lastWatched":"2024-04-19"},{"name":"Law Abiding Citizen","year":"2009","edition":"","rating":4.0,"lastWatched":"2025-03-14"},{"name":"Le Cercle Rouge","year":"1970","edition":"","rating":4.0,"lastWatched":"2025-08-20"},{"name":"Le Samoura\u00ef","year":"1967","edition":"","rating":4.5,"lastWatched":"2024-07-11"},{"name":"L\u00e9on: The Professional","year":"1994","edition":"","rating":3.5,"lastWatched":"2023-05-14"},{"name":"The Life Aquatic with Steve Zissou","year":"2004","edition":"","rating":4.0,"lastWatched":"2026-04-11"},{"name":"The Lighthouse","year":"2019","edition":"","rating":5.0,"lastWatched":"2024-11-13"},{"name":"The Long Goodbye","year":"1973","edition":"","rating":5.0,"lastWatched":"2026-04-26"},{"name":"Longlegs","year":"2024","edition":"","rating":4.5,"lastWatched":"2026-04-25"},{"name":"The Lord of the Rings: The Fellowship of the Ring","year":"2001","edition":"","rating":5.0,"lastWatched":"2025-11-27"},{"name":"The Lord of the Rings: The Return of the King","year":"2003","edition":"","rating":5.0,"lastWatched":"2025-12-26"},{"name":"The Lord of the Rings: The Two Towers","year":"2002","edition":"","rating":5.0,"lastWatched":"2025-12-02"},{"name":"M3GAN","year":"2022","edition":"","rating":3.0,"lastWatched":"2023-10-10"},{"name":"Mad Max","year":"1979","edition":"","rating":3.0,"lastWatched":"2024-07-16"},{"name":"Mad Max 2","year":"1981","edition":"","rating":3.5,"lastWatched":"2023-07-28"},{"name":"Mad Max Beyond Thunderdome","year":"1985","edition":"","rating":null,"lastWatched":null},{"name":"Mad Max: Fury Road","year":"2015","edition":"4k steelbook, mad max collection w/ black & chrome edition","rating":4.5,"lastWatched":"2024-05-15"},{"name":"Major League","year":"1989","edition":"","rating":4.0,"lastWatched":"2026-01-19"},{"name":"The Manchurian Candidate","year":"1962","edition":"","rating":4.0,"lastWatched":"2024-04-04"},{"name":"The Manchurian Candidate","year":"2004","edition":"","rating":4.0,"lastWatched":"2026-02-28"},{"name":"Mandy","year":"2018","edition":"","rating":4.5,"lastWatched":"2025-07-16"},{"name":"The Martian","year":"2015","edition":"","rating":4.0,"lastWatched":"2026-03-21"},{"name":"Marty Supreme","year":"2025","edition":"","rating":4.5,"lastWatched":"2026-04-02"},{"name":"The Mask","year":"1994","edition":"","rating":4.0,"lastWatched":"2026-01-22"},{"name":"The Master","year":"2012","edition":"","rating":4.0,"lastWatched":"2024-08-25"},{"name":"The Matrix","year":"1999","edition":"","rating":5.0,"lastWatched":"2024-02-05"},{"name":"The Matrix Reloaded","year":"2003","edition":"","rating":3.5,"lastWatched":"2024-02-06"},{"name":"The Matrix Resurrections","year":"2021","edition":"","rating":2.5,"lastWatched":"2024-02-07"},{"name":"The Matrix Revolutions","year":"2003","edition":"","rating":3.0,"lastWatched":"2024-02-07"},{"name":"MaXXXine","year":"2024","edition":"","rating":3.0,"lastWatched":"2026-03-05"},{"name":"Mean Streets","year":"1973","edition":"","rating":4.5,"lastWatched":"2025-02-01"},{"name":"Memories of Murder","year":"2003","edition":"","rating":4.5,"lastWatched":"2026-05-22"},{"name":"Miami Vice","year":"2006","edition":"","rating":4.0,"lastWatched":"2026-02-23"},{"name":"Midsommar","year":"2019","edition":"","rating":5.0,"lastWatched":"2024-06-20"},{"name":"Miller's Crossing","year":"1990","edition":"","rating":3.5,"lastWatched":"2026-02-22"},{"name":"Misery","year":"1990","edition":"","rating":null,"lastWatched":null},{"name":"Mission: Impossible","year":"1996","edition":"","rating":4.0,"lastWatched":"2025-05-13"},{"name":"Mission: Impossible \u2013 Dead Reckoning","year":"2023","edition":"","rating":4.0,"lastWatched":"2025-05-25"},{"name":"Mission: Impossible \u2013 Fallout","year":"2018","edition":"","rating":3.5,"lastWatched":"2025-05-17"},{"name":"Mission: Impossible \u2013 Ghost Protocol","year":"2011","edition":"","rating":3.5,"lastWatched":"2025-05-10"},{"name":"Mission: Impossible \u2013 Rogue Nation","year":"2015","edition":"","rating":3.5,"lastWatched":"2025-05-15"},{"name":"Mission: Impossible II","year":"2000","edition":"","rating":3.5,"lastWatched":"2025-05-24"},{"name":"Mission: Impossible III","year":"2006","edition":"","rating":3.5,"lastWatched":"2025-05-19"},{"name":"The Mist","year":"2007","edition":"","rating":3.5,"lastWatched":"2023-10-12"},{"name":"Moneyball","year":"2011","edition":"","rating":5.0,"lastWatched":"2025-11-10"},{"name":"Moonstruck","year":"1987","edition":"","rating":4.0,"lastWatched":"2025-11-30"},{"name":"Mothra","year":"1961","edition":"","rating":null,"lastWatched":null},{"name":"Mulholland Drive","year":"2001","edition":"","rating":3.5,"lastWatched":"2023-09-14"},{"name":"My Neighbor Totoro","year":"1988","edition":"","rating":4.0,"lastWatched":"2024-05-18"},{"name":"The Naked Gun: From the Files of Police Squad!","year":"1988","edition":"","rating":3.5,"lastWatched":"2024-07-15"},{"name":"National Lampoon's Vacation","year":"1983","edition":"","rating":4.0,"lastWatched":null},{"name":"Natural Born Killers","year":"1994","edition":"","rating":4.5,"lastWatched":null},{"name":"Network","year":"1976","edition":"","rating":4.5,"lastWatched":"2024-07-13"},{"name":"The Nice Guys","year":"2016","edition":"","rating":4.0,"lastWatched":"2026-05-01"},{"name":"A Nightmare on Elm Street","year":"1984","edition":"","rating":5.0,"lastWatched":"2025-10-01"},{"name":"No Country for Old Men","year":"2007","edition":"","rating":5.0,"lastWatched":"2025-05-13"},{"name":"No Time to Die","year":"2021","edition":"","rating":4.0,"lastWatched":"2023-08-07"},{"name":"Nope","year":"2022","edition":"","rating":4.5,"lastWatched":"2025-08-22"},{"name":"The Northman","year":"2022","edition":"","rating":4.5,"lastWatched":"2024-02-14"},{"name":"Nosferatu","year":"2024","edition":"","rating":5.0,"lastWatched":"2025-08-09"},{"name":"Ocean's Eleven","year":"2001","edition":"","rating":5.0,"lastWatched":"2025-12-31"},{"name":"Ocean's Thirteen","year":"2007","edition":"","rating":3.5,"lastWatched":"2025-05-20"},{"name":"Ocean's Twelve","year":"2004","edition":"","rating":3.5,"lastWatched":"2026-01-05"},{"name":"Oldboy","year":"2003","edition":"","rating":4.5,"lastWatched":"2026-02-01"},{"name":"Once Upon a Time... in Hollywood","year":"2019","edition":"","rating":5.0,"lastWatched":"2025-07-28"},{"name":"One Battle After Another","year":"2025","edition":"","rating":5.0,"lastWatched":"2026-01-24"},{"name":"Onibaba","year":"1964","edition":"","rating":4.0,"lastWatched":"2024-07-26"},{"name":"Oppenheimer","year":"2023","edition":"4k blu ray, 4k steelbook, collector\u2019s edition","rating":5.0,"lastWatched":"2026-02-08"},{"name":"The Others","year":"2001","edition":"","rating":3.5,"lastWatched":"2023-12-01"},{"name":"Out of Sight","year":"1998","edition":"","rating":3.5,"lastWatched":"2026-05-02"},{"name":"Panic Room","year":"2002","edition":"","rating":4.0,"lastWatched":"2026-01-31"},{"name":"Pan's Labyrinth","year":"2006","edition":"","rating":4.0,"lastWatched":"2025-12-18"},{"name":"Paprika","year":"2006","edition":"","rating":4.0,"lastWatched":"2024-06-01"},{"name":"Parasite","year":"2019","edition":"","rating":5.0,"lastWatched":"2023-05-23"},{"name":"Paris, Texas","year":"1984","edition":"","rating":4.5,"lastWatched":"2024-07-03"},{"name":"Past Lives","year":"2023","edition":"","rating":4.0,"lastWatched":"2026-04-05"},{"name":"Pearl","year":"2022","edition":"","rating":3.5,"lastWatched":"2025-10-31"},{"name":"The People Under the Stairs","year":"1991","edition":"","rating":2.5,"lastWatched":"2024-08-19"},{"name":"Perfect Blue","year":"1997","edition":"","rating":4.0,"lastWatched":"2025-10-10"},{"name":"Phantom Thread","year":"2017","edition":"","rating":5.0,"lastWatched":"2025-09-28"},{"name":"Pierrot le Fou","year":"1965","edition":"","rating":null,"lastWatched":null},{"name":"Point Blank","year":"1967","edition":"","rating":4.0,"lastWatched":"2026-01-01"},{"name":"Poor Things","year":"2023","edition":"","rating":4.5,"lastWatched":"2024-03-18"},{"name":"Portrait of a Lady on Fire","year":"2019","edition":"","rating":5.0,"lastWatched":"2025-08-02"},{"name":"Possessor","year":"2020","edition":"","rating":4.0,"lastWatched":"2025-03-29"},{"name":"Prey","year":"2022","edition":"","rating":4.0,"lastWatched":"2024-08-04"},{"name":"Prime Cut","year":"1972","edition":"","rating":4.0,"lastWatched":"2026-05-19"},{"name":"The Princess Bride","year":"1987","edition":"","rating":5.0,"lastWatched":"2025-12-15"},{"name":"Princess Mononoke","year":"1997","edition":"","rating":5.0,"lastWatched":"2025-03-27"},{"name":"Prometheus","year":"2012","edition":"","rating":3.5,"lastWatched":"2025-08-25"},{"name":"Pulp Fiction","year":"1994","edition":"4k steelbook, 40th anniversary collector\u2019s edition","rating":5.0,"lastWatched":"2025-12-28"},{"name":"Punch-Drunk Love","year":"2002","edition":"","rating":4.0,"lastWatched":"2025-11-15"},{"name":"Pusher","year":"1996","edition":"","rating":null,"lastWatched":null},{"name":"Pusher II","year":"2004","edition":"","rating":null,"lastWatched":null},{"name":"Pusher III","year":"2005","edition":"","rating":null,"lastWatched":null},{"name":"Quantum of Solace","year":"2008","edition":"","rating":3.5,"lastWatched":"2023-08-04"},{"name":"Raging Bull","year":"1980","edition":"","rating":4.5,"lastWatched":"2023-07-18"},{"name":"Ran","year":"1985","edition":"","rating":4.0,"lastWatched":"2023-06-14"},{"name":"Real Life","year":"1979","edition":"","rating":3.5,"lastWatched":"2025-08-12"},{"name":"Re-Animator","year":"1985","edition":"","rating":4.0,"lastWatched":"2025-10-05"},{"name":"Repo Man","year":"1984","edition":"","rating":4.0,"lastWatched":"2025-07-20"},{"name":"Reservoir Dogs","year":"1992","edition":"","rating":4.5,"lastWatched":"2024-07-13"},{"name":"Return of the Jedi","year":"1983","edition":"","rating":4.0,"lastWatched":"2026-05-06"},{"name":"Risky Business","year":"1983","edition":"","rating":3.5,"lastWatched":"2024-07-25"},{"name":"Rocky","year":"1976","edition":"","rating":4.0,"lastWatched":"2023-03-07"},{"name":"Roman Holiday","year":"1953","edition":"","rating":4.0,"lastWatched":"2025-05-07"},{"name":"Rosemary's Baby","year":"1968","edition":"","rating":4.0,"lastWatched":"2024-01-31"},{"name":"Rudy","year":"1993","edition":"","rating":4.0,"lastWatched":"2023-11-28"},{"name":"Sabrina","year":"1954","edition":"","rating":4.0,"lastWatched":"2025-05-08"},{"name":"Scarface","year":"1983","edition":"","rating":4.5,"lastWatched":"2023-11-21"},{"name":"Schindler's List","year":"1993","edition":"","rating":5.0,"lastWatched":"2024-07-30"},{"name":"School of Rock","year":"2003","edition":"","rating":4.0,"lastWatched":null},{"name":"Scott Pilgrim vs. the World","year":"2010","edition":"","rating":5.0,"lastWatched":"2025-05-19"},{"name":"Scream","year":"1996","edition":"","rating":4.0,"lastWatched":"2025-10-10"},{"name":"Scream 2","year":"1997","edition":"","rating":3.0,"lastWatched":"2025-10-13"},{"name":"Scream 3","year":"2000","edition":"","rating":2.5,"lastWatched":"2026-03-12"},{"name":"Se7en","year":"1995","edition":"","rating":5.0,"lastWatched":"2025-11-07"},{"name":"Seven Samurai","year":"1954","edition":"","rating":5.0,"lastWatched":"2024-08-21"},{"name":"The Shawshank Redemption","year":"1994","edition":"","rating":5.0,"lastWatched":"2025-05-25"},{"name":"The Shining","year":"1980","edition":"","rating":5.0,"lastWatched":"2025-06-24"},{"name":"Shutter Island","year":"2010","edition":"","rating":4.0,"lastWatched":"2025-03-25"},{"name":"Sicario","year":"2015","edition":"","rating":5.0,"lastWatched":"2026-03-13"},{"name":"The Silence of the Lambs","year":"1991","edition":"","rating":5.0,"lastWatched":"2025-07-05"},{"name":"Sin City","year":"2005","edition":"","rating":3.5,"lastWatched":"2026-04-15"},{"name":"Singin' in the Rain","year":"1952","edition":"","rating":5.0,"lastWatched":"2025-11-24"},{"name":"Sinners","year":"2025","edition":"","rating":5.0,"lastWatched":"2025-10-18"},{"name":"Sisu","year":"2022","edition":"","rating":3.5,"lastWatched":"2023-07-19"},{"name":"Skyfall","year":"2012","edition":"","rating":4.0,"lastWatched":"2024-06-26"},{"name":"Smile","year":"2022","edition":"","rating":3.5,"lastWatched":"2024-10-16"},{"name":"Snake Eyes","year":"1998","edition":"","rating":3.5,"lastWatched":"2024-07-02"},{"name":"Snakes on a Plane","year":"2006","edition":"","rating":3.0,"lastWatched":"2026-01-21"},{"name":"The Social Network","year":"2010","edition":"","rating":5.0,"lastWatched":"2026-01-15"},{"name":"Solaris","year":"1972","edition":"","rating":null,"lastWatched":null},{"name":"Sorcerer","year":"1977","edition":"","rating":5.0,"lastWatched":"2025-07-01"},{"name":"Spaceballs","year":"1987","edition":"","rating":4.0,"lastWatched":"2026-02-26"},{"name":"Spectre","year":"2015","edition":"","rating":3.0,"lastWatched":"2023-08-06"},{"name":"Speed","year":"1994","edition":"","rating":3.5,"lastWatched":"2025-09-20"},{"name":"Speed Racer","year":"2008","edition":"","rating":4.0,"lastWatched":"2026-05-23"},{"name":"Spider-Man","year":"2002","edition":"","rating":4.0,"lastWatched":"2025-01-04"},{"name":"Spider-Man 2","year":"2004","edition":"","rating":4.5,"lastWatched":"2026-01-27"},{"name":"Spider-Man 3","year":"2007","edition":"","rating":2.5,"lastWatched":null},{"name":"Spider-Man: Across the Spider-Verse","year":"2023","edition":"","rating":5.0,"lastWatched":"2023-09-02"},{"name":"Spider-Man: Into the Spider-Verse","year":"2018","edition":"","rating":5.0,"lastWatched":"2023-07-05"},{"name":"Spider-Man: No Way Home","year":"2021","edition":"","rating":3.0,"lastWatched":null},{"name":"Spirited Away","year":"2001","edition":"","rating":5.0,"lastWatched":"2023-07-10"},{"name":"Stalker","year":"1979","edition":"","rating":null,"lastWatched":null},{"name":"A Star Is Born","year":"2018","edition":"","rating":3.5,"lastWatched":"2023-06-24"},{"name":"Star Wars","year":"1977","edition":"","rating":4.0,"lastWatched":"2026-05-04"},{"name":"Step Brothers","year":"2008","edition":"","rating":5.0,"lastWatched":"2023-07-02"},{"name":"Strange Darling","year":"2023","edition":"","rating":4.5,"lastWatched":"2024-12-24"},{"name":"The Super Mario Bros. Movie","year":"2023","edition":"","rating":3.0,"lastWatched":"2023-11-13"},{"name":"Superman","year":"2025","edition":"","rating":3.5,"lastWatched":"2025-07-11"},{"name":"Talk Radio","year":"1988","edition":"","rating":null,"lastWatched":null},{"name":"Talk to Me","year":"2022","edition":"","rating":4.0,"lastWatched":"2023-10-05"},{"name":"Tampopo","year":"1985","edition":"","rating":5.0,"lastWatched":"2024-08-10"},{"name":"Taxi Driver","year":"1976","edition":"4k & blu ray steelbook","rating":4.5,"lastWatched":"2023-06-03"},{"name":"Teenage Mutant Ninja Turtles","year":"1990","edition":"","rating":3.5,"lastWatched":"2026-02-28"},{"name":"Teenage Mutant Ninja Turtles II: The Secret of the Ooze","year":"1991","edition":"","rating":null,"lastWatched":null},{"name":"Teenage Mutant Ninja Turtles III","year":"1993","edition":"","rating":null,"lastWatched":null},{"name":"Tenet","year":"2020","edition":"","rating":4.5,"lastWatched":"2026-04-17"},{"name":"The Terminator","year":"1984","edition":"","rating":4.0,"lastWatched":null},{"name":"Terminator 2: Judgment Day","year":"1991","edition":"","rating":4.5,"lastWatched":"2023-07-04"},{"name":"The Texas Chain Saw Massacre","year":"1974","edition":"","rating":5.0,"lastWatched":"2023-06-13"},{"name":"There Will Be Blood","year":"2007","edition":"","rating":5.0,"lastWatched":"2025-03-22"},{"name":"They Live","year":"1988","edition":"","rating":4.5,"lastWatched":"2024-10-22"},{"name":"Thief","year":"1981","edition":"","rating":5.0,"lastWatched":"2026-01-31"},{"name":"The Thing","year":"1982","edition":"","rating":5.0,"lastWatched":"2025-10-21"},{"name":"This Is Spinal Tap","year":"1984","edition":"","rating":4.0,"lastWatched":"2025-11-11"},{"name":"Three Days of the Condor","year":"1975","edition":"","rating":4.0,"lastWatched":"2026-02-21"},{"name":"To Live and Die in L.A.","year":"1985","edition":"","rating":5.0,"lastWatched":"2026-03-10"},{"name":"Tommy","year":"1975","edition":"","rating":3.5,"lastWatched":"2025-12-06"},{"name":"Top Gun","year":"1986","edition":"","rating":4.0,"lastWatched":"2026-05-13"},{"name":"Top Gun: Maverick","year":"2022","edition":"","rating":4.5,"lastWatched":"2026-05-14"},{"name":"Total Recall","year":"1990","edition":"","rating":3.5,"lastWatched":null},{"name":"The Town","year":"2010","edition":"","rating":4.0,"lastWatched":"2026-05-18"},{"name":"Training Day","year":"2001","edition":"","rating":4.5,"lastWatched":"2025-07-27"},{"name":"Triangle of Sadness","year":"2022","edition":"","rating":4.5,"lastWatched":"2023-04-27"},{"name":"True Romance","year":"1993","edition":"","rating":4.5,"lastWatched":"2025-09-24"},{"name":"Twelve Monkeys","year":"1995","edition":"","rating":3.5,"lastWatched":"2023-08-31"},{"name":"The Umbrellas of Cherbourg","year":"1964","edition":"","rating":4.5,"lastWatched":"2025-04-27"},{"name":"Uncut Gems","year":"2019","edition":"","rating":4.5,"lastWatched":"2026-01-02"},{"name":"Underworld","year":"2003","edition":"","rating":3.5,"lastWatched":null},{"name":"Underworld: Awakening","year":"2012","edition":"","rating":null,"lastWatched":null},{"name":"Underworld: Blood Wars","year":"2016","edition":"","rating":null,"lastWatched":null},{"name":"Underworld: Evolution","year":"2006","edition":"","rating":null,"lastWatched":null},{"name":"Underworld: Rise of the Lycans","year":"2009","edition":"","rating":3.0,"lastWatched":null},{"name":"Videodrome","year":"1983","edition":"","rating":3.5,"lastWatched":"2025-10-28"},{"name":"Violent Night","year":"2022","edition":"","rating":null,"lastWatched":null},{"name":"WALL\u00b7E","year":"2008","edition":"","rating":5.0,"lastWatched":null},{"name":"Warfare","year":"2025","edition":"","rating":4.0,"lastWatched":"2025-04-12"},{"name":"Watchmen","year":"2009","edition":"","rating":4.5,"lastWatched":"2023-09-26"},{"name":"The Way of the Dragon","year":"1972","edition":"","rating":null,"lastWatched":null},{"name":"Wayne's World","year":"1992","edition":"","rating":4.0,"lastWatched":"2025-09-29"},{"name":"Weapons","year":"2025","edition":"","rating":4.0,"lastWatched":"2025-10-19"},{"name":"Westworld","year":"1973","edition":"","rating":3.5,"lastWatched":"2026-05-20"},{"name":"Wet Hot American Summer","year":"2001","edition":"","rating":4.0,"lastWatched":"2025-09-30"},{"name":"When Harry Met Sally...","year":"1989","edition":"","rating":5.0,"lastWatched":"2025-12-22"},{"name":"Whiplash","year":"2014","edition":"","rating":5.0,"lastWatched":"2025-12-30"},{"name":"Wild Things","year":"1998","edition":"","rating":3.5,"lastWatched":"2026-02-02"},{"name":"Willy Wonka & the Chocolate Factory","year":"1971","edition":"","rating":3.5,"lastWatched":null},{"name":"The Witch","year":"2015","edition":"","rating":5.0,"lastWatched":"2025-10-15"},{"name":"The Wolf of Wall Street","year":"2013","edition":"","rating":5.0,"lastWatched":"2023-06-17"},{"name":"X","year":"2022","edition":"","rating":4.0,"lastWatched":"2025-10-24"},{"name":"Y Tu Mam\u00e1 Tambi\u00e9n","year":"2001","edition":"","rating":4.5,"lastWatched":"2025-07-17"},{"name":"Zodiac","year":"2007","edition":"","rating":4.5,"lastWatched":"2026-01-16"},{"name":"Zoolander","year":"2001","edition":"","rating":3.5,"lastWatched":"2023-09-01"}];
const SEED_WANTLIST = [
  {"film":"Innerspace","year":"1987","label":"Arrow Limited Edition 4K","note":"New 4K from 35mm negative, Dante-approved, Dolby Vision. The headliner.","kind":"upgrade"},
  {"film":"Point Blank","year":"1967","label":"Criterion 4K","note":"Boorman-supervised restoration. Upgrade over your current copy.","kind":"upgrade"},
  {"film":"Top Gun","year":"1986","label":"40th Anniversary 4K Steelbook","note":"Clean upgrade, premium packaging.","kind":"upgrade"},
  {"film":"Bullet in the Head","year":"1990","label":"Arrow Limited Edition 4K","note":"The missing John Woo. Pairs with your Killer + Hard Boiled.","kind":"new"},
  {"film":"Bringing Out the Dead","year":"1999","label":"4K UHD","note":"The missing Scorsese. Schrader script, Nic Cage.","kind":"new"},
  {"film":"Audition","year":"1999","label":"Arrow Limited Edition 4K","note":"Miike. If you own Oldboy, you should own this. 160-page book.","kind":"new"},
  {"film":"The Elephant Man","year":"1980","label":"Criterion 4K","note":"Lynch. New 4K restoration with memoir readings.","kind":"new"},
  {"film":"Falling Down","year":"1993","label":"Arrow Limited Edition 4K","note":"Schumacher, Douglas, Duvall. In your wheelhouse.","kind":"new"},
  {"film":"Lawrence of Arabia","year":"1962","label":"4K UHD","note":"5\u2605 and you don't own it. The most cinematic film ever made.","kind":"gap"},
  {"film":"The Wizard of Oz","year":"1939","label":"Warner 4K","note":"5\u2605. Reference-disc Technicolor restoration.","kind":"gap"},
  {"film":"Stop Making Sense","year":"1984","label":"A24 4K","note":"5\u2605. Your highest-rated music doc, not owned.","kind":"gap"},
  {"film":"Incendies","year":"2010","label":"Criterion","note":"The one Villeneuve you don't own. 5\u2605.","kind":"gap"}
]
;

// ─── PALETTE: faded one-sheet ───────────────────────────────────────────
const C = {
  ink:    "#111110",  // background
  ink2:   "#1b1a17",  // raised surface
  ink3:   "#252320",  // card
  bone:   "#e8e2d0",  // primary text (newsprint)
  bone2:  "#a8a290",  // secondary text
  dim:    "#6f6a5c",  // muted
  red:    "#d6451f",  // primary accent — rep-poster vermilion
  ochre:  "#c8941f",  // secondary — faded gold
  teal:   "#4a8a85",  // want-list
  line:   "#34322c",  // hairline rules
};

const TAGS = {
  upgrade: { label: "Upgrade",  color: C.ochre, icon: "\u2191" },
  comfort: { label: "Comfort",  color: C.red,   icon: "\u2665" },
  hidden:  { label: "Gem",      color: C.teal,  icon: "\u2605" },
  rewatch: { label: "Rewatch",  color: C.bone2, icon: "\u27f3" },
  sell:    { label: "Sell",     color: C.dim,   icon: "\u2715" },
};

const TODAY = "2026-06-13";
const decadeOf = (y) => { const n = parseInt(y); return isNaN(n) ? null : Math.floor(n/10)*10; };
const yearsSince = (d) => { if (!d) return null; return ((new Date(TODAY) - new Date(d)) / (1000*60*60*24*365)).toFixed(1); };
const fkey = (f) => f.name + "|" + f.year;

// ─── FONT INJECTION ─────────────────────────────────────────────────────
function useFonts() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Archivo+Narrow:wght@400;500;600;700&family=Archivo:wght@400;500;600&display=swap";
    document.head.appendChild(l);
    return () => { document.head.removeChild(l); };
  }, []);
}
const DISPLAY = "'Oswald', 'Arial Narrow', sans-serif";
const NARROW = "'Archivo Narrow', 'Arial Narrow', sans-serif";
const BODY = "'Archivo', system-ui, sans-serif";

// ─── PERSISTENCE ────────────────────────────────────────────────────────
// Works two ways: window.storage (Claude artifact) OR localStorage (deployed).
const store = {
  async get(key) {
    if (typeof window !== "undefined" && window.storage) {
      try { const r = await window.storage.get(key); return r ? r.value : null; } catch { return null; }
    }
    try { return localStorage.getItem(key); } catch { return null; }
  },
  async set(key, val) {
    if (typeof window !== "undefined" && window.storage) {
      try { await window.storage.set(key, val); return; } catch {}
    }
    try { localStorage.setItem(key, val); } catch {}
  },
};

function useData() {
  const [userData, setUserData] = useState({});
  const [added, setAdded] = useState([]);
  const [want, setWant] = useState(SEED_WANTLIST.map((w) => ({ ...w, bought: false })));
  const [watchLog, setWatchLog] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const ud = await store.get("shelf-userdata"); if (ud) try { setUserData(JSON.parse(ud)); } catch {}
      const ad = await store.get("shelf-added");    if (ad) try { setAdded(JSON.parse(ad)); } catch {}
      const wl = await store.get("shelf-want");     if (wl) try { setWant(JSON.parse(wl)); } catch {}
      const wlog = await store.get("shelf-watchlog");if (wlog) try { setWatchLog(JSON.parse(wlog)); } catch {}
      setLoading(false);
    })();
  }, []);

  const updateFilm = (k, u) => { const next = { ...userData, [k]: { ...(userData[k]||{}), ...u } }; setUserData(next); store.set("shelf-userdata", JSON.stringify(next)); };
  const addFilm = (f) => { const next = [...added, { ...f, userAdded: true }]; setAdded(next); store.set("shelf-added", JSON.stringify(next)); };
  const removeFilm = (k) => { const next = added.filter((f) => fkey(f) !== k); setAdded(next); store.set("shelf-added", JSON.stringify(next)); };
  const logWatch = (k) => { const next = { ...watchLog, [k]: TODAY }; setWatchLog(next); store.set("shelf-watchlog", JSON.stringify(next)); };
  const setWantList = (next) => { setWant(next); store.set("shelf-want", JSON.stringify(next)); };

  const importAll = (payload) => {
    if (payload.userData) { setUserData(payload.userData); store.set("shelf-userdata", JSON.stringify(payload.userData)); }
    if (payload.added)    { setAdded(payload.added);       store.set("shelf-added", JSON.stringify(payload.added)); }
    if (payload.want)     { setWant(payload.want);         store.set("shelf-want", JSON.stringify(payload.want)); }
    if (payload.watchLog) { setWatchLog(payload.watchLog); store.set("shelf-watchlog", JSON.stringify(payload.watchLog)); }
  };

  return { userData, added, want, watchLog, loading, updateFilm, addFilm, removeFilm, logWatch, setWantList, importAll, exportPayload: () => ({ userData, added, want, watchLog }) };
}

// ─── SHARED BITS ────────────────────────────────────────────────────────
function Stars({ rating, size = 12 }) {
  if (rating == null) return <span style={{ fontSize: size, color: C.dim }}>unrated</span>;
  return <span style={{ color: C.ochre, fontSize: size, fontWeight: 600, fontFamily: NARROW }}>{rating.toFixed(1)}\u2605</span>;
}

function FilmRow({ film, tags, onClick }) {
  const recent = yearsSince(film.lastWatched);
  const cold = recent && parseFloat(recent) > 2;
  return (
    <div onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px",
        borderBottom: "1px solid " + C.line, cursor: "pointer" }}>
      <div style={{ width: 3, alignSelf: "stretch", background: film.userAdded ? C.teal : (film.edition ? C.ochre : "transparent"), borderRadius: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: NARROW, fontSize: 15, fontWeight: 600, color: C.bone, lineHeight: 1.15,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0.2 }}>
          {film.name}
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 2, fontFamily: NARROW }}>
          <span style={{ fontSize: 12, color: C.dim }}>{film.year}</span>
          <Stars rating={film.rating} size={12} />
          {film.edition && <span style={{ fontSize: 10, color: C.ochre, textTransform: "uppercase", letterSpacing: 0.5 }}>\u25c6 ED</span>}
          {film.userAdded && <span style={{ fontSize: 10, color: C.teal, textTransform: "uppercase", letterSpacing: 0.5 }}>\u25c6 NEW</span>}
          {cold && <span style={{ fontSize: 10, color: C.bone2 }}>{recent}y</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        {(tags||[]).slice(0,3).map((t) => (
          <span key={t} style={{ fontSize: 11, fontWeight: 700, color: TAGS[t].color,
            width: 18, height: 18, display: "grid", placeItems: "center",
            border: "1px solid " + TAGS[t].color + "55", borderRadius: 3 }}>{TAGS[t].icon}</span>
        ))}
      </div>
    </div>
  );
}

// ─── FILM DETAIL SHEET ──────────────────────────────────────────────────
function Sheet({ film, userData, onClose, onUpdate, onRemove, onLog }) {
  const [note, setNote] = useState("");
  useEffect(() => { if (film) setNote((userData[fkey(film)]||{}).note || ""); }, [film]);
  if (!film) return null;
  const k = fkey(film);
  const tags = (userData[k]||{}).tags || [];
  const toggle = (t) => onUpdate(k, { tags: tags.includes(t) ? tags.filter((x)=>x!==t) : [...tags, t] });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 50,
      display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ background: C.ink2, borderTop: "2px solid " + C.red,
        borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto",
        padding: "20px 20px 32px" }}>
        <div style={{ width: 36, height: 4, background: C.line, borderRadius: 2, margin: "0 auto 18px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, color: C.bone, lineHeight: 1.05,
              textTransform: "uppercase", letterSpacing: 0.5 }}>{film.name}</div>
            <div style={{ fontFamily: NARROW, fontSize: 14, color: C.bone2, marginTop: 5 }}>
              {film.year} &nbsp;·&nbsp; <Stars rating={film.rating} size={14} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.dim, fontSize: 26, cursor: "pointer", lineHeight: 1, padding: 0 }}>\u00d7</button>
        </div>

        {film.edition && (
          <div style={{ background: C.ink3, borderLeft: "3px solid " + C.ochre, borderRadius: 4, padding: "9px 12px", marginBottom: 14 }}>
            <div style={{ fontFamily: NARROW, fontSize: 10, color: C.ochre, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Edition</div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: C.bone, marginTop: 2 }}>{film.edition}</div>
          </div>
        )}

        <div style={{ fontFamily: NARROW, fontSize: 13, color: C.bone2, marginBottom: 16 }}>
          {film.lastWatched
            ? <>Last watched <b style={{ color: C.bone }}>{film.lastWatched}</b> · {yearsSince(film.lastWatched)}y ago</>
            : film.userAdded ? "Added by you" : <span style={{ color: C.ochre }}>Never logged on Letterboxd</span>}
        </div>

        <button onClick={() => { onLog(k); onClose(); }}
          style={{ width: "100%", background: "none", border: "1px solid " + C.line, color: C.bone,
            fontFamily: DISPLAY, fontSize: 13, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1,
            padding: "10px", borderRadius: 6, cursor: "pointer", marginBottom: 18 }}>
          \u25c9 &nbsp;Mark watched today
        </button>

        <div style={{ fontFamily: NARROW, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Tags</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
          {Object.entries(TAGS).map(([key, def]) => {
            const on = tags.includes(key);
            return (
              <button key={key} onClick={() => toggle(key)}
                style={{ background: on ? def.color + "22" : "transparent", border: "1px solid " + (on ? def.color : C.line),
                  color: on ? def.color : C.bone2, fontFamily: NARROW, fontSize: 13, fontWeight: 600,
                  padding: "6px 12px", borderRadius: 20, cursor: "pointer" }}>
                {def.icon} {def.label}
              </button>
            );
          })}
        </div>

        <div style={{ fontFamily: NARROW, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Notes</div>
        <textarea value={note} onChange={(e)=>setNote(e.target.value)} onBlur={()=>onUpdate(k,{note})}
          placeholder="Which edition, what to upgrade to, who you lent it to..."
          style={{ width: "100%", minHeight: 64, background: C.ink3, border: "1px solid " + C.line, borderRadius: 6,
            padding: 10, color: C.bone, fontFamily: BODY, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />

        {film.userAdded && (
          <button onClick={() => { onRemove(k); onClose(); }}
            style={{ marginTop: 14, background: "none", border: "1px solid " + C.dim, color: C.dim,
              fontFamily: NARROW, fontSize: 12, padding: "7px 12px", borderRadius: 6, cursor: "pointer" }}>
            Remove from collection
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ADD FILM SHEET ─────────────────────────────────────────────────────
function AddSheet({ onClose, onAdd, existing, prefill }) {
  const [name, setName] = useState(prefill?.name || "");
  const [year, setYear] = useState(prefill?.year || "");
  const [rating, setRating] = useState("");
  const [edition, setEdition] = useState(prefill?.label || "");
  const [err, setErr] = useState("");

  const submit = () => {
    if (!name.trim()) return setErr("Title is required.");
    if (!year.trim() || isNaN(parseInt(year))) return setErr("Enter a valid year.");
    if (existing.has(name.trim() + "|" + year.trim())) return setErr("Already in your collection.");
    onAdd({ name: name.trim(), year: year.trim(), rating: rating === "" ? null : parseFloat(rating), edition: edition.trim(), lastWatched: null });
    onClose();
  };

  const inp = { width: "100%", background: C.ink3, border: "1px solid " + C.line, borderRadius: 6,
    padding: "10px 12px", color: C.bone, fontFamily: BODY, fontSize: 14, boxSizing: "border-box", marginBottom: 12 };
  const lab = { fontFamily: NARROW, fontSize: 10, color: C.ochre, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 5, display: "block" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e)=>e.stopPropagation()} style={{ background: C.ink2, borderTop: "2px solid " + C.teal, borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 480, padding: "20px 20px 32px" }}>
        <div style={{ width: 36, height: 4, background: C.line, borderRadius: 2, margin: "0 auto 18px" }} />
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: C.bone, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 18 }}>Add a film</div>
        <label style={lab}>Title</label>
        <input style={inp} value={name} onChange={(e)=>setName(e.target.value)} placeholder="The Conversation" autoFocus />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}><label style={lab}>Year</label><input style={inp} value={year} onChange={(e)=>setYear(e.target.value)} placeholder="1974" inputMode="numeric" /></div>
          <div style={{ flex: 1 }}><label style={lab}>Rating</label>
            <select style={{ ...inp, cursor: "pointer" }} value={rating} onChange={(e)=>setRating(e.target.value)}>
              <option value="">\u2014</option>{[5,4.5,4,3.5,3,2.5,2,1.5,1,0.5].map((r)=><option key={r} value={r}>{r}\u2605</option>)}
            </select>
          </div>
        </div>
        <label style={lab}>Edition / format</label>
        <input style={inp} value={edition} onChange={(e)=>setEdition(e.target.value)} placeholder="Criterion 4K, steelbook..." />
        {err && <div style={{ color: C.red, fontFamily: NARROW, fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <button onClick={submit} style={{ width: "100%", background: C.teal, color: C.ink, border: "none", borderRadius: 8, padding: "13px", fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer" }}>Add to collection</button>
      </div>
    </div>
  );
}

// ─── TONIGHT ────────────────────────────────────────────────────────────
function Tonight({ collection, userData, watchLog, setSelected }) {
  const [mood, setMood] = useState("any");
  const [minR, setMinR] = useState("any");
  const [stale, setStale] = useState(false);
  const [pick, setPick] = useState(null);
  const [spin, setSpin] = useState(false);

  const moods = {
    any: (f) => true,
    comfort: (f) => { const u = userData[fkey(f)]; return (u&&u.tags&&u.tags.includes("comfort")) || (f.rating!=null&&f.rating>=4.5); },
    classic: (f) => parseInt(f.year) < 1980,
    modern: (f) => parseInt(f.year) >= 2010,
    forgotten: (f) => { const u = userData[fkey(f)]; return !f.lastWatched || (u&&u.tags&&u.tags.includes("rewatch")); },
  };
  const eff = (f) => watchLog[fkey(f)] || f.lastWatched;
  const eligible = useMemo(() => collection.filter((f) => {
    if (!moods[mood](f)) return false;
    if (minR !== "any" && !(f.rating!=null && f.rating>=parseFloat(minR))) return false;
    if (stale) { const w = eff(f); if (w && parseFloat(yearsSince(w)) <= 1) return false; }
    const u = userData[fkey(f)]; if (u&&u.tags&&u.tags.includes("sell")) return false;
    return true;
  }), [mood, minR, stale, collection, userData, watchLog]);

  const go = () => {
    if (!eligible.length) return;
    setSpin(true); let i = 0;
    const iv = setInterval(() => {
      setPick(eligible[Math.floor(Math.random()*eligible.length)]); i++;
      if (i > 11) { clearInterval(iv); setPick(eligible[Math.floor(Math.random()*eligible.length)]); setSpin(false); }
    }, 75);
  };

  const Chip = ({ on, onClick, children }) => (
    <button onClick={onClick} style={{ background: on ? C.red : "transparent", color: on ? C.bone : C.bone2,
      border: "1px solid " + (on ? C.red : C.line), borderRadius: 20, padding: "6px 13px",
      fontFamily: NARROW, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{children}</button>
  );

  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
        {[["any","Surprise"],["comfort","Comfort"],["classic","Classic"],["modern","Modern"],["forgotten","Forgotten"]].map(([k,l]) => (
          <Chip key={k} on={mood===k} onClick={()=>setMood(k)}>{l}</Chip>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
        <span style={{ fontFamily: NARROW, fontSize: 11, color: C.dim, alignSelf: "center", textTransform: "uppercase", letterSpacing: 1 }}>Min</span>
        <Chip on={minR==="any"} onClick={()=>setMinR("any")}>Any</Chip>
        <Chip on={minR==="4"} onClick={()=>setMinR("4")}>4+</Chip>
        <Chip on={minR==="4.5"} onClick={()=>setMinR("4.5")}>4.5+</Chip>
        <Chip on={stale} onClick={()=>setStale(!stale)}>Not seen 1y+</Chip>
      </div>
      <div style={{ fontFamily: NARROW, fontSize: 12, color: C.dim, marginBottom: 14 }}>{eligible.length} eligible</div>

      <button onClick={go} disabled={!eligible.length || spin}
        style={{ width: "100%", background: spin ? C.ink3 : C.red, color: C.bone, border: "none", borderRadius: 8,
          padding: "16px", fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: 2, cursor: spin?"default":"pointer" }}>
        {spin ? "..." : pick ? "Spin again" : "Pick tonight's film"}
      </button>

      {pick && (
        <div onClick={()=>!spin && setSelected(pick)}
          style={{ marginTop: 18, border: "2px solid " + C.ochre, borderRadius: 10, padding: "28px 22px",
            textAlign: "center", background: "repeating-linear-gradient(45deg," + C.ink2 + "," + C.ink2 + "10px," + C.ink + "10px," + C.ink + "20px)",
            cursor: "pointer", opacity: spin ? 0.6 : 1, transition: "opacity 0.2s" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 11, color: C.ochre, textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>\u2605 Now Showing \u2605</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, color: C.bone, textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 1 }}>{pick.name}</div>
          <div style={{ fontFamily: NARROW, fontSize: 14, color: C.bone2, marginTop: 8 }}>
            {pick.year} &nbsp;·&nbsp; <Stars rating={pick.rating} size={14} />
          </div>
          {pick.edition && <div style={{ fontFamily: NARROW, fontSize: 12, color: C.ochre, marginTop: 10, fontStyle: "italic" }}>{pick.edition}</div>}
        </div>
      )}
    </div>
  );
}

// ─── BROWSE ─────────────────────────────────────────────────────────────
function Browse({ collection, userData, setSelected, onAdd }) {
  const [q, setQ] = useState(""); const [dec, setDec] = useState("all");
  const [minR, setMinR] = useState("all"); const [tag, setTag] = useState("all");
  const [edOnly, setEdOnly] = useState(false); const [sort, setSort] = useState("name");

  const list = useMemo(() => {
    let L = collection;
    if (q) { const s = q.toLowerCase(); L = L.filter((f)=>f.name.toLowerCase().includes(s)); }
    if (dec !== "all") L = L.filter((f)=>decadeOf(f.year)===parseInt(dec));
    if (minR !== "all") L = L.filter((f)=>f.rating!=null && f.rating>=parseFloat(minR));
    if (edOnly) L = L.filter((f)=>f.edition);
    if (tag !== "all") L = L.filter((f)=>{ const u=userData[fkey(f)]; return u&&u.tags&&u.tags.includes(tag); });
    if (sort==="name") L = [...L].sort((a,b)=>a.name.localeCompare(b.name));
    else if (sort==="year") L = [...L].sort((a,b)=>parseInt(b.year)-parseInt(a.year));
    else if (sort==="rating") L = [...L].sort((a,b)=>(b.rating||0)-(a.rating||0));
    else if (sort==="stale") L = [...L].sort((a,b)=>{ if(!a.lastWatched)return -1; if(!b.lastWatched)return 1; return a.lastWatched.localeCompare(b.lastWatched); });
    return L;
  }, [collection, q, dec, minR, tag, edOnly, sort, userData]);

  const Chip = ({ on, onClick, children }) => (
    <button onClick={onClick} style={{ background: on ? C.red : "transparent", color: on ? C.bone : C.bone2,
      border: "1px solid " + (on ? C.red : C.line), borderRadius: 16, padding: "4px 10px",
      fontFamily: NARROW, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{children}</button>
  );
  const Row = ({ label, children }) => (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 4, WebkitOverflowScrolling: "touch" }}>
      <span style={{ fontFamily: NARROW, fontSize: 11, color: C.dim, alignSelf: "center", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder={"Search " + collection.length + " films"}
          style={{ flex: 1, background: C.ink2, border: "1px solid " + C.line, borderRadius: 8, padding: "11px 14px",
            color: C.bone, fontFamily: BODY, fontSize: 15, boxSizing: "border-box" }} />
        <button onClick={onAdd} style={{ background: C.teal, color: C.ink, border: "none", borderRadius: 8, padding: "0 16px",
          fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>+</button>
      </div>
      <Row label="Decade"><Chip on={dec==="all"} onClick={()=>setDec("all")}>All</Chip>
        {["1940","1950","1960","1970","1980","1990","2000","2010","2020"].map((d)=><Chip key={d} on={dec===d} onClick={()=>setDec(d)}>{d.slice(2)}s</Chip>)}</Row>
      <Row label="Min"><Chip on={minR==="all"} onClick={()=>setMinR("all")}>Any</Chip>
        <Chip on={minR==="5"} onClick={()=>setMinR("5")}>5\u2605</Chip><Chip on={minR==="4.5"} onClick={()=>setMinR("4.5")}>4.5+</Chip>
        <Chip on={minR==="4"} onClick={()=>setMinR("4")}>4+</Chip><Chip on={edOnly} onClick={()=>setEdOnly(!edOnly)}>Editions</Chip></Row>
      <Row label="Tag"><Chip on={tag==="all"} onClick={()=>setTag("all")}>All</Chip>
        {Object.entries(TAGS).map(([k,d])=><Chip key={k} on={tag===k} onClick={()=>setTag(k)}>{d.icon} {d.label}</Chip>)}</Row>
      <Row label="Sort"><Chip on={sort==="name"} onClick={()=>setSort("name")}>Title</Chip>
        <Chip on={sort==="year"} onClick={()=>setSort("year")}>Newest</Chip><Chip on={sort==="rating"} onClick={()=>setSort("rating")}>Rating</Chip>
        <Chip on={sort==="stale"} onClick={()=>setSort("stale")}>Dusty</Chip></Row>

      <div style={{ fontFamily: NARROW, fontSize: 11, color: C.dim, margin: "8px 0", textTransform: "uppercase", letterSpacing: 1 }}>{list.length} films</div>
      <div>{list.map((f)=><FilmRow key={fkey(f)} film={f} tags={(userData[fkey(f)]||{}).tags} onClick={()=>setSelected(f)} />)}</div>
    </div>
  );
}

// ─── WANT LIST ──────────────────────────────────────────────────────────
function WantList({ want, setWantList, onBuy }) {
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState(""); const [ny, setNy] = useState(""); const [nl, setNl] = useState("");
  const kinds = { upgrade: C.ochre, new: C.teal, gap: C.red };
  const kindLabel = { upgrade: "Upgrade", new: "New", gap: "Gap" };

  const toggle = (i) => setWantList(want.map((w,j)=>j===i?{...w,bought:!w.bought}:w));
  const remove = (i) => setWantList(want.filter((_,j)=>j!==i));
  const add = () => { if(!nf.trim())return; setWantList([{film:nf.trim(),year:ny.trim(),label:nl.trim(),note:"",kind:"new",bought:false},...want]); setNf("");setNy("");setNl("");setAdding(false); };

  const active = want.filter((w)=>!w.bought);
  const bought = want.filter((w)=>w.bought);

  const inp = { background: C.ink3, border: "1px solid " + C.line, borderRadius: 6, padding: "8px 10px", color: C.bone, fontFamily: BODY, fontSize: 13, boxSizing: "border-box" };

  const Card = ({ w, i }) => (
    <div style={{ display: "flex", gap: 10, padding: "11px 4px", borderBottom: "1px solid " + C.line, opacity: w.bought ? 0.5 : 1 }}>
      <button onClick={()=>toggle(i)} style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 4, marginTop: 2,
        border: "1.5px solid " + (w.bought ? C.teal : C.dim), background: w.bought ? C.teal : "transparent",
        color: C.ink, cursor: "pointer", fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{w.bought ? "\u2713" : ""}</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontFamily: NARROW, fontSize: 15, fontWeight: 600, color: C.bone, textDecoration: w.bought?"line-through":"none" }}>{w.film}</span>
          <span style={{ fontFamily: NARROW, fontSize: 12, color: C.dim }}>{w.year}</span>
          <span style={{ fontFamily: NARROW, fontSize: 9, fontWeight: 700, color: kinds[w.kind], border: "1px solid " + kinds[w.kind] + "55", borderRadius: 3, padding: "1px 5px", textTransform: "uppercase", letterSpacing: 0.5 }}>{kindLabel[w.kind]}</span>
        </div>
        {w.label && <div style={{ fontFamily: NARROW, fontSize: 12, color: C.ochre, marginTop: 2 }}>{w.label}</div>}
        {w.note && <div style={{ fontFamily: BODY, fontSize: 11.5, color: C.bone2, marginTop: 3, lineHeight: 1.4 }}>{w.note}</div>}
        <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
          {w.bought && <button onClick={()=>onBuy(w)} style={{ background: "none", border: "none", color: C.teal, fontFamily: NARROW, fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }}>Add to collection</button>}
          <button onClick={()=>remove(i)} style={{ background: "none", border: "none", color: C.dim, fontFamily: NARROW, fontSize: 12, cursor: "pointer", padding: 0 }}>Remove</button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <button onClick={()=>setAdding(!adding)} style={{ width: "100%", background: "none", border: "1px dashed " + C.line, color: C.bone2, fontFamily: DISPLAY, fontSize: 13, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, padding: "11px", borderRadius: 8, cursor: "pointer", marginBottom: 14 }}>
        {adding ? "\u00d7 Cancel" : "+ Add a release to track"}
      </button>
      {adding && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16, padding: 12, background: C.ink2, borderRadius: 8 }}>
          <input style={inp} value={nf} onChange={(e)=>setNf(e.target.value)} placeholder="Title" autoFocus />
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inp, width: 90 }} value={ny} onChange={(e)=>setNy(e.target.value)} placeholder="Year" inputMode="numeric" />
            <input style={{ ...inp, flex: 1 }} value={nl} onChange={(e)=>setNl(e.target.value)} placeholder="Edition (e.g. Arrow 4K)" />
          </div>
          <button onClick={add} style={{ background: C.teal, color: C.ink, border: "none", borderRadius: 6, padding: "9px", fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer" }}>Track it</button>
        </div>
      )}
      {active.map((w)=>{ const i = want.indexOf(w); return <Card key={i} w={w} i={i} />; })}
      {bought.length > 0 && (
        <>
          <div style={{ fontFamily: DISPLAY, fontSize: 12, color: C.dim, textTransform: "uppercase", letterSpacing: 2, margin: "20px 0 6px" }}>Acquired</div>
          {bought.map((w)=>{ const i = want.indexOf(w); return <Card key={i} w={w} i={i} />; })}
        </>
      )}
    </div>
  );
}

// ─── DATA / BACKUP TAB ──────────────────────────────────────────────────
function DataTab({ exportPayload, importAll, collection, want, watchLog, userData }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "the-shelf-backup-" + TODAY + ".json"; a.click();
    URL.revokeObjectURL(url);
    setMsg("Backup downloaded. Save it somewhere safe.");
  };
  const doImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { importAll(JSON.parse(r.result)); setMsg("Backup restored."); } catch { setMsg("That file couldn't be read."); } };
    r.readAsText(file);
  };

  const addedCount = collection.filter((f)=>f.userAdded).length;
  const taggedCount = Object.values(userData).filter((u)=>u.tags&&u.tags.length).length;
  const wantActive = want.filter((w)=>!w.bought).length;
  const watchCount = Object.keys(watchLog).length;

  const Stat = ({ n, l }) => (
    <div style={{ textAlign: "center", padding: "12px 8px", background: C.ink2, borderRadius: 8 }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: C.ochre, lineHeight: 1 }}>{n}</div>
      <div style={{ fontFamily: NARROW, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 5 }}>{l}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
        <Stat n={collection.length} l="Films" /><Stat n={addedCount} l="Added by you" />
        <Stat n={taggedCount} l="Tagged" /><Stat n={wantActive} l="On want-list" />
      </div>

      <div style={{ background: C.ink2, borderRadius: 10, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: C.bone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Back up your data</div>
        <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.bone2, lineHeight: 1.55, marginBottom: 14 }}>
          Your tags, notes, added films, want-list and watch log live in this device's browser. Export a backup file now and then — especially before clearing Safari, or if you haven't opened the app in a week.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={doExport} style={{ flex: 1, background: C.ochre, color: C.ink, border: "none", borderRadius: 8, padding: "12px", fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer" }}>Export backup</button>
          <button onClick={()=>fileRef.current.click()} style={{ flex: 1, background: "none", color: C.bone, border: "1px solid " + C.line, borderRadius: 8, padding: "12px", fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer" }}>Restore</button>
          <input ref={fileRef} type="file" accept="application/json" onChange={doImport} style={{ display: "none" }} />
        </div>
        {msg && <div style={{ fontFamily: NARROW, fontSize: 12, color: C.teal, marginTop: 12 }}>{msg}</div>}
      </div>

      <div style={{ fontFamily: BODY, fontSize: 11.5, color: C.dim, lineHeight: 1.6, padding: "0 4px" }}>
        When you re-export your Letterboxd collection (say once a year), bring the CSV back to Claude and regenerate the seed data — then restore this backup on top to keep your tags and notes.
      </div>
    </div>
  );
}

// ─── ROOT ───────────────────────────────────────────────────────────────
export default function App() {
  useFonts();
  const D = useData();
  const [tab, setTab] = useState("tonight");
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [prefill, setPrefill] = useState(null);

  const collection = useMemo(() => {
    return [...SEED_COLLECTION, ...D.added].map((f) => ({ ...f, lastWatched: D.watchLog[fkey(f)] || f.lastWatched }));
  }, [D.added, D.watchLog]);
  const existing = useMemo(() => new Set(collection.map(fkey)), [collection]);

  const onBuy = (w) => { setPrefill({ name: w.film, year: w.year, label: w.label }); setAdding(true); };

  const TABS = [["tonight","Tonight","\u25c9"],["browse","Shelf","\u2630"],["want","Want","\u2606"],["data","Data","\u2399"]];

  if (D.loading) return <div style={{ background: C.ink, minHeight: "100vh", display: "grid", placeItems: "center", color: C.dim, fontFamily: BODY }}>Loading...</div>;

  return (
    <div style={{ background: C.ink, minHeight: "100vh", color: C.bone, maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 72 }}>
      {/* Header */}
      <div style={{ padding: "20px 18px 14px", borderBottom: "2px solid " + C.red }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, color: C.bone, textTransform: "uppercase", letterSpacing: 1, lineHeight: 0.95 }}>The Shelf</div>
        <div style={{ fontFamily: NARROW, fontSize: 12, color: C.dim, letterSpacing: 2, textTransform: "uppercase", marginTop: 4 }}>j_ck \u00b7 {collection.length} films on hand</div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 18px" }}>
        {tab === "tonight" && <Tonight collection={collection} userData={D.userData} watchLog={D.watchLog} setSelected={setSelected} />}
        {tab === "browse" && <Browse collection={collection} userData={D.userData} setSelected={setSelected} onAdd={()=>{setPrefill(null);setAdding(true);}} />}
        {tab === "want" && <WantList want={D.want} setWantList={D.setWantList} onBuy={onBuy} />}
        {tab === "data" && <DataTab exportPayload={D.exportPayload} importAll={D.importAll} collection={collection} want={D.want} watchLog={D.watchLog} userData={D.userData} />}
      </div>

      {/* Bottom tab bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480,
        display: "flex", background: C.ink2, borderTop: "1px solid " + C.line, zIndex: 30 }}>
        {TABS.map(([k,l,ic]) => (
          <button key={k} onClick={()=>setTab(k)} style={{ flex: 1, background: "none", border: "none",
            padding: "11px 4px 14px", cursor: "pointer", borderTop: "2px solid " + (tab===k ? C.red : "transparent") }}>
            <div style={{ fontSize: 18, color: tab===k ? C.red : C.dim, lineHeight: 1 }}>{ic}</div>
            <div style={{ fontFamily: NARROW, fontSize: 11, fontWeight: 600, color: tab===k ? C.bone : C.dim, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>{l}</div>
          </button>
        ))}
      </div>

      <Sheet film={selected} userData={D.userData} onClose={()=>setSelected(null)} onUpdate={D.updateFilm} onRemove={D.removeFilm} onLog={D.logWatch} />
      {adding && <AddSheet onClose={()=>{setAdding(false);setPrefill(null);}} onAdd={D.addFilm} existing={existing} prefill={prefill} />}
    </div>
  );
}
