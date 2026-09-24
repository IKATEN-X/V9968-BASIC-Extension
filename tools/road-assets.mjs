// Original SCREEN 5 road strips and a 16x32 sprite-mode-3 car.
const backgroundPalette = [
  [0,0,0],[3,5,5],[5,12,6],[6,14,7],[6,7,8],[7,8,9],[13,14,14],[29,30,27],
  [28,6,6],[30,26,10],[30,14,4],[3,9,4],[8,17,8],[4,5,6],[10,19,20],[31,31,31]
];
const carPalette = [
  [0,0,0],[1,2,3],[7,9,10],[17,19,20],[20,28,31],[31,31,31],[2,10,17],[4,21,28],
  [27,3,4],[31,10,7],[31,27,12],[13,2,4],[20,3,4],[31,18,9],[18,24,27],[27,30,30]
];

function screenFile(pixels) {
  const packed=Buffer.alloc(pixels.length/2);
  for(let i=0;i<packed.length;i++) packed[i]=(pixels[i*2]<<4)|pixels[i*2+1];
  const header=Buffer.alloc(7);header[0]=254;header.writeUInt16LE(packed.length-1,3);
  return Buffer.concat([header,packed]);
}

function road() {
  const pixels=Buffer.alloc(256*192,2);
  const grass=(x,y)=>((x&1) && (y&1))?3:2;
  for(let y=0;y<192;y++)for(let x=0;x<256;x++)pixels[y*256+x]=grass(x,y);
  for(let slope=0;slope<5;slope++)for(let phase=0;phase<2;phase++) {
    const top=(slope*2+phase)*16,delta=(slope-2)*4;
    for(let y=0;y<16;y++) {
      // The bottom boundary joins the previous strip at x=80; the top moves by delta.
      const center=80+Math.floor((delta*(16-y)+8)/16);
      for(let x=0;x<160;x++) {
        const d=x-center,a=Math.abs(d);
        let c=grass(x,y);
        if(a<=65)c=1;
        if(a<=63)c=(y&8)?8:7;
        if(a<=59)c=6;
        if(a<=57)c=((x+3*y)&15)===0?5:4;
        if(phase===0 && (d===-20 || d===19))c=7;
        if(phase===0 && y>=4 && y<=9 && (a===69 || a===70))c=y<6?8:7;
        pixels[(top+y)*256+x]=c;
      }
    }
  }
  return screenFile(pixels);
}

function car() {
  const pixels=Buffer.alloc(256*32);
  const dot=(x,y,c)=>{pixels[y*256+x]=c;};
  const rect=(x,y,w,h,c)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)dot(i,j,c);};
  rect(4,29,10,3,2);
  for(const y of [7,23]) {
    rect(0,y,3,5,1);rect(13,y,3,5,1);
    rect(1,y+1,1,3,2);rect(14,y+1,1,3,2);
  }
  for(let y=0;y<31;y++) {
    const left=y<2?5:y<4?3:2,right=15-left;
    for(let x=left;x<=right;x++) {
      let c=x===left || x===right || y===0 || y===30?1:8;
      if(c===8 && x===left+1)c=9;
      if(c===8 && x>=right-2)c=12;
      dot(x,y,c);
    }
  }
  rect(4,4,8,4,9);rect(7,3,2,5,5);
  rect(3,3,2,2,10);rect(11,3,2,2,10);
  rect(4,9,8,6,6);rect(5,9,6,4,7);rect(5,9,6,1,4);rect(5,13,6,1,14);
  rect(4,16,8,5,8);rect(7,16,2,5,5);
  rect(4,22,8,4,6);rect(5,22,6,2,7);rect(5,22,6,1,4);
  rect(3,27,10,2,12);rect(3,28,2,2,9);rect(11,28,2,2,9);
  rect(5,29,6,1,14);rect(3,16,1,4,14);rect(12,16,1,4,3);
  return screenFile(pixels);
}

export function roadAssets() {
  const palette=[...backgroundPalette,...carPalette].map((rgb,i)=>[i,...rgb].join(',')).join('\r\n')+'\r\n';
  return new Map([['ROAD.SC5',road()],['CAR.SC5',car()],['ROAD.PAL',Buffer.from(palette,'ascii')]]);
}
