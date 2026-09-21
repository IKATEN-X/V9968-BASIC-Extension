// Original indexed pixel art. Rebuilt deterministically with each demo disk.
const terrainPalette = [
  [0,0,0],[3,5,6],[6,9,10],[9,13,13],[14,17,17],[20,22,21],[3,8,9],[4,14,15],
  [8,22,21],[17,14,6],[26,22,8],[12,6,5],[23,10,8],[9,17,12],[16,25,16],[27,29,25]
];
const spritePalette = [
  [0,0,0],[1,3,4],[6,9,13],[13,18,22],[22,28,31],[31,31,31],[2,11,18],[3,24,31],
  [31,7,7],[31,17,7],[31,29,9],[16,3,6],[23,6,12],[4,24,17],[17,31,22],[15,16,20]
];
const font = {
  '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],
  '3':[30,1,1,14,1,1,30],'4':[2,6,10,18,31,2,2],'5':[31,16,16,30,1,1,30],
  '6':[14,16,16,30,17,17,14],'7':[31,1,2,4,8,8,8],'8':[14,17,17,14,17,17,14],
  '9':[14,17,17,15,1,1,14],A:[14,17,17,31,17,17,17],C:[14,17,16,16,16,17,14],
  E:[31,16,16,30,16,16,31],G:[14,17,16,23,17,17,15],H:[17,17,17,31,17,17,17],
  I:[14,4,4,4,4,4,14],K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],M:[17,27,21,21,17,17,17],
  N:[17,25,25,21,19,19,17],
  O:[14,17,17,17,17,17,14],P:[30,17,17,30,16,16,16],R:[30,17,17,30,20,18,17],
  S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],V:[17,17,17,17,17,10,4],Y:[17,17,10,4,4,4,4]
};
function bitmap(height, color=0) {
  const pixels=Buffer.alloc(256*height,color);
  const dot=(x,y,c)=>{if(x>=0 && x<256 && y>=0 && y<height) pixels[y*256+x]=c;};
  const rect=(x,y,w,h,c)=>{for(let j=y;j<y+h;j++) for(let i=x;i<x+w;i++) dot(i,j,c);};
  const frame=(x,y,w,h,c)=>{rect(x,y,w,1,c);rect(x,y+h-1,w,1,c);rect(x,y,1,h,c);rect(x+w-1,y,1,h,c);};
  const circle=(x,y,r,c)=>{for(let j=-r;j<=r;j++) for(let i=-r;i<=r;i++) if(i*i+j*j<=r*r) dot(x+i,y+j,c);};
  const text=(x,y,s,c,scale=1)=>{
    for(const ch of s) {
      for(let j=0;j<7;j++) for(let i=0;i<5;i++) if(font[ch]?.[j]&(16>>i)) rect(x+i*scale,y+j*scale,scale,scale,c);
      x+=6*scale;
    }
  };
  const file=()=>{
    const packed=Buffer.alloc(pixels.length/2);
    for(let i=0;i<packed.length;i++) packed[i]=pixels[i*2]*16+pixels[i*2+1];
    const header=Buffer.alloc(7);header[0]=254;header.writeUInt16LE(packed.length-1,3);
    return Buffer.concat([header,packed]);
  };
  return {dot,rect,frame,circle,text,file};
}

