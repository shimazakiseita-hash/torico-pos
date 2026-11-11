// とりこフライト：タップで はばたいて、いん石の すきまを ぬける宇宙の旅
//   10こ ぬけるごとに ステージが かわる（そら → つき → ほしくず → りゅうせいぐん）。りゅうせいぐんを ぬけると ボス「はらぺこUFO」
//   アイテム：串（点）・金の串・たれびん（5秒 たれビームを撃てる）・バリア（1回だけ助かる）
//   ボスは周回ごとに かわる（はらぺこUFO → ゴロゴロいん石 → ブラックホール → …）。たおしても にげられても 次の周へ。周回するほど むずかしくなる
//   新しいアイテム：つくねばくだん（画面の敵を ぜんぶ たおす）・ふわふわ羽（しばらく ゆっくり落ちる）・しいたけ（しばらく小さくなる）
//   ショップの強化（up）：スタートバリア・たれビーム長もち・アイテム運
//
// 点数（src/lib/ranking.ts の MAX_POINTS_PER_SECOND.flight の根拠）
//   すきま 10、串 30、金の串 100（1つのすきまに アイテムは1つまで）、UFO 20、小いん石 10、ボスに1発 2・たおす 150＋50×周回
//   すきまの間隔 210px、速さは最大 270px/秒 → 1つに最低0.78秒。1つのすきまで 10＋100＋UFO 20＋小いん石 10×2 = 150 → 約190点/秒
//   ボス戦は 1秒に約5.5発 × 2 ＝ 11点/秒 ＋ たおしたとき 1回だけ
//   （上限は余裕をみて200）

import { COLORS, FONT, H, Popups, W, drawHud, drawMascot, drawSkewer, drawSpace, heart, star, view } from "./common.js";

export const META = {
  id: "flight",
  title: "とりこフライト",
  howto: "タップで はばたいて、いん石の すきまを ぬけよう。たれびんで ビーム、バリアで 1回セーフ。りゅうせいぐんの先には ボスが まってる！",
  pointRate: 0.25,
};

const X = 100;
const BASE_R = 19; // 当たり判定（絵は少し大きい）
const SMALL_R = 11; // しいたけで小さくなったとき
const ITEM_SECONDS = 6; // ふわふわ羽・しいたけ
const GRAVITY = 1500;
const FLAP = -430;
const COL_W = 58;
const SPACING = 210;
const FLOOR = H - 24;
const PER_STAGE = 10;
const GUN_SECONDS = 5;
const SAFE_SECONDS = 1.2;
const BOSS_SECONDS = 35;
const SHOT_EVERY = 0.18;

/** ステージ：tint は背景の色、move はすきまが上下に動く幅、ufo は UFO が出る確率、meteor は小いん石が降る間隔（秒、0 は降らない） */
const STAGES = [
  { name: "そらのうえ", tint: "rgba(237,130,167,0.18)", move: 0, ufo: 0, meteor: 0 },
  { name: "つきのうら", tint: "rgba(201,179,230,0.14)", move: 45, ufo: 0, meteor: 0 },
  { name: "ほしくずのうみ", tint: "rgba(128,247,253,0.10)", move: 30, ufo: 0.55, meteor: 0 },
  { name: "りゅうせいぐん", tint: "rgba(229,90,34,0.16)", move: 55, ufo: 0.3, meteor: 1.1 },
];

/** ボス（周回ごとに順番に出る） */
const BOSSES = [
  { type: "ufo", name: "はらぺこUFO" },
  { type: "rock", name: "ゴロゴロいん石" },
  { type: "hole", name: "ブラックホール" },
];

