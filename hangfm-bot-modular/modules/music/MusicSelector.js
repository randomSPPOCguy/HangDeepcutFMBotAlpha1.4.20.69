/**
 * MusicSelector - Selects songs based on room vibe and curated artist list
 * Contains 1300+ curated alternative artists across Hip Hop, Rock, Metal, and more
 */
const axios = require('axios');

class MusicSelector {
  constructor(config, logger, statsManager) {
    this.config = config;
    this.logger = logger;
    this.stats = statsManager;
    
    // Song selection state
    this.playedSongs = new Set();
    this.recentlyUsedArtists = [];
    this.lastPlayedArtist = null;
    this.requestedGenre = null;
    this.genreRequestedBy = null;
    
    // Load curated artists
    this.curatedArtists = this.getCuratedArtists();
    this.logger.log(`🎵 Loaded ${this.curatedArtists.length} curated artists`);
  }

  getCuratedArtists() {
    return [
      // ═══════════════════════════════════════════════════════════════
      // ALTERNATIVE HIP HOP / UNDERGROUND HIP HOP
      // ═══════════════════════════════════════════════════════════════
      
      // Underground / Abstract Hip Hop
      'MF DOOM', 'Madlib', 'Madvillain', 'Viktor Vaughn', 'King Geedorah', 'JJ DOOM', 'DangerDOOM', 'NehruvianDOOM',
      'Quasimoto', 'Jaylib', 'Lootpack', 'Yesterday\'s New Quintet', 'Sound Directions',
      'Aesop Rock', 'El-P', 'Run The Jewels', 'Company Flow', 'Cannibal Ox', 'Vast Aire', 'Vordul Mega',
      'Atoms Family', 'Cryptic One', 'Windnbreeze', 'Alaska', 'Leak Bros',
      'Atmosphere', 'Brother Ali', 'Eyedea & Abilities', 'Slug', 'Sage Francis', 'P.O.S', 'Prof',
      'Busdriver', 'Open Mike Eagle', 'billy woods', 'Armand Hammer', 'Elucid', 'Quelle Chris',
      'Death Grips', 'clipping.', 'Dälek', 'Antipop Consortium', 'Ho99o9', 'Backxwash',
      'Cage', 'Mr. Lif', 'Copywrite', 'Blueprint', 'RJD2', 'Illogic', 'Jakki da Motamouth',
      'Doomtree', 'Sims', 'Dessa', 'Cecil Otter', 'Mike Mictlan', 'Lazerbeak', 'Paper Tiger',
      'Anticon', 'Sole', 'Alias', 'Pedestrian', 'Why?', 'Jel', 'Odd Nosdam', 'Doseone',
      'Themselves', 'Subtle', 'Reaching Quiet', 'Deep Puddle Dynamics', '13 & God', 'cLOUDDEAD',
      'Clouddead', 'Passage', 'Restiform Bodies', 'Telephone Jim Jesus',
      
      // Conscious / Political Hip Hop
      'Talib Kweli', 'Mos Def', 'Yasiin Bey', 'Common', 'The Roots', 'Black Star', 'Dead Prez',
      'Public Enemy', 'KRS-One', 'Boogie Down Productions',
      'Immortal Technique', 'Sage Francis', 'The Coup',
      'Michael Franti', 'Spearhead',
      'Pharoahe Monch', 'Organized Konfusion', 'Arrested Development',
      'Lupe Fiasco', 'Blu', 'Blu & Exile', 'Exile',
      'Little Brother', 'Phonte', '9th Wonder', 'The Foreign Exchange',
      'Oddisee', 'Apollo Brown', 'Skyzoo', 'Rapsody',
      'Blackstar', 'Jean Grae', 'Murs', 'Kendrick Lamar', 'J. Cole',
      'Noname', 'Saba', 'Smino', 'Mick Jenkins', 'Vic Mensa',
      
      // Jazz Rap / Native Tongues
      'A Tribe Called Quest', 'Q-Tip', 'Phife Dawg',
      'De La Soul', 'Digable Planets',
      'The Pharcyde', 'Slimkid3', 'Fatlip',
      'Jungle Brothers', 'Souls of Mischief', 'Hieroglyphics', 'Del the Funky Homosapien', 'Casual',
      'Slum Village', 'J Dilla', 'Pete Rock & CL Smooth', 'Pete Rock',
      'Gang Starr', 'DJ Premier', 'Guru',
      'The Roots', 'Black Thought', 'Questlove',
      'Us3', 'Freestyle Fellowship', 'Aceyalone',
      'The Coup', 'Boots Riley',
      
      // Wu-Tang Extended Universe
      'Wu-Tang Clan', 'GZA', 'Raekwon', 'Ghostface Killah',
      'Method Man', 'Ol\' Dirty Bastard', 'ODB',
      'Inspectah Deck', 'Masta Killa', 'U-God',
      'Cappadonna', 'Killah Priest', 'Sunz of Man',
      'Gravediggaz', 'RZA', 'Bronze Nazareth', 'Shyheim',
      
      // West Coast Underground Collectives
      'Deltron 3030', 'Del the Funky Homosapien', 'Casual', 'Pep Love', 'Tajai',
      'Hieroglyphics', 'Souls of Mischief', 'Opio', 'A-Plus', 'Phesto', 'Domino',
      'Jurassic 5', 'Chali 2na', 'Akil', 'Marc 7even', 'Zaakir', 'Cut Chemist', 'DJ Nu-Mark',
      'Dilated Peoples', 'Evidence', 'Rakaa Iriscience', 'Babu', 'The Alchemist',
      'People Under the Stairs', 'Thes One', 'Double K', 'OM Records',
      'Living Legends', 'The Grouch', 'Eligh', 'Scarub', 'Luckyiam', 'Murs', 'Arata',
      'The Grouch & Eligh', 'Zion I', 'Amp Live', 'AmpLive', 'Deuce Eclipse',
      'Blackalicious', 'Gift of Gab', 'Chief Xcel', 'Lyrics Born', 'Lateef the Truthspeaker', 'Latyrx',
      'Crown City Rockers', 'Lifesavas', 'Vursatyl', 'Jumbo', 'Quannum',
      
      // Modern Underground / Lo-Fi Hip Hop
      'Westside Gunn', 'Conway the Machine', 'Benny the Butcher', 'Griselda',
      'Your Old Droog', 'Ka', 'Roc Marciano', 'Mach-Hommy',
      'Navy Blue', 'MIKE', 'Earl Sweatshirt', 'Vince Staples', 'Danny Brown',
      'Milo', 'R.A.P. Ferreira', 'Serengeti', 'Pink Siifu',
      'JPEGMAFIA', 'Clams Casino',
      'Denmark Vessey', 'Homeboy Sandman',
      'Kool A.D.', 'Das Racist', 'Heems',
      'Chester Watson', 'Medhane',
      'Boldy James', 'Stove God Cooks', 'Rome Streetz', 'Fly Anakin',
      'Mavi', 'Maxo', 'Slauson Malone', 'Standing on the Corner',
      'Koncept Jack$on', 'Liv.e', 'MAVI', 'Mutant Academy',
      '$$$ Lean Leanin', 'Akai Solo', 'lojii', 'CRIMEAPPLE',
      
      // Experimental / Abstract Hip Hop
      'Clipping', 'Death Grips', 'Shabazz Palaces',
      'Captain Murphy', 'Flying Lotus', 'Thundercat',
      'The Underachievers', 'Flatbush Zombies', 'Pro Era', 'Joey Bada$$',
      'Injury Reserve', 'Armand Hammer', 'billy woods', 'Elucid',
      'Quelle Chris', 'The Alchemist', 'Action Bronson',
      'Freddie Gibbs', 'Madlib', 'Freddie Gibbs & Madlib',
      'Run The Jewels', 'Killer Mike', 'El-P',
      'Anderson .Paak', 'NxWorries', 'Knxwledge',
      'Tyler, The Creator', 'Odd Future', 'Frank Ocean',
      'Mac Miller', 'Vince Staples', 'ScHoolboy Q',
      'Isaiah Rashad', 'SiR', 'Reason', 'Zacari',
      
      // Southern Alternative / Dirty South
      'Outkast', 'André 3000', 'Big Boi', 'Goodie Mob', 'CeeLo Green', 'Khujo',
      'Killer Mike', 'Run The Jewels', 'Dungeon Family', 'Organized Noize',
      'Witchdoctor', 'Cool Breeze', 'Backbone', 'Big Rube', 'Society of Soul',
      'UGK', 'Bun B', 'Pimp C', 'Devin the Dude', 'Scarface', 'Geto Boys',
      'Willie D', 'Bushwick Bill', 'Three 6 Mafia', 'Project Pat', 'Juicy J',
      '8Ball & MJG', 'Eightball', 'MJG', 'Suave House', 'Hypnotize Minds',
      'CunninLynguists', 'Kno', 'Deacon the Villain', 'Natti', 'Mr. SOS',
      
      // East Coast Underground
      'Jedi Mind Tricks', 'Vinnie Paz', 'Stoupe the Enemy of Mankind', 'Jus Allah',
      'Army of the Pharaohs', 'Apathy', 'Celph Titled', 'Esoteric', 'Planetary',
      'Demigodz', 'Ill Bill', 'Necro', 'Non Phixion', 'Sabac Red', 'Goretex',
      'La Coka Nostra', 'Slaine', 'Everlast', 'DJ Lethal', 'Danny Boy',
      'Snowgoons', 'R.A. the Rugged Man', 'Reef the Lost Cauze',
      'Pharoahe Monch', 'Organized Konfusion', 'Prince Po', 'O.C.', 'D.I.T.C.',
      'Kool Keith', 'Dr. Octagon', 'Dr. Dooom', 'Black Elvis', 'Ultramagnetic MCs',
      'Ced Gee', 'TR-Love', 'Moe Love', 'Tim Dog', 'Black Sheep', 'Dres', 'Mista Lawnge',
      'Brand Nubian', 'Grand Puba', 'Lord Jamar', 'Sadat X', 'DJ Alamo',
      
      // ═══════════════════════════════════════════════════════════════
      // ALTERNATIVE ROCK
      // ═══════════════════════════════════════════════════════════════
      
      // Well-Known Alternative Rock (90s/00s)
      'Radiohead', 'Thom Yorke', 'Atoms for Peace', 'Nirvana', 'Pearl Jam', 'Soundgarden', 'Alice in Chains',
      'Smashing Pumpkins', 'Nine Inch Nails', 'Trent Reznor', 'How to Destroy Angels',
      'The Cure', 'Robert Smith', 'Depeche Mode', 'New Order', 'Joy Division',
      'Stone Temple Pilots', 'R.E.M.', 'The Smiths', 'Morrissey',
      'Jane\'s Addiction', 'Porno for Pyros', 'Red Hot Chili Peppers', 'Faith No More',
      'Foo Fighters', 'Queens of the Stone Age', 'Muse', 'The Killers',
      'Arcade Fire', 'Vampire Weekend', 'MGMT', 'Tame Impala',
      'Phoenix', 'Two Door Cinema Club', 'Foster the People', 'Alt-J',
      
      // Garage Rock / Blues Rock Revival
      'The White Stripes', 'Jack White', 'The Raconteurs', 'The Dead Weather',
      'The Black Keys', 'Dan Auerbach', 'The Arcs', 'Eagles of Death Metal',
      'Them Crooked Vultures', 'The Hives', 'The Vines', 'The Strokes', 'The Libertines',
      'Arctic Monkeys', 'The Last Shadow Puppets', 'Bloc Party', 'Franz Ferdinand',
      
      // Indie Rock / Lo-Fi
      'Pavement', 'Stephen Malkmus', 'Silver Jews',
      'Built to Spill', 'Modest Mouse', 'Ugly Casanova',
      'Dinosaur Jr', 'J Mascis', 'Sebadoh', 'Lou Barlow',
      'Guided by Voices', 'Superchunk',
      'Archers of Loaf', 'Polvo',
      'Pixies', 'Frank Black', 'The Breeders', 'The Amps',
      'Beck', 'Weezer', 'The Rentals',
      'Interpol', 'Spoon', 'Wilco', 'Uncle Tupelo',
      'Yo La Tengo', 'Neutral Milk Hotel', 'The Olivia Tremor Control',
      'Sleater-Kinney', 'Wild Flag', 'Bikini Kill', 'Le Tigre',
      'Sonic Youth', 'Thurston Moore', 'Lee Ranaldo', 'Kim Gordon',
      'Mudhoney', 'The Melvins', 'Buzz Osborne', 'Screaming Trees',
      'Fugazi', 'Minor Threat', 'Rites of Spring', 'Embrace',
      'Drive Like Jehu', 'Hot Snakes', 'Rocket from the Crypt',
      'Jawbox', 'Jawbreaker', 'Samiam', 'Texas Is the Reason',
      'Dismemberment Plan', 'Shudder to Think',
      'Karate', 'June of 44', 'Shipping News', 'Rodan',
      
      // Indie Folk / Alt-Country
      'Bon Iver', 'Sufjan Stevens', 'Iron & Wine', 'Fleet Foxes', 'Grizzly Bear',
      'The National', 'Frightened Rabbit', 'The Tallest Man on Earth', 'Father John Misty',
      'Andrew Bird', 'Neko Case', 'The New Pornographers', 'A.C. Newman',
      'Elliott Smith', 'Bright Eyes', 'Conor Oberst', 'Cursive', 'The Good Life',
      
      // Shoegaze / Dream Pop
      'My Bloody Valentine', 'Slowdive', 'Mojave 3',
      'Ride', 'Lush',
      'Mazzy Star', 'Hope Sandoval', 'Cocteau Twins',
      'The Jesus and Mary Chain', 'Spiritualized', 'Spacemen 3',
      'Swervedriver', 'Catherine Wheel', 'Chapterhouse', 'Curve',
      'Pale Saints', 'Medicine',
      'Galaxie 500', 'Luna',
      'Low', 'Bedhead', 'Codeine', 'Duster',
      'Hum', 'Failure', 'Autolux', 'Swirlies',
      'Lovesliescrushing', 'Broken Social Scene', 'Stars',
      'M83', 'School of Seven Bells', 'Asobi Seksu',
      'Deerhunter', 'Atlas Sound', 'Beach House', 'Purity Ring',
      'Whirr', 'Nothing', 'Ringo Deathstarr', 'A Place to Bury Strangers',
      'The Depreciation Guild', 'Alcest', 'Les Discrets',
      'Lantlôs', 'Amesoeurs', 'Agalloch',
      
      // Post-Hardcore / Emo / Screamo
      'At the Drive-In', 'The Mars Volta', 'Sparta', 'Antemasque',
      'Glassjaw', 'Head Automatica', 'Daryl Palumbo',
      'Refused', 'The (International) Noise Conspiracy', 'Dennis Lyxzén',
      'Thursday', 'Geoff Rickly', 'No Devotion', 'United Nations',
      'Thrice', 'Dustin Kensrue', 'The Alchemy Index',
      'La Dispute', 'Touché Amoré', 'Pianos Become the Teeth',
      'Defeater', 'The Hotelier', 'Modern Baseball',
      'Foxing', 'Citizen', 'Balance and Composure',
      'Title Fight', 'Basement', 'Turnover',
      'Movements', 'Counterparts', 'Being as an Ocean',
      'Alexisonfire', 'City and Colour', 'Dallas Green',
      'Saosin', 'Circa Survive', 'The Sound of Animals Fighting',
      'Underoath', 'The Almost', 'Aaron Gillespie',
      'The Fall of Troy', 'Chiodos', 'Dance Gavin Dance',
      'A Lot Like Birds', 'Hail the Sun', 'Sianvar',
      'Poison the Well', 'Hopesfall', 'As Cities Burn',
      'Norma Jean', 'The Chariot', 'Every Time I Die',
      'Cursive', 'The Good Life', 'Desaparecidos', 'Tim Kasher',
      'Cap\'n Jazz', 'American Football', 'Owen', 'Joan of Arc',
      'Mineral', 'The Gloria Record', 'Sunny Day Real Estate', 'The Fire Theft',
      'Texas Is the Reason', 'Sense Field', 'Samiam', 'Jawbreaker',
      'Hot Water Music', 'The Draft', 'Chuck Ragan', 'Drag the River',
      
      // Math Rock / Experimental Rock
      'Don Caballero', 'Battles', 'Lynx', 'Toe',
      'Tera Melos', 'Hella', 'Zach Hill',
      'This Town Needs Guns', 'TTNG', 'Piglet',
      'Totorro', 'Lite', 'Mouse on the Keys', 'tricot',
      'Owls', 'Cap\'n Jazz',
      'Slint', 'Spiderland', 'The For Carnation', 'David Pajo',
      'Shellac', 'Tortoise', 'The Sea and Cake', 'Chicago Underground Duo',
      'Rodan', 'June of 44', 'Shipping News', 'Rachel\'s',
      'Sweep the Leg Johnny', 'Breadwinner', 'Keelhaul',
      'Dazzling Killmen', 'Craw', 'Storm & Stress',
      'U.S. Maple', 'Gastr del Sol', 'The Flying Luttenbachers',
      'Ruins', 'Boredoms', 'Melt-Banana', 'Zeni Geva',
      
      // Noise Rock / No Wave
      'The Jesus Lizard', 'David Yow', 'Scratch Acid',
      'Big Black', 'Shellac', 'Rapeman', 'Steve Albini',
      'Swans', 'Angels of Light', 'Michael Gira', 'Jarboe',
      'The Birthday Party', 'Nick Cave', 'Rowland S. Howard',
      'Unsane', 'Helmet', 'Melvins',
      'Butthole Surfers', 'Tad', 'Steel Pole Bath Tub',
      'Tar', 'Cherubs', 'Hammerhead', 'Killdozer',
      'Flip Burgers', 'Cows', 'Milk Cult',
      'DNA', 'Mars', 'Teenage Jesus and the Jerks', 'Lydia Lunch',
      'Glenn Branca', 'Rhys Chatham', 'Band of Susans',
      
      // Post-Punk / New Wave
      'Talking Heads', 'David Byrne', 'Tom Tom Club',
      'Joy Division', 'New Order', 'Electronic',
      'Bauhaus', 'Peter Murphy', 'Love and Rockets',
      'Siouxsie and the Banshees',
      'Echo & the Bunnymen', 'The Teardrop Explodes',
      
      // ═══════════════════════════════════════════════════════════════
      // ALTERNATIVE METAL
      // ═══════════════════════════════════════════════════════════════
      
      // Nu Metal / Alternative Metal
      'Deftones', 'Chino Moreno', 'Team Sleep', 'Crosses', 'Palms',
      'System of a Down', 'Serj Tankian', 'Scars on Broadway', 'Daron Malakian',
      'Tool', 'Maynard James Keenan', 'A Perfect Circle', 'Puscifer',
      'Rage Against the Machine', 'Audioslave', 'Prophets of Rage',
      'Korn', 'Jonathan Davis', 'Limp Bizkit', 'Linkin Park',
      'Incubus', 'Brandon Boyd', 'Chevelle', 'Mudvayne', 'Sevendust',
      'Far', 'Jonah Matranga', 'onelinedrawing',
      'Quicksand', 'Walter Schreifels', 'Helmet', 'Page Hamilton',
      
      // Stoner Rock / Doom
      'Sleep', 'Matt Pike', 'High on Fire', 'Om', 'Al Cisneros', 'Shrinebuilder',
      'Kyuss', 'John Garcia', 'Josh Homme',
      'Fu Manchu', 'Scott Hill', 'Nebula', 'Mondo Generator', 'Hermano',
      'Mastodon', 'Brent Hinds', 'Troy Sanders', 'Baroness', 'John Baizley',
      'Kylesa', 'Phillip Cope', 'Torche', 'The Sword', 'Red Fang', 'Black Tusk',
      'Electric Wizard', 'Jus Oborn', 'Yob', 'Mike Scheidt', 'Weedeater', 'Dixie Dave',
      'Eyehategod', 'Mike IX Williams', 'Crowbar', 'Kirk Windstein', 'Down', 'Acid Bath',
      'All Them Witches', 'Earthless', 'Kadavar', 'Uncle Acid', 'Graveyard', 'Wo Fat',
      'Orange Goblin', 'Conan', 'Monolord', 'Bongzilla', 'Bongripper',
      'Windhand', 'Pallbearer', 'Khemmis', 'Spirit Adrift', 'Cough',
      'Thou', 'The Obsessed', 'Scott Reagers', 'Saint Vitus', 'Pentagram',
      'Trouble', 'Candlemass', 'Cathedral', 'Reverend Bizarre',
      'Dopethrone', 'Warhorse', 'Goatsnake', 'Lowrider', 'Truckfighters',
      'Greenleaf', 'Dozer', 'Grand Magus', 'Spiritual Beggars',
      'Colour Haze', 'Elder', 'Mars Red Sky', 'Monkey3',
      
      // Post-Metal / Atmospheric
      'Isis', 'Aaron Turner', 'House of Low Culture', 'Mamiffer', 'Sumac',
      'Neurosis', 'Steve Von Till', 'Scott Kelly', 'Tribes of Neurot', 'Corrections House',
      'Pelican', 'Trevor de Brauw', 'Russian Circles', 'Intronaut', 'Giant Squid',
      'Old Man Gloom', 'Nate Newton', 'Cave In', 'Cult of Luna', 'The Ocean', 'Amenra',
      'Rosetta', 'Mouth of the Architect', 'Baptists', 'KEN mode', 'Oxbow', 'Eugene Robinson',
      'Godflesh', 'Jesu', 'Justin Broadrick', 'JK Flesh',
      'Year of No Light', 'Dirge', 'Callisto',
      'Downfall of Gaia', 'Zatokrev', 'Lightbearer', 'Fall of Efrafa',
      'Ancst', 'Kowloon Walled City', 'Buried at Sea',
      'Deafheaven',
      'Altar of Plagues', 'Wolves in the Throne Room', 'Panopticon',
      'Agalloch', 'Fen', 'Primordial', 'Negură Bunget',
      
      // Metalcore / Post-Hardcore Metal
      'Converge', 'Jacob Bannon', 'Mutoid Man',
      'Every Time I Die', 'The Chariot', 'Norma Jean', 'Botch', 'Coalesce',
      'The Dillinger Escape Plan', 'Dimitri Minakakis',
      'Poison the Well', 'Underoath', 'The Alchemy Index',
      'Darkest Hour', 'Shai Hulud', 'Misery Signals', 'Architects',
      'August Burns Red', 'Killswitch Engage', 'All That Remains',
      'Hatebreed', 'Terror', 'Madball', 'Agnostic Front',
      'Earth Crisis', 'Integrity', 'Ringworm', 'Turmoil',
      'Code Orange', 'Knocked Loose', 'Jesus Piece', 'Year of the Knife',
      'Vein', 'Employed to Serve',
      
      // Experimental / Avant-Garde Metal (Mike Patton Universe)
      'Mr. Bungle', 'Fantômas', 'Tomahawk', 'Peeping Tom', 'Lovage',
      'Mike Patton', 'Faith No More', 'Ipecac Recordings',
      'Secret Chiefs 3', 'Trey Spruance', 'Kayo Dot', 'Toby Driver', 'Maudlin of the Well',
      'Sleepytime Gorilla Museum', 'Free Salamander Exhibit', 'uneXpect',
      'Diablo Swing Orchestra', 'Solefald', 'Sigh', 'Igorrr',
      'Unexpect', 'Pin-Up Went Down', 'Carnival in Coal', 'Thy Catafalque',
      
      // Progressive Metal
      'Between the Buried and Me', 'Tommy Rogers', 'Protest the Hero',
      'Meshuggah', 'Fredrik Thordendal', 'Gojira', 'Joe Duplantier',
      'Opeth', 'Mikael Åkerfeldt', 'Storm Corrosion', 'Cynic', 'Paul Masvidal',
      'Animals as Leaders', 'Tosin Abasi', 'Intervals', 'Plini',
      'Periphery', 'Tesseract', 'Monuments', 'Sikth',
      'Haken', 'Leprous', 'Caligula\'s Horse', 'Textures',
      'Car Bomb', 'The Contortionist', 'Vildhjarta', 'Humanity\'s Last Breath',
      'Gorguts', 'Ulcerate', 'Artificial Brain', 'Pyrrhon',
      
      // Hardcore Punk / Crossover
      'Black Flag', 'Henry Rollins', 'Greg Ginn', 'Rollins Band',
      'Bad Brains', 'H.R.', 'Minor Threat', 'Circle Jerks', 'Keith Morris',
      'Dead Kennedys', 'Jello Biafra', 'Descendents', 'Milo Aukerman', 'ALL',
      'Gorilla Biscuits', 'Civ', 'Youth of Today', 'Shelter',
      
      // ═══════════════════════════════════════════════════════════════
      // ADDITIONAL GENRES
      // ═══════════════════════════════════════════════════════════════
      
      // Jazz (Alternative: Free Jazz, Avant-Garde, Spiritual, Nu-Jazz)
      'Sun Ra', 'Albert Ayler', 'Pharoah Sanders', 'Archie Shepp', 'Eric Dolphy',
      'Ornette Coleman', 'Don Cherry', 'Cecil Taylor', 'Anthony Braxton', 'Sam Rivers',
      'Charles Mingus', 'John Coltrane', 'Alice Coltrane', 'Yusef Lateef', 'Rahsaan Roland Kirk',
      'Sun Ra Arkestra', 'Kamasi Washington', 'Shabaka Hutchings', 'Sons of Kemet', 'The Comet Is Coming',
      'Irreversible Entanglements', 'Makaya McCraven', 'Jeff Parker', 'Angel Bat Dawid',
      'Weather Report', 'Return to Forever', 'Mahavishnu Orchestra', 'Tony Williams Lifetime',
      'Miles Davis', 'Herbie Hancock', 'Wayne Shorter', 'Keith Jarrett', 'Chick Corea',
      'Jaco Pastorius', 'Jack DeJohnette', 'John McLaughlin', 'Pat Metheny',
      'Robert Glasper', 'Terrace Martin',
      'Hiatus Kaiyote', 'Snarky Puppy', 'BadBadNotGood',
      'Yussef Dayes', 'Tom Misch', 'Jordan Rakei', 'Alfa Mist', 'Nubya Garcia',
      'Ezra Collective', 'Moses Boyd', 'BADBADNOTGOOD',
      
      // Blues (Alternative: Delta, Raw Electric, Psychedelic)
      'Robert Johnson', 'Son House', 'Skip James', 'Mississippi John Hurt', 'Blind Willie McTell',
      'Charley Patton', 'Bukka White', 'Mississippi Fred McDowell', 'R.L. Burnside',
      'Howlin\' Wolf', 'Muddy Waters', 'John Lee Hooker', 'Junior Kimbrough',
      'Hound Dog Taylor', 'Magic Sam', 'Otis Rush', 'Buddy Guy', 'Junior Wells',
      'T-Model Ford', 'Paul "Wine" Jones',
      'Cedric Burnside', 'Lightnin\' Malcolm',
      'The Jon Spencer Blues Explosion',
      'North Mississippi Allstars', 'Seasick Steve', 'Gary Clark Jr.',
      
      // Country (Alternative: Outlaw, Alt-Country, Americana)
      'Johnny Cash', 'Willie Nelson', 'Waylon Jennings', 'Merle Haggard', 'Kris Kristofferson',
      'Townes Van Zandt', 'Guy Clark', 'Steve Earle', 'Blaze Foley', 'David Allan Coe',
      'Uncle Tupelo', 'Son Volt', 'Jay Farrar', 'The Jayhawks', 'Whiskeytown',
      'Ryan Adams', 'Lucinda Williams', 'Drive-By Truckers', 'Jason Isbell',
      'The Bottle Rockets', 'Slobberbone', 'Old 97\'s', 'Calexico', 'Richmond Fontaine',
      'Sturgill Simpson', 'Tyler Childers', 'Colter Wall', 'Flatland Cavalry',
      'Turnpike Troubadours', 'American Aquarium', 'Ben Nichols', 'Cody Jinks',
      'John Prine', 'Gillian Welch', 'Emmylou Harris', 'Gram Parsons',
      'The Flying Burrito Brothers', 'The Byrds', 'The Band',
      
      // Electronic (Alternative: IDM, Trip-Hop, Experimental)
      'Aphex Twin', 'Autechre', 'Boards of Canada', 'Squarepusher', 'µ-Ziq',
      'Plaid', 'Luke Vibert', 'LFO', 'Black Dog', 'B12', 'Funkstörung',
      'Massive Attack', 'Portishead', 'Tricky', 'DJ Shadow', 'UNKLE', 'Morcheeba',
      'Thievery Corporation', 'Bonobo', 'Nightmares on Wax', 'Kruder & Dorfmeister',
      'Burial', 'Four Tet', 'Caribou', 'Jon Hopkins', 'Jamie xx', 'Mount Kimbie',
      'James Blake', 'SBTRKT', 'Actress', 'Floating Points', 'Joy Orbison',
      'Peverelist', 'Pinch', 'Shackleton', 'Kode9', 'The Bug',
      'The Orb', 'Future Sound of London', 'Global Communication', 'Biosphere',
      'Gas', 'Wolfgang Voigt', 'Pole', 'Vladislav Delay', 'Pan Sonic',
      'Kraftwerk', 'Tangerine Dream', 'Klaus Schulze', 'Cluster', 'Harmonia',
      'Teebs', 'Lapalux', 'Shlohmo', 'XXYYXX',
      'Baths', 'Groundislava', 'Esta', 'Sango',
      
      // Reggae (Alternative: Dub, Roots)
      'Lee Scratch Perry', 'King Tubby', 'Scientist', 'Mad Professor', 'Augustus Pablo',
      'Prince Jammy', 'Prince Far I', 'Yabby You', 'The Upsetter', 'Joe Gibbs',
      'Burning Spear', 'Culture', 'Black Uhuru', 'The Congos', 'The Abyssinians',
      'Israel Vibration', 'Steel Pulse', 'Misty in Roots', 'Aswad',
      'Sly and Robbie', 'King Jammy', 'Bobby Digital', 'Steely & Clevie',
      'Zion Train', 'Dubkasm', 'Channel One', 'Mungo\'s Hi Fi',
      'Mala', 'Digital Mystikz',
      
      // Funk / Soul (Alternative: P-Funk, Neo-Soul)
      'Parliament', 'Funkadelic', 'George Clinton', 'Bootsy Collins', 'Bootsy\'s Rubber Band',
      'The Brides of Funkenstein', 'Parlet', 'Zapp', 'Roger Troutman',
      'Sly and the Family Stone', 'The Meters', 'The JB\'s', 'Fred Wesley',
      'James Brown', 'Dyke & the Blazers', 'The Poets of Rhythm', 'Menahan Street Band',
      'The Budos Band', 'Antibalas', 'Sharon Jones & the Dap-Kings', 'Charles Bradley',
      'D\'Angelo', 'Erykah Badu',
      'Frank Ocean', 'Solange', 'SZA', 'H.E.R.', 'Daniel Caesar',
      'Fela Kuti', 'Tony Allen', 'Ebo Taylor',
      
      // Classical (Alternative: Minimalism, Contemporary)
      'Philip Glass', 'Steve Reich', 'Terry Riley', 'La Monte Young', 'John Adams',
      'Michael Nyman', 'Gavin Bryars', 'Tom Johnson',
      'Arvo Pärt', 'Henryk Górecki', 'John Tavener', 'Morton Feldman', 'Giacinto Scelsi',
      'Karlheinz Stockhausen', 'Pierre Boulez', 'Iannis Xenakis', 'György Ligeti',
      'Max Richter', 'Ólafur Arnalds', 'Nils Frahm', 'Jóhann Jóhannsson', 'Peter Broderick',
      'Dustin O\'Halloran', 'Poppy Ackroyd', 'Hauschka', 'A Winged Victory for the Sullen',
      'Stars of the Lid', 'Tim Hecker', 'William Basinski', 'The Caretaker',
      'John Cage', 'Pauline Oliveros', 'Éliane Radigue', 'Alvin Lucier', 'Meredith Monk'
    ];
  }