function city(district=0) {
  const b=bitmap(256,2),{rect,frame,circle,text,dot}=b;
  for(let y=0;y<256;y+=16) {
    rect(0,y,256,1,1);
    for(let x=0;x<256;x+=16) {rect(x,y,1,16,1);dot(x+2,y+2,4);}
  }
  // Continuous service roads and runway wrap cleanly at row 255 -> row 0.
  rect(88,0,80,256,1);
  for(const x of [6,246,90,164]) {rect(x,0,2,256,4);rect(x+2,0,1,256,1);}
  for(let y=0;y<256;y+=32) {
    rect(127,y+4,2,16,5);
    for(const x of [96,156]) {rect(x,y+4,3,10,9);rect(x,y+4,3,2,10);}
    for(const x of [6,246]) rect(x,y+8,2,4,8);
  }
  const building=(x,y,w,h)=>{
    rect(x+4,y+4,w,h,1);rect(x,y,w,h,1);rect(x+1,y+1,w-2,h-2,4);
    rect(x+2,y+3,w-4,h-6,3);rect(x+2,y+h-4,w-4,3,2);
    for(let i=x+5;i<x+w-5;i+=8) {rect(i,y+h-3,4,1,7);dot(i,y+1,5);}
    for(let j=y+7;j<y+h-8;j+=12) rect(x+4,j,w-8,1,2);
  };
  const vent=(x,y,w,h)=>{rect(x+2,y+2,w,h,1);rect(x,y,w,h,5);rect(x+1,y+1,w-2,h-2,2);for(let j=y+2;j<y+h-1;j+=3) rect(x+2,j,w-4,1,4);};
  if(district===3) {
    // A runway apron with service bays; the central road keeps the same seams.
    for(const y of [12,140]) {
      rect(17,y,61,100,1);frame(19,y+2,57,96,4);frame(23,y+6,49,88,9);
      rect(27,y+10,41,34,3);rect(27,y+10,41,3,5);
      for(let j=y+16;j<y+41;j+=5) rect(30,j,35,2,2);
      text(34,y+50,y===12?'04':'05',15);
      for(const x of [25,69]) for(let j=y+9;j<y+94;j+=16) rect(x,j,3,3,10);
      rect(31,y+75,8,10,4);rect(30,y+78,11,3,5);rect(33,y+73,4,14,7);
      rect(57,y+75,8,10,4);rect(56,y+78,11,3,5);rect(59,y+73,4,14,7);
    }
    building(180,12,57,72);vent(186,19,45,15);
    circle(208,57,16,1);circle(208,56,14,4);circle(208,55,11,6);
    rect(199,54,19,2,8);rect(207,46,2,19,8);circle(208,55,3,15);
    rect(181,96,54,7,1);rect(184,98,48,3,9);
    for(let x=185;x<232;x+=8) rect(x,98,4,3,10);
    for(const y of [116,164,212]) {
      building(180,y,57,34);rect(186,y+7,45,19,1);
      for(let x=190;x<228;x+=12) {rect(x,y+10,8,13,13);rect(x,y+10,8,3,14);}
    }
    for(const y of [26,154]) {
      for(const x of [103,145]) {rect(x,y,8,32,5);rect(x,y+35,8,5,9);}
      text(116,y+53,'04',5,2);
    }
    rect(80,119,96,12,1);rect(80,120,96,2,4);rect(80,129,96,1,4);
    for(let x=84;x<172;x+=12) rect(x,125,6,1,10);
    return b.file();
  }
  if(district===1) {
    // Cooling towers, turbine halls and exposed conduits.
    for(const y of [57,185]) {
      rect(18,y-30,61,62,1);frame(20,y-28,57,57,4);
      circle(51,y+3,24,1);circle(48,y,24,4);circle(48,y-1,21,5);
      circle(48,y-2,18,2);circle(48,y-2,15,6);circle(48,y-2,12,7);
      for(let d=-10;d<=10;d+=5) {rect(36,y-2+d,25,1,8);rect(48+d,y-14,1,25,6);}
      circle(48,y-2,4,1);circle(48,y-3,2,10);
      rect(24,y+33,48,8,1);rect(26,y+34,44,3,7);rect(26,y+34,44,1,8);
    }
    for(const y of [10,90,170]) {
      building(179,y,58,64);vent(185,y+7,46,18);
      rect(185,y+31,46,19,1);
      for(let x=188;x<230;x+=8) {rect(x,y+33,5,15,13);rect(x,y+33,5,3,14);rect(x+2,y+38,1,8,6);}
      text(187,y+53,'P',10);text(217,y+53,String(1+(y-10)/80),5);
    }
    rect(78,0,3,256,1);rect(79,0,1,256,7);rect(174,0,3,256,1);rect(175,0,1,256,7);
    rect(18,118,220,12,1);rect(18,119,220,2,4);rect(18,123,220,3,6);rect(18,124,220,1,8);
    for(const x of [28,65,181,227]) {rect(x,117,5,14,3);rect(x,117,2,14,5);}
    text(25,10,'02',5);
    return b.file();
  }
  if(district===2) {
    // Corrugated containers, a gantry crane and loading bays.
    building(17,12,61,78);vent(24,20,18,22);vent(48,20,22,22);
    rect(24,53,46,28,1);for(let y=55;y<79;y+=3) rect(26,y,42,1,4);
    text(26,95,'03',5);
    for(const y of [12,54,172,214]) for(const [x,color] of [[179,11],[210,13]]) {
      rect(x+3,y+3,26,31,1);rect(x,y,26,31,1);rect(x+1,y+1,24,29,color);
      for(let i=x+3;i<x+24;i+=4) rect(i,y+3,2,25,color===11?12:14);
      rect(x+2,y+1,22,1,5);rect(x+4,y+12,6,7,9);rect(x+5,y+13,4,5,10);
    }
    for(const x of [22,70,181,229]) {rect(x+3,101,5,64,1);rect(x,98,5,64,4);rect(x+1,99,1,62,5);}
    rect(17,111,221,18,1);rect(18,112,219,14,9);rect(18,112,219,2,10);
    for(let x=22;x<233;x+=12) for(let d=0;d<10;d++) rect(x+d,115+d,4,1,1);
    rect(116,126,22,20,1);rect(118,127,18,8,4);rect(122,130,10,3,7);
    rect(126,135,2,13,5);rect(120,145,8,3,10);
    rect(18,170,60,71,1);frame(20,172,56,67,9);
    for(let y=176;y<235;y+=19) for(let x=24;x<72;x+=24) {
      rect(x,y,20,15,3);frame(x+1,y+1,18,13,5);rect(x+9,y,2,15,2);
    }
    return b.file();
  }
  building(17,10,62,72);vent(23,18,20,26);vent(49,18,22,26);
  rect(25,52,44,15,1);rect(27,54,40,11,6);
  for(let x=29;x<67;x+=6) {rect(x,55,3,8,7);rect(x,55,3,2,8);}
  text(24,70,'07',5);
  building(180,8,57,40);vent(187,15,18,24);vent(211,15,18,24);
  for(const [x,y] of [[191,70],[223,70],[191,102],[223,102]]) {
    circle(x+3,y+3,13,1);circle(x,y,13,1);circle(x,y-1,11,4);circle(x-1,y-3,8,5);
    rect(x-3,y-10,6,19,3);rect(x-2,y-10,2,19,4);circle(x,y-2,3,2);
  }
  rect(174,57,3,61,2);rect(175,57,1,61,8);
  for(const y of [59,91]) {rect(176,y,47,3,1);rect(176,y,47,1,7);}
  building(18,92,60,55);vent(24,99,22,19);vent(51,99,19,19);
  rect(25,129,44,6,9);for(let x=26;x<69;x+=8) rect(x,129,4,6,1);
  // A raised cross-taxiway, with lights and chevrons at the runway intersection.
  rect(84,148,88,29,1);rect(85,149,86,25,4);rect(86,152,84,18,2);
  for(let x=91;x<166;x+=12) rect(x,160,6,1,5);
  for(let x=89;x<169;x+=8) {rect(x,150,3,1,10);rect(x,172,3,1,10);}
  building(179,132,58,56);vent(186,139,43,13);
  for(let y=160;y<=177;y+=8) for(let x=186;x<228;x+=10) {rect(x,y,7,5,1);rect(x+1,y+1,5,2,13);}
  rect(18,165,61,77,1);frame(20,167,57,73,4);frame(23,170,51,67,9);
  circle(48,199,21,4);circle(48,199,19,2);frame(36,188,25,23,5);text(42,192,'H',15,2);
  text(28,224,'03',5);rect(58,228,11,3,7);
  for(const y of [167,236]) for(const x of [20,74]) rect(x,y,3,3,10);
  building(179,202,58,41);vent(187,210,17,20);
  for(let y=210;y<235;y+=12) for(let x=212;x<232;x+=10) {rect(x,y,8,9,1);rect(x,y,6,7,11);rect(x,y,6,1,12);}
  for(const y of [6,86,157,250]) for(const x of [20,68,181,230]) {rect(x,y,6,2,1);dot(x,y,8);}
  return b.file();
}

