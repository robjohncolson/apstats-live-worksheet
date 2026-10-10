// All drawings use the submitted values, even when the completed answer is wrong.
// feedback: the relay's explanation of the first wrong pick in the last whole answer.
export function drawChallenge(ctx, { level, challenge, values, rejected, solved, feedback = null, text, ink }) {
  const { kind, labels } = challenge;
  text(ctx, solved ? 'TOGETHER! RESULT MATCHED.' : challenge.title, 360, 310, 17, ink, 'center');
  if (kind === 'interpret') {
    drawInterpretation(ctx, { challenge, values, solved, feedback, text, ink });
    return;
  }
  text(ctx, solved ? challenge.note : 'CHOOSE: ' + labels[values.length % labels.length], 360, 339, 10, ink, 'center');
  const colour = rejected ? '#d88673' : '#69ad91';
  ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.fillStyle = colour;
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const scale = (low, high, from = 105, to = 610) => value => from + (value - low) / (high - low || 1) * (to - from);
  if (kind === 'boxplot') {
    const all = [...challenge.answers, ...level.values.data];
    const x = scale(Math.min(...all), Math.max(...all));
    line(105, 445, 610, 445);
    if (values.length >= 4) {
      ctx.fillRect(x(values[1]), 425, x(values[3]) - x(values[1]), 40);
      ctx.strokeRect(x(values[1]), 425, x(values[3]) - x(values[1]), 40);
    }
    for (const i of [0, 2, 4]) if (i < values.length) line(x(values[i]), 425, x(values[i]), 465);
    for (const [a, b] of [[0, 1], [3, 4]]) if (b < values.length) line(x(values[a]), 445, x(values[b]), 445);
    if (level.procedureId === 'modified-boxplot' && values.length === 5) {
      for (const value of level.values.data.filter(value => value < values[0] || value > values[4])) ctx.fillRect(x(value) - 3, 442, 6, 6);
    }
  } else if (kind === 'dotplot') {
    const positions = [...new Set(level.values.data)].sort((a, b) => a - b);
    const x = scale(Math.min(...positions), Math.max(...positions), 130, 590);
    line(105, 480, 610, 480);
    positions.forEach((position, i) => {
      for (let dot = 0; dot < Math.max(0, Math.floor(values[i] || 0)); dot++) {
        ctx.beginPath(); ctx.arc(x(position), 468 - dot * 15, 5, 0, Math.PI * 2); ctx.fill();
      }
      text(ctx, String(position), x(position), 500, 12, ink, 'center');
    });
  } else if (kind === 'histogram') {
    const height = scale(0, Math.max(1, ...challenge.answers, ...values), 0, 120);
    // ZoomStat can add a trailing empty bin: share the axis instead of a fixed 100px bar.
    const step = 510 / Math.max(1, labels.length);
    line(100, 480, 620, 480);
    values.forEach((value, i) => ctx.fillRect(105 + i * step, 480 - height(value), step - 4, height(value)));
    labels.forEach((label, i) => text(ctx, label, 105 + i * step + step / 2, 500, labels.length > 5 ? 7 : 8, ink, 'center'));
  } else if (kind === 'scatter' || kind === 'regression') {
    const points = level.finalView.points || level.values.x_values.map((x, i) => ({ x, y: level.values.y_values[i] }));
    const x = scale(Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.x)));
    const y = scale(Math.min(0, ...points.map(p => p.y), ...values), Math.max(...points.map(p => p.y), ...values, 1), 480, 370);
    line(105, 480, 610, 480);
    if (kind === 'regression') {
      for (const p of points) ctx.fillRect(x(p.x) - 3, y(p.y) - 3, 6, 6);
      if (values.length >= 2) line(x(points[0].x), y(values[0] + values[1] * points[0].x), x(points.at(-1).x), y(values[0] + values[1] * points.at(-1).x));
    } else values.forEach((value, i) => {
      ctx.fillRect(x(points[i].x) - 5, y(value) - 5, 10, 10);
      text(ctx, 'x=' + points[i].x, x(points[i].x), 500, 9, ink, 'center');
    });
  } else if (kind === 'interval' || kind === 'quantile' || kind === 'probability') {
    const range = kind === 'probability' ? [0, 1] : [...challenge.answers, ...values];
    const lo = Math.min(...range), hi = Math.max(...range), pad = (hi - lo || Math.abs(lo) || 1) * .25;
    const x = scale(kind === 'probability' ? 0 : lo - pad, kind === 'probability' ? 1 : hi + pad);
    line(105, 440, 610, 440);
    if (kind === 'probability' && values.length) ctx.fillRect(105, 410, x(values[0]) - 105, 30);
    values.forEach(value => { line(x(value), 414, x(value), 460); text(ctx, String(value), x(value), 487, 12, ink, 'center'); });
    if (kind === 'interval' && values.length === 2) { ctx.lineWidth = 8; line(x(values[0]), 440, x(values[1]), 440); }
  } else if (kind === 'matrix') {
    for (let i = 0; i < level.values.rows * level.values.cols; i++) {
      const x = 220 + i % level.values.cols * 140, y = 360 + Math.floor(i / level.values.cols) * 50;
      ctx.strokeRect(x, y, 140, 50); text(ctx, values[i] == null ? '?' : String(values[i]), x + 70, y + 32, 18, ink, 'center');
    }
  } else {
    values.forEach((value, i) => {
      const x = 90 + i % 3 * 200, y = 368 + Math.floor(i / 3) * 75;
      ctx.fillRect(x, y, 180, 54);
      text(ctx, labels[i], x + 90, y + 18, 10, '#20232d', 'center');
      text(ctx, String(value), x + 90, y + 40, 16, '#20232d', 'center');
    });
  }
  if (['boxplot', 'regression'].includes(kind)) values.forEach((value, i) => {
    text(ctx, labels[i], 100 + i * 125, 373, 9, ink, 'center');
    text(ctx, String(value), 100 + i * 125, 396, 13, ink, 'center');
  });
  text(ctx, feedback ? feedback : rejected ? 'TRY AGAIN. THE CLOCK KEEPS RUNNING.'
    : 'CHECKED AFTER THE WHOLE ANSWER. VALUES ROUNDED TO 5 SIGNIFICANT DIGITS.', 360, 535, 9, ink, 'center');
}