export function createGame({ costume, up = {} }) {
  const pop = new Popups();
  const gunSeconds = GUN_SECONDS + 2 * (up.flightGun ?? 0);
  const luck = 1 + 0.3 * (up.flightLuck ?? 0);
  let R = BASE_R;
  const state = {
    score: 0,
    y: H * 0.42,
    vy: 0,
    flying: false, // 最初のタップまでは浮いて待つ
    cols: [],
    ufos: [],
    meteors: [],
    shots: [], // たれビーム
    beams: [], // 敵のたま
    passed: 0, // ぬけた数（ボス戦のあいだは増えない）
    stageIndex: 0, // 0〜。4で割った余りが STAGES の番号、4で割った商が周回
    sinceStage: 0,
    banner: { text: "ステージ1 そらのうえ", age: 0 },
    nextIn: 1.1,
    meteorIn: 2,
    gun: 0,
    nextShot: 0,
    shield: !!up.flightShield,
    glide: 0,
    small: 0,
    flash: 0,
    safe: 0,
    boss: null,
    over: false,
    t: 0,
    scroll: 0,
    flap: 0,
    shake: 0,
  };

  const stage = () => STAGES[state.stageIndex % STAGES.length];
  const lap = () => Math.floor(state.stageIndex / STAGES.length);
  // 速さとすきまは ぬけた数で決まる（周回して景色が戻っても、やさしくはならない）
  const speed = () => Math.min(270, 150 + state.passed * 1.6);
  const gap = () => Math.max(128, 196 - state.passed * 1.1);
  // 2しゅうめからは、どのステージでも すきまが動き、UFO が出る
  const move = () => (lap() > 0 ? Math.max(stage().move, 50) : stage().move);
  const ufoRate = () => (lap() > 0 ? Math.max(stage().ufo, 0.35) : stage().ufo);

  function banner(text) {
    state.banner = { text, age: 0 };
  }

  function addColumn() {
    const g = gap();
    const center = 90 + g / 2 + Math.random() * (FLOOR - 150 - g);
    // アイテム運の強化で、串以外のアイテムが出やすくなる
    const table = [
      ["gold", 0.05],
      ["gun", 0.07],
      ["shield", state.shield ? 0 : 0.05],
      ["bomb", 0.04],
      ["glide", 0.04],
      ["small", 0.04],
    ];
    let r = Math.random();
    let item = null;
    for (const [k, w] of table) {
      if (r < w * luck) {
        item = k;
        break;
      }
      r -= w * luck;
    }
    if (!item && r < 0.46) item = "skewer";
    state.cols.push({
      x: W + COL_W,
      center,
      g,
      amp: move(),
      phase: Math.random() * Math.PI * 2,
      scored: false,
      item: item ? { kind: item, dy: (Math.random() - 0.5) * g * 0.4, got: false } : null,
      seed: Math.random() * 10,
    });
    // UFO はすきまとすきまの間に出る
    if (Math.random() < ufoRate()) {
      state.ufos.push({ x: W + COL_W + SPACING / 2, y: 120 + Math.random() * (FLOOR - 240), phase: Math.random() * 6, fire: 1 + Math.random(), hp: 1 });
    }
  }

  const colTop = (c) => c.center - c.g / 2 + Math.sin(state.t * 1.6 + c.phase) * c.amp;
  const colBottom = (c) => colTop(c) + c.g;

  const bossMid = (190 + (FLOOR - 70)) / 2;
  const bossAmp = (FLOOR - 70 - 190) / 2;

  function startBoss() {
    const kind = BOSSES[lap() % BOSSES.length];
    const hp = 30 + lap() * 12;
    state.boss = { ...kind, x: W + 120, y: bossMid, hp, max: hp, time: BOSS_SECONDS, fire: 2, phase: 0, leaving: 0, hit: 0, charge: 0, nextCharge: 5 };
    banner(`ボス ${kind.name}！ ${BOSS_SECONDS}秒いないに たおせ`);
  }

  /** ボスの大きさ（たれビームが当たる範囲・ぶつかる範囲） */
  function bossBox(b) {
    if (b.type === "rock") return { w: 52, h: 52 };
    if (b.type === "hole") return { w: 34, h: 34 };
    return { w: 60, h: 34 };
  }

  /** つくねばくだん：画面の敵とたまを ぜんぶ消す */
  function explode() {
    let gain = 0;
    for (const u of state.ufos) {
      if (u.hp > 0 && u.x < W + 20) {
        u.hp = 0;
        gain += 20;
      }
    }
    for (const m of state.meteors) {
      if (m.hp > 0) {
        m.hp = 0;
        gain += 10;
      }
    }
    state.beams = [];
    state.flash = 0.5;
    state.shake = 0.3;
    state.score += gain;
    pop.add(gain ? `どかーん！ +${gain}` : "どかーん！", W / 2, H * 0.4, COLORS.beak, 30);
    const b = state.boss;
    if (b && !b.leaving) {
      b.hp -= 5;
      b.hit = 0.2;
      state.score += 10;
      if (b.hp <= 0) endBoss(true);
    }
  }

  function endBoss(defeated) {
    const b = state.boss;
    if (defeated) {
      const bonus = 150 + 50 * lap();
      state.score += bonus;
      pop.add(`たおした！ +${bonus}`, W / 2, H * 0.35, COLORS.beak, 30);
    } else {
      pop.add("にげられた…", W / 2, H * 0.35, "#fff", 26);
    }
    b.leaving = 1.2;
    state.beams = [];
    state.gun = 0;
  }

  function nextStage() {
    state.stageIndex++;
    state.sinceStage = 0;
    const l = lap();
    banner(`${l > 0 ? `${l + 1}しゅうめ ` : ""}ステージ${(state.stageIndex % STAGES.length) + 1} ${stage().name}`);
  }

  /** 当たった：バリアがあれば助かる */
  function hurt() {
    if (state.safe > 0) return false;
    if (state.shield) {
      state.shield = false;
      state.safe = SAFE_SECONDS;
      state.shake = 0.3;
      pop.add("バリアで セーフ！", X + 40, state.y - 40, COLORS.cyan, 22);
      return false;
    }
    state.over = true;
    state.shake = 0.4;
    pop.add("ごつん！", X, state.y - 40, COLORS.danger, 30);
    return true;
  }

  function takeItem(kind, x, y) {
    if (kind === "skewer") {
      state.score += 30;
      pop.add("+30", x, y - 24, COLORS.beak, 22);
    } else if (kind === "gold") {
      state.score += 100;
      pop.add("金の串！ +100", x, y - 24, COLORS.beak, 24);
    } else if (kind === "bomb") {
      explode();
    } else if (kind === "glide") {
      state.glide = ITEM_SECONDS;
      pop.add("ふわふわ！", x, y - 24, "#fff", 24);
    } else if (kind === "small") {
      state.small = ITEM_SECONDS;
      pop.add("ちいさくなった！", x, y - 24, COLORS.beak, 22);
    } else if (kind === "gun") {
      state.gun = gunSeconds;
      pop.add("たれビーム！", x, y - 24, COLORS.cyan, 24);
    } else if (kind === "bomb") {
    // つくねばくだん：つくねに 導火線
    ctx.fillStyle = "#4e2410";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + 2, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#e9c48a";
    ctx.beginPath();
    ctx.moveTo(x + 6, y - 9);
    ctx.quadraticCurveTo(x + 12, y - 18, x + 6, y - 22);
    ctx.stroke();
    ctx.fillStyle = Math.floor(t * 10) % 2 ? COLORS.beak : COLORS.comb;
    star(ctx, x + 6, y - 23, 6, 2.5);
    ctx.fill();
  } else if (kind === "glide") {
    // ふわふわ羽
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.6 + Math.sin(t * 4) * 0.2);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#c9b3e6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(0, 20);
    ctx.stroke();
    ctx.restore();
  } else if (kind === "small") {
    // しいたけ
    ctx.fillStyle = "#f3e2c7";
    ctx.fillRect(x - 4, y, 8, 12);
    ctx.fillStyle = "#7a4a2a";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 15, 10, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 6);
    ctx.lineTo(x + 6, y - 3);
    ctx.moveTo(x + 6, y - 6);
    ctx.lineTo(x - 6, y - 3);
    ctx.stroke();
  } else if (kind === "shield") {
      state.shield = true;
      pop.add("バリア！", x, y - 24, COLORS.cyan, 24);
    }
  }

  return {
    state,
    get score() {
      return state.score;
    },
    get over() {
      return state.over;
    },
    pointer(type) {
      if (type !== "down" || state.over) return;
      state.flying = true;
      state.vy = FLAP * (state.glide > 0 ? 0.75 : 1);
      state.flap = 0.18;
    },
    update(dt) {
      state.t += dt;
      pop.update(dt);
      state.banner.age += dt;
      state.flap = Math.max(0, state.flap - dt);
      state.shake = Math.max(0, state.shake - dt);
      state.safe = Math.max(0, state.safe - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.glide = Math.max(0, state.glide - dt);
      state.small = Math.max(0, state.small - dt);
      R = state.small > 0 ? SMALL_R : BASE_R;
      if (state.over) {
        // ぶつかったあとは落ちていく
        state.vy += GRAVITY * dt;
        state.y = Math.min(FLOOR, state.y + state.vy * dt);
        return;
      }
      if (!state.flying) {
        state.y = H * 0.42 + Math.sin(state.t * 3) * 8;
        return;
      }

      // とり
      state.vy = Math.min(state.glide > 0 ? 320 : 700, state.vy + GRAVITY * dt * (state.glide > 0 ? 0.5 : 1));
      state.y += state.vy * dt;
      if (state.y < R) {
        state.y = R;
        state.vy = 0;
      }
      if (state.y > FLOOR - R) {
        state.y = FLOOR - R;
        state.vy = FLAP * 0.8;
        if (hurt()) return;
      }

      const sp = state.boss ? 120 : speed();
      const dx = sp * dt;
      state.scroll += dx;

      // たれビーム（たれびん中と、ボス戦のあいだ）
      state.gun = Math.max(0, state.gun - dt);
      state.nextShot -= dt;
      if ((state.gun > 0 || (state.boss && !state.boss.leaving)) && state.nextShot <= 0) {
        state.shots.push({ x: X + 20, y: state.y });
        state.nextShot = SHOT_EVERY;
      }
      for (const s of state.shots) s.x += 520 * dt;

      // すきま
      if (!state.boss) {
        state.nextIn -= dx / SPACING;
        if (state.nextIn <= 0 && state.sinceStage + state.cols.filter((c) => !c.scored).length < PER_STAGE) {
          addColumn();
          state.nextIn += 1;
        }
      }
      for (const c of state.cols) {
        c.x -= dx;
        const top = colTop(c);
        const bottom = colBottom(c);
        if (state.safe <= 0 && (hits(X, state.y, R, c.x - COL_W / 2, -1e4, c.x + COL_W / 2, top) || hits(X, state.y, R, c.x - COL_W / 2, bottom, c.x + COL_W / 2, 1e4))) {
          if (hurt()) return;
        }
        if (c.item && !c.item.got && Math.hypot(X - c.x, state.y - (top + c.g / 2 + c.item.dy)) < R + 16) {
          c.item.got = true;
          takeItem(c.item.kind, c.x, top + c.g / 2 + c.item.dy);
        }
        if (!c.scored && c.x + COL_W / 2 < X - R) {
          c.scored = true;
          state.passed++;
          state.sinceStage++;
          state.score += 10;
          if (state.sinceStage >= PER_STAGE) {
            if (state.stageIndex % STAGES.length === STAGES.length - 1) startBoss();
            else nextStage();
          }
        }
      }
      state.cols = state.cols.filter((c) => c.x > -COL_W);

      // UFO（ゆらゆら飛んで、ときどき たまを撃つ）
      for (const u of state.ufos) {
        u.x -= dx + 30 * dt;
        u.phase += dt * 2;
        u.y += Math.sin(u.phase) * 40 * dt;
        u.fire -= dt;
        if (u.fire <= 0 && u.x < W && u.x > X + 60) {
          const a = Math.atan2(state.y - u.y, X - u.x);
          state.beams.push({ x: u.x, y: u.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170 });
          u.fire = 2.2;
        }
        if (state.safe <= 0 && Math.hypot(u.x - X, u.y - state.y) < R + 16) {
          u.hp = 0;
          if (hurt()) return;
        }
      }

      // 小いん石（りゅうせいぐん）
      const mInterval = state.boss ? 0 : stage().meteor || (lap() > 1 ? 1.6 : 0);
      if (mInterval) {
        state.meteorIn -= dt;
        if (state.meteorIn <= 0) {
          state.meteors.push({ x: W * (0.45 + Math.random() * 0.6), y: -20, vx: -140 - Math.random() * 60, vy: 170 + Math.random() * 60, rot: 0, hp: 1 });
          state.meteorIn = mInterval * (0.6 + Math.random() * 0.8);
        }
      }
      for (const m of state.meteors) {
        m.x += m.vx * dt - dx * 0.3;
        m.y += m.vy * dt;
        m.rot += dt * 3;
        if (state.safe <= 0 && Math.hypot(m.x - X, m.y - state.y) < R + 10) {
          m.hp = 0;
          if (hurt()) return;
        }
      }

      // 敵のたま
      for (const b of state.beams) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (state.safe <= 0 && Math.hypot(b.x - X, b.y - state.y) < R + 6) {
          b.dead = true;
          if (hurt()) return;
        }
      }

      // たれビームが当たったか
      for (const s of state.shots) {
        for (const u of state.ufos) {
          if (u.hp > 0 && Math.hypot(s.x - u.x, s.y - u.y) < 24) {
            u.hp = 0;
            s.dead = true;
            state.score += 20;
            pop.add("+20", u.x, u.y - 20, COLORS.cyan, 20);
          }
        }
        for (const m of state.meteors) {
          if (m.hp > 0 && Math.hypot(s.x - m.x, s.y - m.y) < 18) {
            m.hp = 0;
            s.dead = true;
            state.score += 10;
            pop.add("+10", m.x, m.y - 16, "#fff", 18);
          }
        }
        const b = state.boss;
        if (b && !b.leaving && b.hp > 0 && Math.abs(s.x - b.x) < bossBox(b).w && Math.abs(s.y - b.y) < bossBox(b).h) {
          s.dead = true;
          b.hp--;
          b.hit = 0.08;
          state.score += 2;
          if (b.hp <= 0) endBoss(true);
        }
      }

      // ボス
      const b = state.boss;
      if (b) {
        b.hit = Math.max(0, b.hit - dt);
        if (b.leaving) {
          b.leaving -= dt;
          b.x += 260 * dt;
          b.y -= 120 * dt;
          if (b.leaving <= 0) {
            state.boss = null;
            nextStage();
          }
        } else {
          b.time -= dt;
          if (b.type === "ufo") {
            // はらぺこUFO：上下しながら 3方向に たまを撃つ
            b.x += (W - 80 - b.x) * Math.min(1, dt * 2);
            b.phase += dt * (1.3 + lap() * 0.2);
            b.y = bossMid + Math.sin(b.phase) * bossAmp;
            b.fire -= dt;
            if (b.fire <= 0) {
              for (const a of [-0.35, 0, 0.35]) state.beams.push({ x: b.x - 50, y: b.y, vx: -Math.cos(a) * (190 + lap() * 20), vy: Math.sin(a) * 190 });
              b.fire = Math.max(0.9, 1.8 - lap() * 0.2);
            }
          } else if (b.type === "rock") {
            // ゴロゴロいん石：小さないん石を投げ、ときどき こちらへ 転がってくる（赤く光ったら合図）
            b.phase += dt * 0.9;
            b.y = bossMid + Math.sin(b.phase) * bossAmp * 0.7;
            b.nextCharge -= dt;
            if (b.charge > 0) {
              b.charge -= dt;
              const k = 1 - Math.abs(b.charge - 0.8) / 0.8; // 0 → 1 → 0
              b.x = W - 80 - Math.max(0, k) * (W - 80 - 150);
            } else {
              b.x += (W - 80 - b.x) * Math.min(1, dt * 2);
              if (b.nextCharge <= 0) {
                b.charge = 1.6;
                b.nextCharge = 6 - Math.min(2, lap() * 0.5);
              }
            }
            b.fire -= dt;
            if (b.fire <= 0 && b.charge <= 0) {
              for (let i = 0; i < 3; i++) state.meteors.push({ x: b.x - 40, y: b.y, vx: -180 - Math.random() * 80, vy: (i - 1) * 110 + (Math.random() - 0.5) * 40, rot: 0, hp: 1, thrown: true });
              b.fire = Math.max(1.1, 1.8 - lap() * 0.15);
            }
          } else {
            // ブラックホール：とりを上下に すいよせ、まわりから かけらを 飛ばす
            b.x += (W - 90 - b.x) * Math.min(1, dt * 2);
            b.phase += dt;
            b.y = bossMid + Math.sin(b.phase * 0.6) * bossAmp * 0.5;
            state.vy += Math.sign(b.y - state.y) * (380 + lap() * 40) * dt;
            b.fire -= dt;
            if (b.fire <= 0) {
              const a0 = b.phase * 2;
              for (let i = 0; i < 5; i++) {
                const a = a0 + (i * Math.PI * 2) / 5;
                state.beams.push({ x: b.x + Math.cos(a) * 40, y: b.y + Math.sin(a) * 40, vx: Math.cos(a) * 120 - 90, vy: Math.sin(a) * 120 });
              }
              b.fire = Math.max(0.8, 1.4 - lap() * 0.1);
            }
          }
          const box = bossBox(b);
          if (state.safe <= 0 && Math.abs(X - b.x) < box.w + R && Math.abs(state.y - b.y) < box.h + R) {
            if (hurt()) return;
          }
          if (b.time <= 0) endBoss(false);
        }
      }

      state.shots = state.shots.filter((s) => !s.dead && s.x < W + 20);
      state.beams = state.beams.filter((s) => !s.dead && s.x > -20 && s.y > view.y0 - 20 && s.y < view.y1 + 20);
      state.ufos = state.ufos.filter((u) => u.hp > 0 && u.x > -40);
      state.meteors = state.meteors.filter((m) => m.hp > 0 && m.y < view.y1 + 30 && m.x > -40);
    },
    draw(ctx) {
      drawSpace(ctx, state.t, state.scroll);
      ctx.fillStyle = stage().tint;
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
      drawScenery(ctx, state.stageIndex % STAGES.length, state.scroll, state.t);

      ctx.save();
      if (state.shake > 0) ctx.translate(Math.sin(state.t * 90) * 4, 0);
      for (const c of state.cols) {
        const top = colTop(c);
        drawRocks(ctx, c.x, view.y0 - 10, top, c.seed);
        drawRocks(ctx, c.x, top + c.g, view.y1 + 10, c.seed + 3);
        if (c.item && !c.item.got) drawItem(ctx, c.item.kind, c.x, top + c.g / 2 + c.item.dy + Math.sin(state.t * 4 + c.seed) * 4, state.t);
      }
      for (const m of state.meteors) drawSmallMeteor(ctx, m);
      for (const u of state.ufos) drawUfo(ctx, u.x, u.y, 1, state.t, 0);
      if (state.boss) drawBoss(ctx, state.boss, state.t);
      ctx.fillStyle = "#b4541c";
      for (const s of state.shots) {
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const b of state.beams) {
        ctx.fillStyle = "rgba(255,120,200,0.35)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff8fd0";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 地面（光の帯）
      ctx.fillStyle = "rgba(128,247,253,0.18)";
      ctx.fillRect(view.x0, FLOOR, view.x1 - view.x0, 4);

      // とり（当たったあとの無敵中は点滅。バリアはまわりを回るハート）
      const tilt = state.flying ? Math.max(-0.5, Math.min(0.9, state.vy / 700)) : 0;
      ctx.save();
      if (state.safe > 0) ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(state.t * 20));
      drawMascot(ctx, X, state.y, R + 5, costume, { t: state.t, tilt });
      if (state.glide > 0) {
        // ふわふわ羽：まわりに羽が舞う
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (let i = 0; i < 3; i++) {
          const a = state.t * 2 + i * 2.1;
          ctx.beginPath();
          ctx.ellipse(X - 20 + Math.cos(a) * 26, state.y + Math.sin(a) * 18, 7, 3, a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      if (state.shield) {
        for (let i = 0; i < 3; i++) {
          const a = state.t * 3 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = COLORS.pink400;
          heart(ctx, X + Math.cos(a) * 34, state.y + Math.sin(a) * 34 + 4, 14);
          ctx.fill();
        }
      }
      if (state.flap > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${state.flap * 4})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(X - 6, state.y + 4, R + 14, Math.PI * 0.6, Math.PI * 1.1);
        ctx.stroke();
      }
      ctx.restore();

      pop.draw(ctx);
      drawHud(ctx, `${state.score.toLocaleString()}点`, `${state.passed}こ`);

      // 状態：たれビームの残り・ボスの体力と残り時間
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(`${lap() > 0 ? `${lap() + 1}しゅうめ ` : ""}${stage().name}`, 14, 46);
      if (!state.boss) {
        let by = 70;
        for (const [v, max, color, label] of [
          [state.gun, gunSeconds, "#b4541c", "たれビーム"],
          [state.glide, ITEM_SECONDS, "#c9b3e6", "ふわふわ"],
          [state.small, ITEM_SECONDS, COLORS.beak, "しいたけ"],
        ]) {
          if (v <= 0) continue;
          bar(ctx, 14, by, 120, v / max, color, label);
          by += 24;
        }
      }
      const b = state.boss;
      if (b && !b.leaving) {
        bar(ctx, 14, 70, W - 28, b.hp / b.max, COLORS.danger, b.name);
        bar(ctx, 14, 98, W - 28, Math.max(0, b.time) / BOSS_SECONDS, b.time < 5 ? COLORS.beak : COLORS.cyan, b.time < 5 ? "にげそう！" : "のこり時間");
      }

      if (state.flash > 0) {
        ctx.fillStyle = `rgba(255,240,200,${state.flash})`;
        ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
      }
      if (state.banner.age < 2.2) {
        const a = Math.min(1, (2.2 - state.banner.age) * 2);
        ctx.globalAlpha = a;
        ctx.fillStyle = "rgba(42,31,92,0.7)";
        ctx.fillRect(view.x0, H * 0.24 - 26, view.x1 - view.x0, 52);
        ctx.font = `900 22px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(state.banner.text, W / 2, H * 0.24, W - 20);
        ctx.globalAlpha = 1;
      }
      if (!state.flying && !state.over) {
        ctx.font = `900 24px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 4;
        ctx.strokeStyle = COLORS.space900;
        ctx.fillStyle = "#fff";
        ctx.strokeText("タップで はばたく", W / 2, H * 0.62);
        ctx.fillText("タップで はばたく", W / 2, H * 0.62);
      }
    },
  };
}

/** 円（cx, cy, r）と長方形（x0, y0, x1, y1）が重なっているか */
function hits(cx, cy, r, x0, y0, x1, y1) {
  const nx = Math.max(x0, Math.min(cx, x1));
  const ny = Math.max(y0, Math.min(cy, y1));
  return Math.hypot(cx - nx, cy - ny) < r;
}

function bar(ctx, x, y, w, ratio, color, label) {
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, 18, 9);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w * ratio), 18, 9);
  ctx.fill();
  ctx.font = `900 12px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x + 8, y + 9.5);
}

/** ステージごとの遠くの景色 */
function drawScenery(ctx, i, scroll, t) {
  const px = (v, speed) => ((((v - scroll * speed) % (W + 300)) + W + 300) % (W + 300)) - 150;
  if (i === 1) {
    // 大きな月
    const x = px(W * 0.75, 0.05);
    ctx.fillStyle = "rgba(241,234,250,0.9)";
    ctx.beginPath();
    ctx.arc(x, 150, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(201,179,230,0.7)";
    for (const [dx, dy, r] of [[-20, -15, 12], [22, 18, 16], [-8, 30, 8]]) {
      ctx.beginPath();
      ctx.arc(x + dx, 150 + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (i === 2) {
    // ほしくずの雲
    for (let k = 0; k < 3; k++) {
      const x = px(k * 170 + 60, 0.08);
      const g = ctx.createRadialGradient(x, 140 + k * 150, 0, x, 140 + k * 150, 120);
      g.addColorStop(0, k % 2 ? "rgba(128,247,253,0.22)" : "rgba(244,176,213,0.25)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 120, 20 + k * 150, 240, 240);
    }
  } else if (i === 3) {
    // 遠くの流れ星
    ctx.strokeStyle = "rgba(255,200,150,0.35)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const x = px(k * 90 + ((t * 120) % 90), 0.2);
      const y = ((k * 113 + t * 160) % (H + 100)) - 50;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 40, y - 30);
      ctx.stroke();
    }
  } else {
    // 夕焼けの雲
    ctx.fillStyle = "rgba(244,176,213,0.18)";
    for (let k = 0; k < 4; k++) {
      const x = px(k * 140, 0.1);
      ctx.beginPath();
      ctx.ellipse(x, 520 + (k % 2) * 40, 90, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawItem(ctx, kind, x, y, t) {
  if (kind === "skewer") {
    drawSkewer(ctx, x, y, -Math.PI / 2, ["tare", "negi", "tare"], 0.85);
  } else if (kind === "gold") {
    ctx.fillStyle = "rgba(255,216,74,0.35)";
    ctx.beginPath();
    ctx.arc(x, y, 22 + Math.sin(t * 6) * 3, 0, Math.PI * 2);
    ctx.fill();
    drawSkewer(ctx, x, y, -Math.PI / 2, ["gold", "gold", "gold"], 0.9);
  } else if (kind === "gun") {
    // たれびん
    ctx.fillStyle = "#7d3510";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 10, y - 12, 20, 26, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 5, y - 18, 10, 7);
    ctx.font = `900 10px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("たれ", x, y + 2);
  } else if (kind === "shield") {
    ctx.fillStyle = COLORS.pink400;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    heart(ctx, x, y + 4, 26 + Math.sin(t * 6) * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawSmallMeteor(ctx, m) {
  ctx.strokeStyle = "rgba(255,160,90,0.5)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(m.x - m.vx * 0.18, m.y - m.vy * 0.18);
  ctx.stroke();
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.rot);
  ctx.fillStyle = "#6d6577";
  ctx.strokeStyle = "#3b3445";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = 9 + (i % 2 ? 2 : -1);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** ボスの絵（種類ごと） */
function drawBoss(ctx, b, t) {
  if (b.type === "ufo") return drawUfo(ctx, b.x, b.y, 2.4, t, b.hit, true);
  if (b.type === "rock") {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(t * (b.charge > 0 ? 6 : 0.8));
    ctx.fillStyle = b.hit > 0 ? "#fff" : b.charge > 0 || b.nextCharge < 0.8 ? "#a35a5a" : "#6d6577";
    ctx.strokeStyle = "#3b3445";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const rr = 52 + (i % 3) * 5 - 4;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#4f4759";
    for (const [dx, dy, rr] of [[-18, -10, 10], [16, 14, 8], [10, -22, 6]]) {
      ctx.beginPath();
      ctx.arc(dx, dy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // ごろごろした顔（回らない）
    ctx.fillStyle = COLORS.space900;
    ctx.beginPath();
    ctx.arc(b.x - 14, b.y - 6, 4, 0, Math.PI * 2);
    ctx.arc(b.x + 8, b.y - 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.space900;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x - 3, b.y + 10, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();
    return;
  }
  // ブラックホール：うずまき
  for (let i = 5; i >= 0; i--) {
    ctx.fillStyle = i === 0 ? "#000" : `rgba(${120 + i * 20},${60 + i * 15},${200 - i * 10},${0.18 + (5 - i) * 0.05})`;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 16 + i * 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = b.hit > 0 ? "#fff" : "rgba(244,176,213,0.8)";
  ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2.2; a += 0.15) {
      const rr = 18 + a * 9;
      const ang = a + t * 2 + (k * Math.PI * 2) / 3;
      ctx.lineTo(b.x + Math.cos(ang) * rr, b.y + Math.sin(ang) * rr);
    }
    ctx.stroke();
  }
}

/** UFO（boss のときは大きく、おなかをすかせた顔） */
function drawUfo(ctx, x, y, s, t, hit, boss = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // ドーム
  ctx.fillStyle = hit > 0 ? "#fff" : "rgba(128,247,253,0.8)";
  ctx.beginPath();
  ctx.ellipse(0, -6, 12, 11, 0, Math.PI, 0);
  ctx.fill();
  // 円盤
  ctx.fillStyle = hit > 0 ? "#fff" : boss ? COLORS.magenta : "#9374ab";
  ctx.strokeStyle = COLORS.space900;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // ライト
  for (let i = -2; i <= 2; i++) {
    ctx.fillStyle = Math.floor(t * 6 + i) % 2 ? COLORS.beak : "#fff";
    ctx.beginPath();
    ctx.arc(i * 8, 1, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (boss) {
    // はらぺこの顔
    ctx.fillStyle = COLORS.space900;
    ctx.beginPath();
    ctx.arc(-4, -8, 1.6, 0, Math.PI * 2);
    ctx.arc(4, -8, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.danger;
    ctx.beginPath();
    ctx.ellipse(0, -3.5, 3.5, 2 + Math.abs(Math.sin(t * 6)) * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    star(ctx, 14, -12, 3, 1.3);
    ctx.fill();
  }
  ctx.restore();
}

/** いん石を積んだ柱（x は中心、y0〜y1 の範囲） */
function drawRocks(ctx, x, y0, y1, seed) {
  if (y1 - y0 < 4) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - COL_W / 2 - 6, y0, COL_W + 12, y1 - y0);
  ctx.clip();
  const g = ctx.createLinearGradient(x - COL_W / 2, 0, x + COL_W / 2, 0);
  g.addColorStop(0, "#5d5470");
  g.addColorStop(1, "#7c7290");
  ctx.fillStyle = g;
  ctx.strokeStyle = "#3b3445";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - COL_W / 2, y0, COL_W, y1 - y0, 14);
  ctx.fill();
  ctx.stroke();
  // くぼみ
  ctx.fillStyle = "rgba(42,31,92,0.35)";
  for (let yy = y0 + 18; yy < y1 - 8; yy += 34) {
    const k = Math.sin(yy * 0.13 + seed) * 0.5 + 0.5;
    ctx.beginPath();
    ctx.arc(x - 12 + k * 24, yy, 5 + k * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // すきま側のふち（光る）
  ctx.strokeStyle = "rgba(255,140,80,0.7)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  const edge = y0 < 0 ? y1 : y0;
  ctx.moveTo(x - COL_W / 2 + 4, edge);
  ctx.lineTo(x + COL_W / 2 - 4, edge);
  ctx.stroke();
}