function sprites() {
  const b=bitmap(128),{rect,circle,text,dot}=b;
  // 16x32 player: narrow nose, cockpit, swept wings, twin exhausts.
  const ship=[
    '0000000110000000','0000001441000000','0000001451000000','0000013443100000',
    '0000013773100000','0000013673100000','0000013663100000','0000013663100000',
    '0000133443310000','0000134554310000','0001344554431000','0012344554432100',
    '0013444554433100','0133444554433310','1343444554434341','1442444554424441',
    '1442444554424441','1442443443424441','1332443443424331','1122343443432211',
    '0011343443431100','0001143113411000','0000141001410000','0000191001910000',
    '00001A1001A10000','0000191001910000','0000090000900000','0000000000000000'
  ];
  ship.forEach((row,y)=>[...row].forEach((c,x)=>dot(x,y,parseInt(c,16))));
  const enemy=[
    '0001000000001000','0018100000018100','0018910000198100','0188911111988810',
    '0188988888988810','1888999999988881','188BC888888CB881','18BCC877778CCB81',
    '018BC866668CB810','001BC866668CB100','001188C88C881100','0000188888810000',
    '0000018998100000','0000001991000000','0000000110000000','0000000000000000'
  ];
  enemy.forEach((row,y)=>[...row].forEach((c,x)=>dot(16+x,y,parseInt(c,16))));
  rect(38,1,4,13,7);rect(39,0,2,13,5);rect(38,12,4,3,6);
  circle(55,7,7,8);circle(55,7,5,9);circle(55,7,3,10);circle(55,7,1,5);
  for(const [x,y] of [[49,1],[61,2],[48,12],[61,13]]) rect(x,y,2,2,10);
  circle(72,7,5,11);circle(72,7,4,8);circle(72,7,3,10);circle(71,6,1,5);
  // Armored gunship: 16x32 source, displayed at 32x32 by sprite mode 3.
  const gunship=[
    '0000110000110000','0001CC1001CC1000','001C99100199C100','001C99111199C100',
    '001CBCC88CCBC100','01CCBCCCCCCBCC10','01CCB899998BCC10','1CCCB899998BCCC1',
    '1CCCB877778BCCC1','1CCCB877778BCCC1','1CCCB866668BCCC1','1CCCB866668BCCC1',
    '1CCCBCCCCCCBCCC1','19CCBCCCCCCBCC91','19CCB899998BCC91','19CCB899998BCC91',
    '19CCB899998BCC91','19CCBCCCCCCBCC91','19CCBBCCCCBBCC91','11CCBBCCCCBBCC11',
    '01CC1BCBBCB1CC10','01CC1BCBBCB1CC10','01CC11C88C11CC10','019910C88C019910',
    '019910C88C019910','0199108998019910','0011008998001100','0000001991000000',
    '0000001991000000','0000001AA1000000','0000000110000000','0000000000000000'
  ];
  gunship.forEach((row,y)=>[...row].forEach((c,x)=>dot(128+x,y,parseInt(c,16))));
  rect(240,0,16,16,1);rect(240,15,16,1,6);
  for(let n=0;n<10;n++) text(n*16+5,36,String(n),5);
  text(164,36,'SC',7);text(181,36,'L',14);
  text(228,36,'II',10);
  // Fit the 14-pixel glyphs within each 16-row tile, with one clear row per side.
  for(const [i,c] of [...'GAMEOVER'].entries()) text(i*16+3,65,c,10,2);
  return b.file();
}

