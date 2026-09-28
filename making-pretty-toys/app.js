const SVG_NS = "http://www.w3.org/2000/svg";
const EVOLUTION_RATE = 2;
const palette = ["#ee7455", "#f0b84c", "#8bbf74", "#52a7a0", "#6c78b7", "#bb72a5"];
const shapePaths = {
  orb: { roundness: 1, spikes: 0, opacity: [0.62, 0.86] },
  capsule: { roundness: 0.8, spikes: 0, opacity: [0.72, 0.91] },
  petal: { roundness: 0.62, spikes: 0.1, opacity: [0.58, 0.84] },
  spike: { roundness: 0.12, spikes: 1, opacity: [0.78, 0.96] },
  ring: { roundness: 0.9, spikes: 0, opacity: [0.55, 0.8] }
};
const motionProfiles = {
  orb: { radial: 0.7, lag: 0.45, turn: 3, squish: 0.055, tempo: 0.82 },
  capsule: { radial: 0.45, lag: 0.7, turn: 9, squish: 0.025, tempo: 0.72 },
  petal: { radial: 0.9, lag: 0.82, turn: 12, squish: 0.04, tempo: 1.08 },
  spike: { radial: 0.34, lag: 1.12, turn: 7, squish: 0.018, tempo: 1.28 },
  ring: { radial: 1.05, lag: 0.92, turn: 6, squish: 0.075, tempo: 0.58 }
};
const canvasOutlines = new Map();

const builder = document.querySelector("#builder");
const builderParts = document.querySelector("#builder-parts");
const nurseryNote = document.querySelector("#nursery-note");
const releaseButton = document.querySelector("#release-button");
const clearButton = document.querySelector("#clear-button");
const dish = document.querySelector("#dish");
const context = dish.getContext("2d");
const emptyDish = document.querySelector("#empty-dish");
const populationLabel = document.querySelector("#population");

let selectedShape = "orb";
let selectedColor = palette[0];
let draft = [];
let draftColorBias;
let organisms = [];
let fragments = [];
let ripples = [];
let nextId = 1;
let lastTime = performance.now();
let habitatAge = 0;
let seededState = 0x2f6e2b1;

function random() {
  seededState = (seededState * 1664525 + 1013904223) >>> 0;
  return seededState / 4294967296;
}

function choose(items) { return items[Math.floor(random() * items.length)]; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function spread(amount) { return (random() + random() - 1) * amount; }
function point(x, y, variation = 2.5) {
  return { x: x + spread(variation), y: y + spread(variation) };
}

function curvedLoop(points, tension = 0.85) {
  const format = value => Number(value.toFixed(1));
  let path = `M${format(points[0].x)} ${format(points[0].y)}`;
  for (let index = 0; index < points.length; index++) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const after = points[(index + 2) % points.length];
    const first = pointOnCurve(current, next, previous, tension);
    const second = pointOnCurve(next, current, after, tension);
    path += ` C${format(first.x)} ${format(first.y)} ${format(second.x)} ${format(second.y)} ${format(next.x)} ${format(next.y)}`;
  }
  return `${path} Z`;
}

function pointOnCurve(anchor, neighbor, opposite, tension) {
  return {
    x: anchor.x + (neighbor.x - opposite.x) * tension / 6,
    y: anchor.y + (neighbor.y - opposite.y) * tension / 6
  };
}

function radialLoop(count, radius, irregularity, offsetX = 0, offsetY = 0) {
  const phase = random() * 0.3;
  return Array.from({ length: count }, (_, index) => {
    const angle = index * Math.PI * 2 / count + phase + spread(0.09);
    const distance = radius + spread(irregularity);
    return { x: offsetX + Math.cos(angle) * distance, y: offsetY + Math.sin(angle) * distance };
  });
}

