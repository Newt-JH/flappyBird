"use client";

import React, { useEffect, useRef } from 'react';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const bestRef = useRef<HTMLSpanElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const pauseBtnRef = useRef<HTMLButtonElement>(null);
  const restartBtnRef = useRef<HTMLButtonElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ===== 타입 정의 =====
    type PipeSegment = { y: number; h: number };
    type Pipe = {
      x: number;
      w: number;
      top: PipeSegment & { passed: boolean };
      bottom: PipeSegment;
    };

    // 1) DOM 참조
    const canvas = canvasRef.current;
    const scoreEl = scoreRef.current;
    const bestEl = bestRef.current;
    const guideEl = guideRef.current;
    const pauseBtn = pauseBtnRef.current;
    const restartBtn = restartBtnRef.current;
    const gameEl = gameRef.current;

    if (!canvas || !scoreEl || !bestEl || !guideEl || !pauseBtn || !restartBtn || !gameEl) return;

    // 비널 별칭
    const canvasEl = canvas as HTMLCanvasElement;
    const scoreEl_ = scoreEl as HTMLSpanElement;
    const bestEl_ = bestEl as HTMLSpanElement;
    const guideEl_ = guideEl as HTMLDivElement;
    const pauseBtn_ = pauseBtn as HTMLButtonElement;
    const restartBtn_ = restartBtn as HTMLButtonElement;
    const gameEl_ = gameEl as HTMLDivElement;

    const ctx = canvasEl.getContext('2d') as CanvasRenderingContext2D;

    // ===== 게임 상태 =====
    const G = {
      playing: false,
      paused: false,
      over: false,
      time: 0,
      score: 0,
      best: parseInt(localStorage.getItem('flappy.best') || '0', 10),
      W: 360, H: 640,
      gravity: 1200,
      flap: 320,
      maxFall: 520,
      pipeGap: 150,
      pipeW: 64,
      pipeSpacing: 180,
      groundH: 56,
      // 속도(가속 적용)
      speedBase: 140,
      speedCur: 140,
      speedMax: 300,
      speedAccel: 12, // px/s^2
    };

    // 새
    const bird = {
      x: 80, y: 240, r: 14,
      vy: 0,
      angle: 0
    };

    // 파이프
    let pipes: Pipe[] = [];

    // ===== 유틸 =====
    function rand(min: number, max: number) { return Math.random() * (max - min) + min; }

    function resetGame() {
      G.playing = false;
      G.paused = false;
      G.over = false;
      G.time = 0;
      G.score = 0;
      G.speedCur = G.speedBase;
      pipes = [];
      bird.x = 80;
      bird.y = G.H / 2;
      bird.vy = 0;
      bird.angle = 0;
      scoreEl_.textContent = '0';
      bestEl_.textContent = String(G.best);
      guideEl_.style.display = 'block';
      guideEl_.innerHTML = '⬆️ 탭/클릭/스페이스/↑ 로 점프<br/>장애물을 통과해보세요!';
    }

    function startGame() {
      if (G.over) resetGame();
      if (!G.playing) {
        G.playing = true;
        guideEl_.style.display = 'none';
      }
      // 시작 직후 플랩은 점수에 포함 X (공정성)
      flap();
    }

    function gameOver() {
      G.playing = false;
      G.over = true;
      G.paused = false;
      guideEl_.style.display = 'block';
      guideEl_.textContent = `게임 오버! 점수 ${G.score}  —  다시 시작하려면 탭/클릭/스페이스`;
      if (G.score > G.best) {
        G.best = G.score;
        localStorage.setItem('flappy.best', String(G.best));
      }
      bestEl_.textContent = String(G.best);
    }

    function togglePause() {
      if (!G.playing || G.over) return;
      G.paused = !G.paused;
      pauseBtn_.textContent = G.paused ? '재개' : '일시정지';
      guideEl_.style.display = G.paused ? 'block' : 'none';
      if (G.paused) guideEl_.textContent = '일시정지 — 재개하려면 버튼/탭/스페이스';
    }

    function flap() {
      if (G.over) return;
      bird.vy = -G.flap;
    }

    function addScoreByFlap() {
      // 플레이 중 & 일시정지 아님일 때만 +1
      if (G.playing && !G.paused && !G.over) {
        G.score += 1;
        scoreEl_.textContent = String(G.score);
      }
    }

    // ===== 입력 핸들러 =====
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp'].includes(e.code)) e.preventDefault();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp'].includes(e.code)) {
        if (!G.playing) startGame();
        else if (G.paused) togglePause();
        else { flap(); addScoreByFlap(); }
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      if (!G.playing) startGame();
      else if (G.paused) togglePause();
      else { flap(); addScoreByFlap(); }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    gameEl_.addEventListener('pointerdown', handlePointerDown, { passive: false });
    pauseBtn_.addEventListener('click', togglePause);
    restartBtn_.addEventListener('click', resetGame);

    // ===== 파이프 로직 =====
    function spawnPipePair(startX: number) {
      const safeTop = 60;
      const safeBottom = G.H - G.groundH - 60;
      const gapYCenter = rand(safeTop + G.pipeGap / 2, safeBottom - G.pipeGap / 2);
      const topH = Math.max(10, gapYCenter - G.pipeGap / 2);
      const bottomY = gapYCenter + G.pipeGap / 2;
      const bottomH = Math.max(10, (G.H - G.groundH) - bottomY);

      pipes.push({
        x: startX,
        w: G.pipeW,
        top: { y: 0, h: topH, passed: false },
        bottom: { y: bottomY, h: bottomH }
      });
    }

    function updatePipes(dt: number) {
      if (pipes.length === 0) {
        spawnPipePair(G.W + 80);
      } else {
        const last = pipes[pipes.length - 1];
        if (last.x < G.W - G.pipeSpacing) {
          spawnPipePair(G.W + 80);
        }
      }

      for (const p of pipes) {
        p.x -= G.speedCur * dt;
        // 점수는 통과가 아니라 "탭"에서 처리하므로 여기서는 증가시키지 않음
      }
      pipes = pipes.filter(p => p.x + p.w > -40);
    }

    // ===== 충돌 =====
    function circleRectCollide(cx: number, cy: number, cr: number, rx: number, ry: number, rw: number, rh: number) {
      const nearestX = Math.max(rx, Math.min(cx, rx + rw));
      const nearestY = Math.max(ry, Math.min(cy, ry + rh));
      const dx = cx - nearestX;
      const dy = cy - nearestY;
      return (dx * dx + dy * dy) <= cr * cr;
    }

    function checkCollision() {
      if (bird.y + bird.r >= G.H - G.groundH || bird.y - bird.r <= 0) return true;
      for (const p of pipes) {
        if (circleRectCollide(bird.x, bird.y, bird.r, p.x, p.top.y, p.w, p.top.h)) return true;
        if (circleRectCollide(bird.x, bird.y, bird.r, p.x, p.bottom.y, p.w, p.bottom.h)) return true;
      }
      return false;
    }

    // ===== 렌더 =====
    function drawBackground(_dt: number, t: number) {
      ctx.save();
      const hillY = G.H - G.groundH - 80;
      const offset = (t * (G.speedCur * .2)) % (G.W + 120);

      for (let i = -1; i < 4; i++) {
        const x = i * 160 - offset;
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath();
        ctx.ellipse(x + 80, hillY, 60, 20, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawPipes() {
      for (const p of pipes) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--pipe').trim() || '#16a34a';
        ctx.fillRect(p.x, p.top.y, p.w, p.top.h);
        ctx.fillRect(p.x, p.bottom.y, p.w, p.bottom.h);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--pipe-dark').trim() || '#0f7a35';
        ctx.fillRect(p.x + p.w - 8, p.top.y, 8, p.top.h);
        ctx.fillRect(p.x + p.w - 8, p.bottom.y, 8, p.bottom.h);
        ctx.fillRect(p.x - 6, p.top.h - 10, p.w + 12, 10);
        ctx.fillRect(p.x - 6, p.bottom.y, p.w + 12, 10);
      }
    }

    function drawBird() {
      ctx.save();
      ctx.translate(bird.x, bird.y);
      ctx.rotate(bird.angle);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bird').trim() || '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(0, 0, bird.r + 2, bird.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(6, -4, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(bird.r - 2, 0);
      ctx.lineTo(bird.r + 8, -2);
      ctx.lineTo(bird.r - 2, 4);
      ctx.closePath();
      ctx.fill();
      const flapAnim = Math.sin(G.time * 10) * 4;
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.ellipse(-4, 2 + flapAnim * 0.2, 6, 4, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawGround(t: number) {
      const groundY = G.H - G.groundH;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() || '#8b5a2b';
      ctx.fillRect(0, groundY, G.W, G.groundH);
      const stripeW = 24;
      const offset = (t * G.speedCur) % stripeW;
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      for (let x = -stripeW; x < G.W + stripeW; x += stripeW) {
        ctx.fillRect(Math.floor(x - offset), groundY, stripeW / 2, G.groundH);
      }
    }

    function clearCanvas() {
      ctx.clearRect(0, 0, G.W, G.H);
    }

    // ===== 메인 루프 =====
    let prevTs = performance.now();
    function frame(now: number) {
      requestAnimationFrame(frame);
      const dtRaw = (now - prevTs) / 1000;
      prevTs = now;
      const dt = Math.min(dtRaw, 0.033);

      if (G.paused) return;

      // 속도 가속
      if (G.playing && !G.over) {
        G.speedCur = Math.min(G.speedMax, G.speedCur + G.speedAccel * dt);
      }

      G.time += dt;
      clearCanvas();
      drawBackground(dt, G.time);

      if (G.playing && !G.over) {
        bird.vy += G.gravity * dt;
        if (bird.vy > G.maxFall) bird.vy = G.maxFall;
        bird.y += bird.vy * dt;
        bird.angle = Math.max(-0.6, Math.min(0.9, bird.vy / 420));
        updatePipes(dt);
        if (checkCollision()) {
          gameOver();
        }
      }

      drawPipes();
      drawBird();
      drawGround(G.time);
    }

    // ===== DPR/리사이즈 =====
    function setupDPR() {
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      const cssW = window.innerWidth;
      const cssH = window.innerHeight;
      canvasEl.width = Math.round(cssW * dpr);
      canvasEl.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      G.W = cssW;
      G.H = cssH;
    }
    window.addEventListener('resize', setupDPR);

    // ===== 페이지 숨김 처리 =====
    const handleVisibilityChange = () => {
      if (document.hidden && G.playing && !G.over) {
        G.paused = true;
        pauseBtn_.textContent = '재개';
        guideEl_.style.display = 'block';
        guideEl_.textContent = '일시정지 — 재개하려면 버튼/탭/스페이스';
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 초기화 & 루프 시작
    setupDPR();
    resetGame();
    requestAnimationFrame((t) => { prevTs = t; requestAnimationFrame(frame); });

    // 클린업
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      gameEl_.removeEventListener('pointerdown', handlePointerDown);
      pauseBtn_.removeEventListener('click', togglePause);
      restartBtn_.removeEventListener('click', resetGame);
      window.removeEventListener('resize', setupDPR);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className="wrap">
      <div className="game" id="game" ref={gameRef}>
        <canvas ref={canvasRef} id="cv" width="360" height="640" aria-label="Flappy Bird Mini Game"></canvas>
        <div className="hud">
          <div className="topbar">
            <div className="score">
              <span>점수:</span><span id="score" ref={scoreRef}>0</span>
              <span style={{ opacity: 0.6, marginLeft: '8px' }}>최고:</span><span id="best" ref={bestRef}>0</span>
            </div>
            <div className="buttons">
              <button className="btn" id="btn-pause" ref={pauseBtnRef}>일시정지</button>
              <button className="btn" id="btn-restart" ref={restartBtnRef}>다시시작</button>
            </div>
          </div>
          <div className="center-guide" id="guide" role="status" ref={guideRef}>
            ⬆️ 탭/클릭/스페이스/↑ 로 점프<br />
            장애물을 통과해보세요!
          </div>
          <div className="bottom-tip">
            모바일: 화면 탭 · 데스크탑: 클릭/스페이스/↑ | 장애물이나 바닥에 닿으면 게임 오버
          </div>
        </div>
      </div>

      {/* HUD가 모바일에서도 확실히 보이도록 글로벌 스타일 추가 */}
      <style jsx global>{`
        html, body { margin: 0; height: 100%; background: #0ea5e9; }
        .wrap { height: 100vh; width: 100vw; }
        .game {
          position: fixed;
          inset: 0;
          background: linear-gradient(#7dd3fc, #38bdf8);
          overflow: hidden;
        }
        canvas { width: 100%; height: 100%; display: block; }

        .hud {
          position: absolute;
          inset: env(safe-area-inset-top, 0) 8px env(safe-area-inset-bottom, 0) 8px;
          display: grid;
          grid-template-rows: auto 1fr auto;
          z-index: 10;
          color: #fff;
          pointer-events: none; /* 게임 입력은 캔버스가 받도록 */
        }
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        .score {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          pointer-events: auto;
          background: rgba(0,0,0,.45);
          border: 1px solid rgba(255,255,255,.25);
          border-radius: 12px;
          padding: 6px 10px;
          font-weight: 800;
          font-size: clamp(16px, 3.8vw, 22px); /* 모바일에서 크게 보이도록 */
          text-shadow: 0 1px 2px rgba(0,0,0,.6);
        }
        .buttons {
          display: flex; gap: 6px; pointer-events: auto;
        }
        .btn {
          background: rgba(0,0,0,.45);
          border: 1px solid rgba(255,255,255,.25);
          color: #fff;
          padding: 6px 10px;
          border-radius: 10px;
          font-weight: 700;
        }
        .center-guide {
          align-self: center;
          justify-self: center;
          text-align: center;
          background: rgba(0,0,0,.45);
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.25);
          font-size: clamp(14px, 3.5vw, 18px);
          text-shadow: 0 1px 2px rgba(0,0,0,.5);
        }
        .bottom-tip {
          text-align: center;
          font-size: clamp(11px, 3vw, 13px);
          opacity: .9;
          text-shadow: 0 1px 2px rgba(0,0,0,.5);
        }
      `}</style>
    </div>
  );
}