function title(patterns) {
  const b=bitmap(256,1),{rect,frame,text,dot}=b;
  for(let y=0;y<256;y+=16) {
    rect(0,y,256,1,2);
    for(let x=0;x<256;x+=16) {rect(x,y,1,16,2);dot(x+3,y+3,3);}
  }
  rect(82,0,92,256,1);rect(88,0,2,256,4);rect(166,0,2,256,4);
  for(let y=4;y<256;y+=24) for(const x of [84,170]) rect(x,y,2,6,8);
  for(const x of [10,196]) for(const y of [90,132,174]) {
    rect(x+3,y+3,48,29,0);rect(x,y,48,29,3);rect(x,y,48,2,5);
    for(let j=y+6;j<y+25;j+=4) rect(x+4,j,40,2,2);
    rect(x+5,y+24,5,2,8);rect(x+36,y+24,7,2,9);
  }
  // Title lettering sits above a parked version of the actual playable ship.
  rect(8,8,240,75,1);rect(8,8,240,2,7);rect(8,81,240,2,7);
  text(67,21,'SKYLINE',0,3);text(67,19,'SKYLINE',8,3);
  text(59,50,'PATROL',0,4);text(59,48,'PATROL',15,4);
  frame(97,89,62,90,9);rect(98,90,60,88,2);
  for(const x of [97,155]) {rect(x,89,4,12,10);rect(x,167,4,12,10);}
  const colors=[0,1,2,3,4,15,6,8,11,9,10,11,12,13,14,5];
  for(let y=0;y<28;y++) for(let x=0;x<16;x++) {
    const packed=patterns[7+y*128+(x>>1)],c=x&1?packed&15:packed>>4;
    if(c) rect(104+x*3,92+y*3,3,3,colors[c]);
  }
  rect(72,184,112,26,1);text(102,190,'START',15,2);
  for(let i=0;i<5;i++) rect(88+i,193+i,1,9-2*i,10);
  return b.file();
}

export function shootAssets() {
  const palette=[...terrainPalette,...spritePalette];
  const patterns=sprites();
  return new Map([
    ['CITY.SC5',city()],['POWER.SC5',city(1)],['CARGO.SC5',city(2)],['RUNWAY.SC5',city(3)],
    ['SHIPS.SC5',patterns],['TITLE.SC5',title(patterns)],
    ['SHOOT.PAL',Buffer.from(palette.map((rgb,i)=>[i,...rgb].join(',')).join('\r\n')+'\r\n','ascii')]
  ]);
}