function makeOutline(shape) {
  const width = 0.78 + random() * 0.44;
  const height = 0.8 + random() * 0.4;
  const shear = (random() - 0.5) * 0.28;
  const bend = (random() - 0.5) * 0.18;
  const loop = (points, tension) => curvedLoop(points.map(part => ({
    x: part.x * width + part.y * shear,
    y: part.y * height + part.x * bend
  })), tension);

  if (shape === "orb") return loop(radialLoop(9, 23, 10, spread(3), spread(3)));
  if (shape === "capsule") return loop([
    point(-27, -8), point(-15, -14), point(5, -11), point(24, -5),
    point(29, 5), point(12, 13), point(-8, 11), point(-28, 4)
  ]);
  if (shape === "petal") return loop([
    point(-4, -30, 2), point(8, -24), point(18, -9), point(22, 9), point(12, 24),
    point(-2, 31, 2), point(-16, 20), point(-20, 2), point(-13, -15)
  ], 0.75);
  if (shape === "spike") return loop([
    point(-18, 18), point(-23, 7), point(-13, -4), point(-24, -19, 1.5),
    point(-3, -11), point(0, -8),
    point(12, -20), point(17, -32, 1.5), point(22, -23), point(20, -8),
    point(13, 2), point(30, -3), point(30, 7), point(16, 12),
    point(24, 26, 1.5), point(7, 19), point(8, 24), point(-5, 27)
  ], 0.62);
  const outer = loop(radialLoop(10, 25, 6, spread(2), spread(2)));
  const inner = loop(radialLoop(9, 12, 3, spread(4), spread(4)));
  return `${outer} ${inner}`;
}

function createColorBias() {
  return { hue: spread(4), lightness: spread(0.025), chroma: spread(0.08) };
}

function hexToOklch(hex) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const lRoot = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mRoot = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sRoot = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const labB = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const hue = (Math.atan2(labB, a) * 180 / Math.PI + 360) % 360;
  return { lightness, chroma: Math.hypot(a, labB), hue };
}

function oklchToHex({ lightness, chroma, hue }) {
  const angle = hue * Math.PI / 180;
  const a = chroma * Math.cos(angle);
  const labB = chroma * Math.sin(angle);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * labB;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * labB;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * labB;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  const channels = linear.map(value => {
    const gamma = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.round(clamp(gamma, 0, 1) * 255).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function sampleAppearance(color, shape, bias = draftColorBias) {
  const center = hexToOklch(color);
  const pigment = {
    hue: (center.hue + bias.hue + spread(10) + 360) % 360,
    lightness: clamp(center.lightness + bias.lightness + spread(0.07), 0.38, 0.88),
    chroma: clamp(center.chroma * (1 + bias.chroma + spread(0.12)), 0.04, 0.24)
  };
  const [minimum, maximum] = shapePaths[shape].opacity;
  return {
    color: oklchToHex(pigment),
    pigment,
    opacity: minimum + (maximum - minimum) * Math.sqrt(random()),
    fadeOffset: spread(0.07),
    breathPhase: random() * Math.PI * 2
  };
}

function ensureAppearance(part) {
  return {
    ...part,
    outline: part.outline || makeOutline(part.shape),
    pigment: part.pigment || hexToOklch(part.color),
    opacity: part.opacity ?? 0.86,
    fadeOffset: part.fadeOffset ?? 0,
    breathPhase: part.breathPhase ?? 0
  };
}

draftColorBias = createColorBias();

function createPalette() {
  const paletteElement = document.querySelector("#palette");
  palette.forEach((color, index) => {
    const button = document.createElement("button");
    button.className = `color-choice${index === 0 ? " selected" : ""}`;
    button.type = "button";
    button.style.setProperty("--swatch", color);
    button.setAttribute("aria-label", `Choose color ${index + 1}`);
    button.addEventListener("click", () => {
      selectedColor = color;
      document.querySelectorAll(".color-choice").forEach(item => item.classList.toggle("selected", item === button));
    });
    paletteElement.append(button);
  });
}

document.querySelectorAll(".part-choice").forEach((button, index) => {
  if (index === 0) button.classList.add("selected");
  const icon = button.querySelector("svg");
  icon.setAttribute("viewBox", "-43 -43 86 86");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", makeOutline(button.dataset.shape));
  path.setAttribute("fill-rule", "evenodd");
  icon.replaceChildren(path);
  button.addEventListener("click", () => {
    selectedShape = button.dataset.shape;
    document.querySelectorAll(".part-choice").forEach(item => item.classList.toggle("selected", item === button));
  });
});

function makeSvgPart(part) {
  const element = document.createElementNS(SVG_NS, "path");
  element.setAttribute("d", part.outline);
  element.classList.add("builder-part");
  element.setAttribute("fill", part.color);
  element.setAttribute("fill-rule", "evenodd");
  element.setAttribute("opacity", part.opacity);
  element.setAttribute("transform", `translate(${part.x} ${part.y}) rotate(${part.rotation}) scale(${part.scale})`);
  return element;
}

function renderDraft() {
  builderParts.replaceChildren(...draft.map(makeSvgPart));
  nurseryNote.hidden = draft.length > 0;
  releaseButton.disabled = draft.length < 2;
}

builder.addEventListener("click", event => {
  if (draft.length >= 8) {
    nurseryNote.hidden = false;
    nurseryNote.textContent = "That one feels complete.";
    setTimeout(() => { nurseryNote.hidden = draft.length > 0; }, 900);
    return;
  }
  const point = builder.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(builder.getScreenCTM().inverse());
  const dx = local.x - 150;
  const dy = local.y - 150;
  const distance = Math.hypot(dx, dy);
  const limit = 78;
  const ratio = distance > limit ? limit / distance : 1;
  draft.push({
    shape: selectedShape,
    outline: makeOutline(selectedShape),
    ...sampleAppearance(selectedColor, selectedShape),
    x: 150 + dx * ratio,
    y: 150 + dy * ratio,
    rotation: Math.round(random() * 12) * 30,
    scale: 0.78 + random() * 0.48
  });
  renderDraft();
});

clearButton.addEventListener("click", () => {
  draft = [];
  draftColorBias = createColorBias();
  nurseryNote.textContent = "Choose a shape below, then place it here.";
  renderDraft();
});

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / d + 2) / 6;
    else hue = ((r - g) / d + 4) / 6;
  }
  return { hue, light };
}