  async selectSong() {
    try {
      const curatedArtists = this.curatedArtists;
      const learnedArtists = this.stats.learnedArtists;
      
      // Combine curated + learned artists
      const learnedList = Array.from(learnedArtists);
      const verifiedLearned = learnedList.filter(learned => 
        curatedArtists.some(curated => curated.toLowerCase() === learned.toLowerCase())
      );
      
      const allArtists = [...curatedArtists, ...verifiedLearned];
      
      // Filter out recently used
      const availableArtists = allArtists.filter(artist => 
        !this.recentlyUsedArtists.includes(artist.toLowerCase()) &&
        artist.toLowerCase() !== this.lastPlayedArtist?.toLowerCase()
      );
      
      if (availableArtists.length === 0) {
        this.recentlyUsedArtists = [];
        availableArtists.push(...allArtists);
      }
      
      // Select random artist
      const randomArtist = availableArtists[Math.floor(Math.random() * availableArtists.length)];
      this.recentlyUsedArtists.push(randomArtist.toLowerCase());
      
      if (this.recentlyUsedArtists.length > 15) {
        this.recentlyUsedArtists = this.recentlyUsedArtists.slice(-15);
      }
      
      this.logger.log(`🎲 Selected artist: ${randomArtist}`);
      
      // Get songs for artist (will be implemented via MetadataFetcher)
      const songs = await this.getSongsForArtist(randomArtist);
      
      if (songs.length > 0) {
        const unplayedSongs = songs.filter(song => {
          const songKey = `${randomArtist} - ${song}`;
          return !this.playedSongs.has(songKey);
        });
        
        const songsToUse = unplayedSongs.length > 0 ? unplayedSongs : songs;
        const randomSong = songsToUse[Math.floor(Math.random() * songsToUse.length)];
        
        this.lastPlayedArtist = randomArtist;
        
        return {
          artist: randomArtist,
          title: randomSong,
          source: 'Curated + MusicBrainz'
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error selecting song: ${error.message}`);
    return null;
    }
  }

  async getSongsForArtist(artist) {
    try {
      const searchUrl = `https://musicbrainz.org/ws/2/recording?query=artist:"${encodeURIComponent(artist)}"&fmt=json&limit=50`;
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'HangFM-Bot/1.0 (https://hang.fm)',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      if (response.data?.recordings) {
        const songs = response.data.recordings
          .map(recording => recording.title)
          .filter((title, index, self) => self.indexOf(title) === index);
        
        this.logger.debug(`Found ${songs.length} songs for ${artist}`);
        return songs;
      }
      
      return [];
    } catch (error) {
      this.logger.error(`Error fetching songs for ${artist}: ${error.message}`);
      return [];
    }
  }

  markSongPlayed(artist, title) {
    const songKey = `${artist} - ${title}`;
    this.playedSongs.add(songKey);
  }
}

module.exports = MusicSelector;
