/* ============================================================
   PENALTY SHOOTOUT — data (ES module)
   Nations w/ KIT colors (shirt / shorts / socks), star takers,
   and a believable "next opponent" map. Mirrors the repo's
   stars.ts + nextOpponent() so it ports straight back.
   ============================================================ */

// kit: shirt (primary), shorts, socks, trim (accent). flag = flagcdn code.
const K = (id,name,flag,shirt,shorts,socks,trim)=>({id,name,flag,shirt,shorts,socks,trim});

export const NATIONS = {
  BRA: K('BRA','Brazil','br','#F7D117','#1A3A8F','#1A3A8F','#0BA04A'),
  ARG: K('ARG','Argentina','ar','#74ACDF','#0B1F4E','#0B1F4E','#FFFFFF'),
  FRA: K('FRA','France','fr','#1B2A6B','#FFFFFF','#C8102E','#C8102E'),
  ESP: K('ESP','Spain','es','#C60B1E','#0B2A6B','#0B2A6B','#F1BF00'),
  ENG: K('ENG','England','gb-eng','#F4F6FB','#0A1A52','#0A1A52','#C8102E'),
  POR: K('POR','Portugal','pt','#A6093D','#1B5E20','#1B5E20','#0B6E3B'),
  GER: K('GER','Germany','de','#F4F6FB','#101418','#101418','#C8102E'),
  NED: K('NED','Netherlands','nl','#EC6A1A','#101418','#EC6A1A','#FFFFFF'),
  MEX: K('MEX','Mexico','mx','#0B7A3B','#FFFFFF','#C8102E','#C8102E'),
  USA: K('USA','United States','us','#F4F6FB','#0A1A52','#0A1A52','#C8102E'),
  CRO: K('CRO','Croatia','hr','#E01A22','#0A1A6B','#0A1A6B','#FFFFFF'),
  JPN: K('JPN','Japan','jp','#1A2C7B','#1A2C7B','#1A2C7B','#E01A22'),
  SEN: K('SEN','Senegal','sn','#0B8A3D','#FFFFFF','#0B8A3D','#FCD116'),
  MAR: K('MAR','Morocco','ma','#B81B2C','#0B5E33','#B81B2C','#0B5E33'),
  BEL: K('BEL','Belgium','be','#B01020','#101418','#C8102E','#F1BF00'),
  URU: K('URU','Uruguay','uy','#5BA0D0','#101418','#101418','#FFFFFF'),
  KOR: K('KOR','South Korea','kr','#C8102E','#101418','#C8102E','#0A1A52'),
  GHA: K('GHA','Ghana','gh','#F4F6FB','#0B7A3B','#C8102E','#FCD116'),
  NOR: K('NOR','Norway','no','#C8102E','#0A1A52','#0A1A52','#FFFFFF'),
  EGY: K('EGY','Egypt','eg','#C8102E','#FFFFFF','#101418','#101418'),
};

export const STARS = {
  ARG:{name:'Messi',no:10}, POR:{name:'Ronaldo',no:7}, BRA:{name:'Neymar',no:10},
  FRA:{name:'Mbappé',no:10}, ENG:{name:'Bellingham',no:10}, ESP:{name:'Yamal',no:19},
  NED:{name:'Gakpo',no:11}, GER:{name:'Musiala',no:10}, BEL:{name:'De Bruyne',no:7},
  CRO:{name:'Modrić',no:10}, MAR:{name:'Hakimi',no:2}, URU:{name:'Valverde',no:15},
  JPN:{name:'Mitoma',no:11}, USA:{name:'Pulisic',no:10}, MEX:{name:'Giménez',no:9},
  SEN:{name:'Mané',no:10}, NOR:{name:'Haaland',no:9}, EGY:{name:'Salah',no:10},
  KOR:{name:'Son',no:7}, GHA:{name:'Kudus',no:20},
};
export const starOf = (id,name)=> STARS[id] || { name:name||'', no:10 };

// believable next fixture (keeper's nation)
export const NEXT = {
  BRA:'SEN', ARG:'MEX', FRA:'JPN', ESP:'CRO', ENG:'USA', POR:'GHA',
  GER:'KOR', NED:'EGY', MEX:'ARG', USA:'ENG', CRO:'ESP', JPN:'FRA',
  SEN:'BRA', MAR:'BEL', BEL:'MAR', URU:'NOR', KOR:'GER', GHA:'POR',
  NOR:'URU', EGY:'NED',
};
export const nextOpponent = (id)=> NATIONS[NEXT[id]] ? NEXT[id] : (Object.keys(NATIONS).find(n=>n!==id));

// pre-draft practice roster (marquee nations)
export const PRACTICE = ['BRA','ARG','FRA','ESP','ENG','POR'];

export const flagUrl = (code)=>`https://flagcdn.com/w160/${code}.png`;