function temperament(parts) {
  let warmth = 0;
  let roundness = 0;
  let spikes = 0;
  let spread = 0;
  for (const part of parts) {
    const hsl = hexToHsl(part.color);
    const warmDistance = Math.min(Math.abs(hsl.hue - 0.07), 1 - Math.abs(hsl.hue - 0.07));
    warmth += 1 - warmDistance * 2;
    roundness += shapePaths[part.shape].roundness;
    spikes += shapePaths[part.shape].spikes;
    spread += Math.hypot(part.x - 150, part.y - 150);
  }
  const count = parts.length;
  return {
    motility: clamp(0.35 + warmth / count * 0.75 + spread / count / 150, 0.3, 1.5),
    cohesion: clamp(1.15 - spread / count / 100 + roundness / count * 0.3, 0.35, 1.25),
    affinity: clamp(0.25 + roundness / count * 0.7, 0.2, 1),
    aggression: clamp(0.05 + spikes / count * 1.5, 0.05, 1),
    fertility: clamp(0.45 + count / 14 + roundness / count * 0.2, 0.35, 1.1)
  };
}

function normalizeParts(parts) {
  const center = parts.reduce((acc, part) => ({ x: acc.x + part.x, y: acc.y + part.y }), { x: 0, y: 0 });
  center.x /= parts.length;
  center.y /= parts.length;
  return parts.map(part => ({ ...part, x: part.x - center.x, y: part.y - center.y }));
}

function createOrganism(sourceParts, x, y, generation = 0) {
  const parts = sourceParts.map(part => ({
    ...ensureAppearance(part),
    x: part.x > 100 ? part.x - 150 : part.x,
    y: part.y > 100 ? part.y - 150 : part.y
  }));
  const traits = temperament(sourceParts.map(part => ({ ...part, x: part.x > 100 ? part.x : part.x + 150, y: part.y > 100 ? part.y : part.y + 150 })));
  const angle = random() * Math.PI * 2;
  return {
    id: nextId++, parts, traits, x, y,
    vx: Math.cos(angle) * traits.motility * 12,
    vy: Math.sin(angle) * traits.motility * 12,
    rotation: random() * Math.PI * 2,
    spin: (random() - 0.5) * (0.35 + (1 - traits.cohesion) * 0.5),
    age: 0,
    lifespan: 65 + random() * 65,
    energy: 0.35 + random() * 0.25,
    scale: 0.54,
    targetScale: 0.6 + random() * 0.17,
    pulse: random() * Math.PI * 2,
    generation,
    contact: new Map(),
    cooldown: 5 + random() * 8
  };
}

releaseButton.addEventListener("click", () => {
  const bounds = dish.getBoundingClientRect();
  const creature = createOrganism(normalizeParts(draft), bounds.width * (0.25 + random() * 0.5), bounds.height * (0.25 + random() * 0.5));
  organisms.push(creature);
  emptyDish.classList.add("hidden");
  draft = [];
  draftColorBias = createColorBias();
  renderDraft();
  updatePopulationLabel();
});

