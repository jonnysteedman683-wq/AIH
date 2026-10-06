// AIH background: 3 neon hexagons (red/blue/green) whose pulsing waves
// mix into secondary colors where they collide (red+blue=purple, etc).
// Canvas-based, fixed behind a frosted-glass content layer. Subtle + non-distracting.
(function(){
  var canvas = document.getElementById('bg-canvas');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  var W, H, dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize(){
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // Three hexagons: red, blue, green. Each drifts slowly and pulses.
  var hexes = [
      { x:0.22, y:0.30, r:210, hue:'255,80,80',   speed:0.9,  phase:0 },
      { x:0.78, y:0.28, r:192, hue:'80,140,255',  speed:1.1,  phase:2.1 },
      { x:0.50, y:0.72, r:240, hue:'80,220,140',  speed:0.7,  phase:4.2 }
    ];
  var t = 0;

  function hexPath(x, y, r){
    ctx.beginPath();
    for(var i=0;i<6;i++){
      var a = Math.PI/3 * i - Math.PI/6;
      var px = x + r*Math.cos(a), py = y + r*Math.sin(a);
      if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // additive blend: overlapping waves sum their RGB -> mixed colors appear
  ctx.globalCompositeOperation = 'lighter';

  function draw(){
    ctx.clearRect(0,0,W,H);
    t += 0.016;

    // slow drift
    for(var i=0;i<hexes.length;i++){
      var h = hexes[i];
      h.x += Math.sin(t*h.speed*0.3 + i*2.0) * 0.00035;
      h.y += Math.cos(t*h.speed*0.3 + i*1.3) * 0.00035;
    }

    // draw each hexagon's pulsing wave field
    for(var i=0;i<hexes.length;i++){
      var h = hexes[i];
      var x = h.x*W, y = h.y*H;
      var pulse = 0.5 + 0.5*Math.sin(t*h.speed + h.phase); // 0..1
      var waveR = h.r * (1.6 + pulse*2.6); // expanding ring

      // soft radial glow around the hexagon (subtle)
      var glow = ctx.createRadialGradient(x,y,0, x,y, h.r*2.2);
      glow.addColorStop(0, 'rgba('+h.hue+',0.16)');
      glow.addColorStop(1, 'rgba('+h.hue+',0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x,y,h.r*2.2,0,Math.PI*2); ctx.fill();

      // the hexagon body (neon, subtle)
      hexPath(x,y,h.r);
      ctx.fillStyle = 'rgba('+h.hue+',0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba('+h.hue+',0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // pulsing wave ring (the "wave" that expands and mixes)
      var ring = ctx.createRadialGradient(x,y,0, x,y, waveR);
      ring.addColorStop(0, 'rgba('+h.hue+',0.20)');
      ring.addColorStop(0.7, 'rgba('+h.hue+',0.05)');
      ring.addColorStop(1, 'rgba('+h.hue+',0)');
      ctx.fillStyle = ring;
      ctx.beginPath(); ctx.arc(x,y,waveR,0,Math.PI*2); ctx.fill();
    }

    requestAnimationFrame(draw);
  }
  draw();
})();
