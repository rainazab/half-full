'use strict';
(async () => {
  const el = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
  const link = (title, url) => { const a = el('a', title); const parsed = new URL(url); if (['http:', 'https:'].includes(parsed.protocol)) a.href = parsed.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  try {
    const result = JSON.parse(localStorage.getItem('half-full-last-edition') || 'null');
    if (!result || result.edition?.mode !== 'live' || !Array.isArray(result.edition.stories) || !result.edition.date) throw Error('No saved edition');
    const requested = new URLSearchParams(location.search).get('date');
    if (requested && requested !== result.edition.date) throw Error('Selected date is unavailable offline');
    const stories = result.edition.stories;
    let index = 0;
    const container = document.getElementById('story');
    const back = document.getElementById('back'), next = document.getElementById('next'), review = document.getElementById('review');
    document.getElementById('date').textContent = `Saved edition for ${result.edition.date}. Retrieved ${result.edition.createdAt.slice(0,10)} (UTC). Reconnect to choose another day.`;
    function render(focus = true) {
      container.querySelectorAll('audio').forEach((audio) => audio.pause());
      container.replaceChildren();
      const heading = el('h2', index === stories.length ? 'You’re caught up.' : stories[index].headline); heading.tabIndex = -1; container.append(heading);
      document.getElementById('progress').textContent = index === stories.length ? `Complete · ${stories.length} stories` : `${index + 1} of ${stories.length}`;
      back.disabled = index === 0; next.hidden = index === stories.length; next.disabled = false; next.textContent = index === stories.length - 1 ? 'Finish edition' : 'Next'; review.hidden = index !== stories.length;
      if (index === stories.length) { container.append(el('p', `You’ve reached the end of ${stories.length} stories. Close the app and get on with your day.`)); }
      else {
        const story = stories[index];
        const visual = (story.media || []).find((m) => m.rights === 'licensed' && /^\/media\/[a-zA-Z0-9_.-]+$/.test(m.url) && m.licenseUrl);
        if (visual) { const image = el('img'); image.src = visual.url; image.alt = visual.alt; image.width = 220; image.onerror = () => image.remove(); container.append(image,el('p',visual.attribution),link('License',visual.licenseUrl)); }
        if (story.narration && /^\/demo-audio\/[a-zA-Z0-9_-]+\.mp3$/.test(story.narration.audioUrl || '')) {
          const audio = el('audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = story.narration.audioUrl;
          audio.onerror = () => container.append(el('p','Saved narration is unavailable; the full story remains readable.'));
          container.append(el('h3','Listen · archived Cartesia narration'), audio);
          const transcript = el('details'); transcript.append(el('summary','Read the narration'),el('p',story.narration.script)); container.append(transcript);
        }
        if (story.experience) { const deeper = el('details'); deeper.append(el('summary','Go deeper'),el('p',story.experience.background.text)); container.append(deeper);
          for (const term of story.experience.glossary) { const definition = el('details'); definition.append(el('summary',term.term),el('p',term.text)); container.append(definition); }
        }
        container.append(el('p', story.experience?.explanation.text || story.summary), el('h3', 'Why it matters'), el('p', story.whyItMatters), el('h3', 'What you can do'), el('p', story.action));
        const details = el('details'); details.append(el('summary', 'Sources and evidence'), el('p', story.verificationReason), el('p', `Evidence-supported, not independently fact-checked. Editor confidence estimate: ${Math.round(story.confidence*100)}%.`));
        for (const source of story.sources) { const p = el('p'); p.append(link(source.title, source.url), el('span', ` — ${source.publisher} · ${source.publishedAt ? source.publishedAt.slice(0,10) + ' (UTC)' : 'date unavailable'}`)); details.append(p); }
        for (const evidence of story.evidence || []) details.append(el('blockquote', evidence.excerpt));
        if (!story.evidence?.length) details.append(el('p', 'Detailed passages were not retained in this older snapshot.'));
        for (const limitation of story.limitations || []) details.append(el('p', limitation));
        container.append(details);
      }
      if (focus) heading.focus();
    }
    const go = (delta) => { index = Math.max(0, Math.min(stories.length, index + delta)); render(); };
    back.onclick = () => go(-1); next.onclick = () => go(1); review.onclick = () => { index = 0; render(); };
    document.addEventListener('keydown', (event) => { if (event.target.closest('a,button,summary,input') || event.ctrlKey || event.metaKey || event.altKey) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); go(event.key === 'ArrowLeft' ? -1 : 1); } });
    let start;
    container.style.touchAction = 'pan-y';
    container.addEventListener('pointerdown', (e) => { if (e.isPrimary && e.button === 0 && !e.target.closest('a,button,summary,input,audio')) start = { x:e.clientX,y:e.clientY,t:Date.now() }; });
    container.addEventListener('pointercancel', () => { start = null; });
    container.addEventListener('pointerup', (e) => { if (!start) return; const dx=e.clientX-start.x,dy=e.clientY-start.y,elapsed=Date.now()-start.t; start=null; if (elapsed<900 && Math.abs(dx)>=60 && Math.abs(dx)>Math.abs(dy)*1.4 && !window.getSelection()?.toString()) go(dx<0?1:-1); });
    const audit = document.getElementById('audit');
    for (const rejected of result.rejectedStories) { const article=el('article'); article.append(el('h3',rejected.title),el('p',rejected.verificationStatus==='uncertain'?'Insufficient evidence':'Excluded'),el('p',rejected.reason)); if(rejected.url) article.append(link('Original source',rejected.url)); audit.append(article); }
    audit.append(el('h3','Recorded generation log'));
    for (const entry of result.runLog) audit.append(el('p',`${entry.timestamp} · ${entry.step} (${entry.status}) — ${entry.message}`));
    render(false);
  } catch { document.getElementById('error').textContent = 'This date is not saved on this device. Reconnect to open its edition.'; }
})();