function resizeDish() {
  const rect = dish.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (dish.width !== width || dish.height !== height) {
    dish.width = width;
    dish.height = height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  return { width: rect.width, height: rect.height };
}

function drawPart(ctx, part, opacity = 1, color = part.color) {
  ctx.save();
  ctx.translate(part.x, part.y);
  ctx.rotate((part.rotation || 0) * Math.PI / 180);
  const scale = part.scale || 1;
  ctx.scale(scale * (part.scaleX || 1), scale * (part.scaleY || 1));
  ctx.globalAlpha *= opacity * (part.opacity ?? 1);
  ctx.fillStyle = color;
  let path = canvasOutlines.get(part.outline);
  if (!path) {
    path = new Path2D(part.outline);
    if (canvasOutlines.size >= 512) canvasOutlines.delete(canvasOutlines.keys().next().value);
    canvasOutlines.set(part.outline, path);
  }
  ctx.fill(path, "evenodd");
  ctx.restore();
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function partVitality(creature, part) {
  const progress = creature.age / creature.lifespan;
  if (progress < 0.08) return 0.72 + progress / 0.08 * 0.28;
  const declineStart = 0.62 + part.fadeOffset;
  if (progress <= declineStart) return 1;
  const decline = clamp((progress - declineStart) / (1 - declineStart), 0, 1);
  return 1 - smoothstep(decline) * 0.88;
}

function livingColor(creature, part) {
  const pigment = part.pigment || hexToOklch(part.color);
  const progress = creature.age / creature.lifespan;
  const oldAge = smoothstep(clamp((progress - 0.62) / 0.38, 0, 1));
  const breathing = Math.sin(creature.pulse * 0.72 + part.breathPhase) * 0.012;
  return oklchToHex({
    ...pigment,
    lightness: clamp(pigment.lightness + breathing, 0.2, 0.95),
    chroma: pigment.chroma * (1 - oldAge * 0.16)
  });
}

function animatedPart(creature, part) {
  const profile = motionProfiles[part.shape];
  const pigment = part.pigment || hexToOklch(part.color);
  const warmDistance = Math.min(Math.abs(pigment.hue - 35), 360 - Math.abs(pigment.hue - 35));
  const warmth = 1 - clamp(warmDistance / 145, 0, 1);
  const looseness = 1 - (part.opacity ?? 0.86);
  const tempo = profile.tempo * (0.72 + warmth * 0.62);
  const phase = creature.pulse * tempo + part.breathPhase;
  const radialWave = Math.sin(phase);
  const articulatedWave = Math.sin(phase * 0.73 + Math.cos(phase * 0.31));
  const restDistance = Math.hypot(part.x, part.y);
  const fallbackAngle = part.breathPhase;
  const radialX = restDistance > 1 ? part.x / restDistance : Math.cos(fallbackAngle);
  const radialY = restDistance > 1 ? part.y / restDistance : Math.sin(fallbackAngle);
  const coolAmplitude = 1.05 + (1 - warmth) * 0.42;
  const radialAmount = profile.radial * coolAmplitude * (2.2 + looseness * 7) * radialWave;
  const cos = Math.cos(creature.rotation);
  const sin = Math.sin(creature.rotation);
  const localVelocityX = cos * creature.vx + sin * creature.vy;
  const localVelocityY = -sin * creature.vx + cos * creature.vy;
  const lagAmount = profile.lag * (0.025 + looseness * 0.12);
  const squish = articulatedWave * profile.squish * (0.65 + looseness * 1.8);

  return {
    ...part,
    x: part.x + radialX * radialAmount - localVelocityX * lagAmount,
    y: part.y + radialY * radialAmount - localVelocityY * lagAmount,
    rotation: part.rotation + articulatedWave * profile.turn * (0.75 + looseness * 1.7),
    scaleX: 1 + squish,
    scaleY: 1 - squish
  };
}

function drawOrganism(creature) {
  const pulse = 1 + Math.sin(creature.pulse) * (0.025 + (1 - creature.traits.cohesion) * 0.035);
  context.save();
  context.translate(creature.x, creature.y);
  context.rotate(creature.rotation);
  context.scale(creature.scale * pulse, creature.scale / pulse);
  context.shadowColor = "rgba(35, 62, 44, .14)";
  context.shadowBlur = 8;
  context.shadowOffsetY = 3;
  for (const part of creature.parts) {
    drawPart(context, animatedPart(creature, part), partVitality(creature, part), livingColor(creature, part));
  }
  context.restore();
}

function shed(creature, part) {
  const cos = Math.cos(creature.rotation);
  const sin = Math.sin(creature.rotation);
  fragments.push({
    ...part,
    x: creature.x + (part.x * cos - part.y * sin) * creature.scale,
    y: creature.y + (part.x * sin + part.y * cos) * creature.scale,
    vx: creature.vx * 0.3 + (random() - 0.5) * 14,
    vy: creature.vy * 0.3 + (random() - 0.5) * 14,
    age: 0,
    lifespan: 28 + random() * 30,
    rotation: (part.rotation || 0) + random() * 90
  });
}

function die(creature) {
  creature.parts.forEach(part => shed(creature, part));
}

function bud(parent) {
  if (organisms.length >= 38 || parent.parts.length < 2) return;
  const inherited = parent.parts.map(part => ({ ...part }));
  if (random() < 0.65) {
    const index = Math.floor(random() * inherited.length);
    const mutation = sampleAppearance(choose(palette), inherited[index].shape, createColorBias());
    inherited[index].color = mutation.color;
    inherited[index].pigment = mutation.pigment;
    inherited[index].rotation += (random() - 0.5) * 45;
  }
  if (random() < 0.22 && inherited.length > 2) inherited.splice(Math.floor(random() * inherited.length), 1);
  const offset = 34;
  const child = createOrganism(inherited, parent.x + (random() - 0.5) * offset, parent.y + (random() - 0.5) * offset, parent.generation + 1);
  child.scale = 0.2;
  child.energy = 0.15;
  organisms.push(child);
  parent.energy *= 0.42;
  parent.cooldown = 12;
}

function exchange(a, b) {
  if (!a.parts.length || !b.parts.length) return;
  const aIndex = Math.floor(random() * a.parts.length);
  const bIndex = Math.floor(random() * b.parts.length);
  const aPart = { ...a.parts[aIndex] };
  a.parts[aIndex] = { ...b.parts[bIndex], x: aPart.x, y: aPart.y };
  b.parts[bIndex] = { ...aPart, x: b.parts[bIndex].x, y: b.parts[bIndex].y };
  a.traits = temperament(a.parts.map(part => ({ ...part, x: part.x + 150, y: part.y + 150 })));
  b.traits = temperament(b.parts.map(part => ({ ...part, x: part.x + 150, y: part.y + 150 })));
  a.cooldown = b.cooldown = 10;
  a.energy += 0.08;
  b.energy += 0.08;
}

function updateOrganisms(dt, size) {
  const evolutionDt = dt * EVOLUTION_RATE;
  for (const creature of organisms) {
    creature.age += evolutionDt;
    creature.cooldown -= evolutionDt;
    creature.pulse += dt * (1.8 + creature.traits.motility);
    creature.rotation += creature.spin * dt;
    creature.scale += (creature.targetScale - creature.scale) * evolutionDt * 0.5;
    creature.energy += evolutionDt * (0.004 + creature.traits.fertility * 0.004);
    const wander = 0.8 + creature.traits.motility * 1.5;
    creature.vx += Math.cos(creature.pulse * 0.37 + creature.id) * wander * dt;
    creature.vy += Math.sin(creature.pulse * 0.31 + creature.id * 2) * wander * dt;
    const speed = Math.hypot(creature.vx, creature.vy);
    const maxSpeed = 11 + creature.traits.motility * 23;
    if (speed > maxSpeed) { creature.vx *= maxSpeed / speed; creature.vy *= maxSpeed / speed; }
    creature.x += creature.vx * dt;
    creature.y += creature.vy * dt;
    const radius = 30 * creature.scale;
    if (creature.x < radius || creature.x > size.width - radius) {
      creature.vx *= -0.82;
      creature.x = clamp(creature.x, radius, size.width - radius);
    }
    if (creature.y < radius || creature.y > size.height - radius) {
      creature.vy *= -0.82;
      creature.y = clamp(creature.y, radius, size.height - radius);
    }

    for (const ripple of ripples) {
      const dx = creature.x - ripple.x;
      const dy = creature.y - ripple.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < ripple.radius + 55 && distance > ripple.radius - 55) {
        const force = (1 - Math.abs(distance - ripple.radius) / 55) * 34;
        creature.vx += dx / distance * force * dt;
        creature.vy += dy / distance * force * dt;
      }
    }

    for (const fragment of fragments) {
      const distance = Math.hypot(creature.x - fragment.x, creature.y - fragment.y);
      if (distance < 27 && creature.parts.length < 9 && random() < evolutionDt * (0.08 + creature.traits.affinity * 0.18)) {
        creature.parts.push({ ...fragment, x: (random() - 0.5) * 75, y: (random() - 0.5) * 75, scale: fragment.scale || 0.8 });
        fragment.lifespan = 0;
        creature.energy += 0.12;
      }
    }

    if (creature.energy > 1 && creature.age > 12 && creature.cooldown <= 0 && random() < evolutionDt * 0.17) bud(creature);
  }

  for (let i = 0; i < organisms.length; i++) {
    for (let j = i + 1; j < organisms.length; j++) {
      const a = organisms[i];
      const b = organisms[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 1;
      const touchDistance = 28 + 18 * (a.scale + b.scale);
      if (distance < touchDistance) {
        const stickiness = (a.traits.aggression + b.traits.aggression) * 0.5;
        const push = (touchDistance - distance) * (1.2 - stickiness * 0.8);
        a.vx -= dx / distance * push * dt;
        a.vy -= dy / distance * push * dt;
        b.vx += dx / distance * push * dt;
        b.vy += dy / distance * push * dt;
        const contactTime = (a.contact.get(b.id) || 0) + evolutionDt;
        a.contact.set(b.id, contactTime);
        if (contactTime > 2.4 + (1 - stickiness) * 3 && a.cooldown <= 0 && b.cooldown <= 0) {
          exchange(a, b);
          a.contact.set(b.id, 0);
        }
      } else {
        a.contact.delete(b.id);
      }
    }
  }

  const survivors = [];
  for (const creature of organisms) {
    if (creature.age > creature.lifespan) die(creature);
    else survivors.push(creature);
  }
  if (survivors.length !== organisms.length) updatePopulationLabel(survivors.length);
  organisms = survivors;
}

function updateFragments(dt, size) {
  fragments.forEach(fragment => {
    fragment.age += dt * EVOLUTION_RATE;
    fragment.x += fragment.vx * dt;
    fragment.y += fragment.vy * dt;
    fragment.vx *= Math.pow(0.985, dt * 60);
    fragment.vy *= Math.pow(0.985, dt * 60);
    fragment.rotation += dt * 7;
    if (fragment.x < 0 || fragment.x > size.width) fragment.vx *= -1;
    if (fragment.y < 0 || fragment.y > size.height) fragment.vy *= -1;
  });
  fragments = fragments.filter(fragment => fragment.age < fragment.lifespan);
}

function drawBackground(size) {
  context.clearRect(0, 0, size.width, size.height);
  context.save();
  context.globalAlpha = 0.16;
  context.fillStyle = "#6fa284";
  for (let i = 0; i < 22; i++) {
    const x = ((i * 97.31) % size.width + Math.sin(habitatAge * 0.03 + i) * 8);
    const y = ((i * 173.17) % size.height + Math.cos(habitatAge * 0.025 + i) * 7);
    context.beginPath();
    context.arc(x, y, 1.2 + (i % 3), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function updateRipples(dt) {
  ripples.forEach(ripple => { ripple.age += dt; ripple.radius += dt * 95; });
  ripples = ripples.filter(ripple => ripple.age < 2.4);
}

function drawRipples() {
  context.save();
  for (const ripple of ripples) {
    context.globalAlpha = (1 - ripple.age / 2.4) * 0.24;
    context.strokeStyle = "#315f49";
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

dish.addEventListener("pointerdown", event => {
  const bounds = dish.getBoundingClientRect();
  ripples.push({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, radius: 2, age: 0 });
});

function updatePopulationLabel(count = organisms.length) {
  if (count === 0) populationLabel.textContent = "Nothing lives here yet";
  else if (count === 1) populationLabel.textContent = "One small life";
  else populationLabel.textContent = `${count} small lives`;
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.035);
  lastTime = now;
  habitatAge += dt;
  const size = resizeDish();
  updateOrganisms(dt, size);
  updateFragments(dt, size);
  updateRipples(dt);
  drawBackground(size);
  fragments.forEach(fragment => {
    context.save();
    context.translate(fragment.x, fragment.y);
    drawPart(context, { ...fragment, x: 0, y: 0 }, clamp(1 - fragment.age / fragment.lifespan, 0, 1) * 0.82);
    context.restore();
  });
  organisms.forEach(drawOrganism);
  drawRipples();
  requestAnimationFrame(frame);
}

createPalette();
renderDraft();
requestAnimationFrame(frame);
