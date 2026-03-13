// calendar-linker.js — Injects material links from roadmap-data.json into calendar HTML

document.addEventListener('DOMContentLoaded', async () => {
  let data;
  try {
    const resp = await fetch('roadmap-data.json');
    if (!resp.ok) return;
    data = await resp.json();
  } catch { return; }

  const blocks = document.querySelectorAll('.period-block');
  blocks.forEach(block => {
    const topicTag = block.querySelector('.topic-tag');
    if (!topicTag) return;
    const topicId = topicTag.textContent.trim();
    const lesson = data.lessons?.[topicId];
    if (!lesson?.urls) return;

    const row = document.createElement('div');
    row.className = 'materials-row';

    const types = [
      { key: 'worksheet', label: 'Worksheet', icon: '📝', cls: 'material-worksheet' },
      { key: 'drills', label: 'Drills', icon: '🎯', cls: 'material-drills' },
      { key: 'quiz', label: 'Quiz', icon: '📋', cls: 'material-quiz' },
      { key: 'blooket', label: 'Blooket', icon: '🎮', cls: 'material-blooket' },
    ];

    for (const t of types) {
      const url = lesson.urls[t.key];
      if (!url) continue;
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.className = `material-link ${t.cls}`;
      a.textContent = `${t.icon} ${t.label}`;
      row.appendChild(a);
    }

    // Videos: array of {url, title} objects
    const videos = lesson.urls.videos;
    if (Array.isArray(videos)) {
      videos.forEach((v, i) => {
        const url = typeof v === 'string' ? v : v.url;
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.className = 'material-link material-videos';
        a.textContent = videos.length === 1 ? '🎬 Video' : `🎬 Video ${i + 1}`;
        row.appendChild(a);
      });
    }

    if (row.children.length > 0) {
      block.appendChild(row);
    }
  });
});