// Interpretation rounds: the current question, the picks so far, and specific feedback.
// Size-14 lettering (two pixels per dot) wrapped to the 680px stage stays readable on phones.
function drawInterpretation(ctx, { challenge, values, solved, feedback, text, ink }) {
  const { questions } = challenge;
  if (solved) wrap(challenge.note, 52).forEach((line, i) => text(ctx, line, 360, 345 + i * 20, 14, ink, 'center'));
  else {
    const index = values.length % questions.length;
    text(ctx, 'QUESTION ' + (index + 1) + ' OF ' + questions.length, 360, 337, 10, ink, 'center');
    wrap(questions[index].prompt, 52).forEach((line, i) => text(ctx, line, 360, 362 + i * 20, 14, ink, 'center'));
  }
  // Picks already made in this attempt (nothing is judged until the whole answer is in).
  values.forEach((value, i) => {
    const option = questions[i].options.find(option => option.key === String(value));
    text(ctx, (i + 1) + '. ' + questions[i].label + ': ' + (option?.text ?? value), 360, 412 + i * 18, 10, ink, 'center');
  });
  if (feedback) {
    const lines = wrap('NOT YET. ' + feedback, 52);
    lines.forEach((line, i) => text(ctx, line, 360, 548 - (lines.length - 1 - i) * 20, 14, '#b4442c', 'center'));
    return;
  }
  text(ctx, solved ? 'YOUR ANSWERS MATCH.' : 'CHECKED AFTER THE LAST QUESTION. CLICK A CHOICE, PRESS ITS NUMBER, OR STAND ON IT.',
    360, 548, 9, ink, 'center');
}

// Greedy word wrap for pixel lettering.
function wrap(value, max) {
  const lines = [];
  for (const word of String(value).split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && (lines[last] + ' ' + word).length <= max) lines[last] += ' ' + word;
    else lines.push(word);
  }
  return lines;
}
